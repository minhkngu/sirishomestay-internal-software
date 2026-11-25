import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { depositContracts, depositEntries, leases, rooms, tenants } from '@/db'
import type { AgreedFee } from '@/db/schema/contracts'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { depositBalance } from '@/domain/deposit'
import { recordAudit } from '@/modules/platform'
import { captureContractVersion } from './history'
import { loadRoom, loadTenant, toDomainEntry, checkMoney, checkDate, type DepositContract } from './shared'

// ------------------------------------------------------------------ hợp đồng cọc

export type DepositInput = {
  roomId: string
  tenantId: string
  depositAmount: number
  agreedDeposit?: number | null
  agreedRent: number
  agreedFees?: AgreedFee[] | null
  expectedMoveIn: string
  collected?: boolean
}

export async function createDepositContract(
  db: DB,
  ctx: AccessContext,
  input: DepositInput,
): Promise<{ contract: DepositContract; warnings: string[] }> {
  const room = await loadRoom(db, ctx, input.roomId)
  await loadTenant(db, ctx, input.tenantId)
  if (!room.isActive) throw new ValidationError('Phòng đã ngừng sử dụng')
  if (input.depositAmount < 0 || input.agreedRent < 0 || (input.agreedDeposit ?? 0) < 0)
    throw new ValidationError('Số tiền không hợp lệ')
  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select()
      .from(depositContracts)
      .where(and(eq(depositContracts.roomId, room.id), eq(depositContracts.status, 'pending')))
    if (dup) throw new ValidationError('Phòng đã có hợp đồng cọc đang chờ')
    const warnings: string[] = []
    const [active] = await tx
      .select()
      .from(leases)
      .where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
    if (active && input.expectedMoveIn < active.endDate) {
      warnings.push(
        `Ngày vào ở dự kiến trước ngày kết thúc của hợp đồng hiện tại (${active.endDate.split('-').reverse().join('/')})`,
      )
    }
    const [contract] = await tx
      .insert(depositContracts)
      .values({
        roomId: room.id,
        tenantId: input.tenantId,
        depositAmount: input.depositAmount,
        agreedDeposit: input.agreedDeposit ?? input.agreedRent,
        agreedRent: input.agreedRent,
        agreedFees: input.agreedFees ?? null,
        expectedMoveIn: input.expectedMoveIn,
      })
      .returning()
    if (input.depositAmount > 0) {
      await tx.insert(depositEntries).values({
        depositContractId: contract.id,
        date: todayVN(),
        type: 'collect',
        amount: input.depositAmount,
        status: input.collected === false ? 'pending' : 'done',
        method: 'cash',
        note: 'Cọc giữ chỗ',
      })
    }
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'deposit_contract',
      entityId: contract.id,
      facilityId: room.facilityId,
      summary: `Tạo hợp đồng cọc phòng ${room.code}`,
      after: contract,
    })
    return { contract, warnings }
  })
}

/** Huỷ cọc: mất cọc ghi dòng `forfeit` (đã xong); hoàn cọc ghi dòng `refund` chờ chi. */
export async function cancelDepositContract(
  db: DB,
  ctx: AccessContext,
  id: string,
  outcome: 'forfeit' | 'refund',
): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(depositContracts).where(eq(depositContracts.id, id))
    if (!c) throw new NotFoundError()
    const room = await loadRoom(tx, ctx, c.roomId)
    if (c.status !== 'pending') throw new ValidationError('Hợp đồng cọc không còn ở trạng thái chờ')
    const entries = await tx.select().from(depositEntries).where(eq(depositEntries.depositContractId, id))
    const held = depositBalance(entries.map(toDomainEntry))
    await tx
      .update(depositContracts)
      .set({ status: 'cancelled', cancelOutcome: outcome, updatedAt: new Date() })
      .where(eq(depositContracts.id, id))
    if (held > 0) {
      await tx.insert(depositEntries).values({
        depositContractId: id,
        date: todayVN(),
        type: outcome,
        amount: held,
        status: outcome === 'forfeit' ? 'done' : 'pending',
        note: outcome === 'forfeit' ? 'Mất cọc do huỷ hợp đồng cọc' : 'Hoàn cọc do huỷ hợp đồng cọc',
      })
    }
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'deposit_contract',
      entityId: id,
      facilityId: room.facilityId,
      summary: `Huỷ hợp đồng cọc (${outcome === 'forfeit' ? 'mất cọc' : 'hoàn cọc'})`,
      before: { status: c.status },
      after: { status: 'cancelled', outcome },
    })
  })
}

export async function getPendingDepositContract(
  db: DB,
  ctx: AccessContext,
  roomId: string,
): Promise<DepositContract | null> {
  await loadRoom(db, ctx, roomId)
  const [c] = await db
    .select()
    .from(depositContracts)
    .where(and(eq(depositContracts.roomId, roomId), eq(depositContracts.status, 'pending')))
  return c ?? null
}

export async function updateDepositContract(
  db: DB,
  ctx: AccessContext,
  id: string,
  input: DepositInput,
  confirmedSigned: boolean,
): Promise<void> {
  await db.transaction(async (raw) => {
    const tx = raw as unknown as DB
    const [before] = await tx.select().from(depositContracts).where(eq(depositContracts.id, id)).for('update')
    if (!before) throw new NotFoundError()
    await loadRoom(tx, ctx, before.roomId)
    const room = await loadRoom(tx, ctx, input.roomId)
    await loadTenant(tx, ctx, input.tenantId)
    if (before.signStatus === 'signed' && confirmedSigned !== true)
      throw new ValidationError('Cần xác nhận sửa hợp đồng đã ký')
    checkMoney(input.depositAmount)
    if (input.agreedDeposit != null) checkMoney(input.agreedDeposit)
    checkMoney(input.agreedRent)
    checkDate(input.expectedMoveIn)
    if (!room.isActive && room.id !== before.roomId) throw new ValidationError('Phòng đã ngừng sử dụng')
    if (before.status === 'pending') {
      const [other] = await tx
        .select()
        .from(depositContracts)
        .where(
          and(
            eq(depositContracts.roomId, input.roomId),
            eq(depositContracts.status, 'pending'),
            ne(depositContracts.id, id),
          ),
        )
      if (other) throw new ValidationError('Phòng đã có hợp đồng cọc đang chờ')
    }
    await captureContractVersion(tx, ctx, 'deposit', id, 'edit')
    const [after] = await tx
      .update(depositContracts)
      .set({
        roomId: input.roomId,
        tenantId: input.tenantId,
        depositAmount: input.depositAmount,
        ...(input.agreedDeposit !== undefined && { agreedDeposit: input.agreedDeposit }),
        agreedRent: input.agreedRent,
        ...(input.agreedFees !== undefined && { agreedFees: input.agreedFees }),
        expectedMoveIn: input.expectedMoveIn,
        updatedAt: new Date(),
      })
      .where(eq(depositContracts.id, id))
      .returning()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'deposit_contract',
      entityId: id,
      facilityId: room.facilityId,
      summary: 'Sửa hợp đồng cọc',
      before,
      after,
    })
  })
}

// ------------------------------------------------------------------ hợp đồng cọc: danh sách / chi tiết

export type DepositListItem = DepositContract & { roomCode: string; facilityId: string; tenantName: string }

export async function listDepositContracts(
  db: DB,
  ctx: AccessContext,
  opts: { status?: 'pending' | 'converted' | 'cancelled'; facilityId?: string; facilityIds?: string[] },
): Promise<DepositListItem[]> {
  assertCan(ctx, 'tenants_contracts', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(rooms.facilityId, scope))
  if (opts.facilityId) conds.push(eq(rooms.facilityId, opts.facilityId))
  if (opts.facilityIds?.length)
    conds.push(
      inArray(
        rooms.facilityId,
        opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
      ),
    )
  if (opts.status) conds.push(eq(depositContracts.status, opts.status))
  const rows = await db
    .select({
      c: depositContracts,
      roomCode: rooms.code,
      facilityId: rooms.facilityId,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
    })
    .from(depositContracts)
    .innerJoin(rooms, eq(rooms.id, depositContracts.roomId))
    .innerJoin(tenants, eq(tenants.id, depositContracts.tenantId))
    .where(and(...conds))
    .orderBy(asc(depositContracts.expectedMoveIn))
  return rows.map((r) => ({
    ...r.c,
    roomCode: r.roomCode,
    facilityId: r.facilityId,
    tenantName: r.fullName ?? r.companyName ?? '',
  }))
}

export async function getDepositContract(
  db: DB,
  ctx: AccessContext,
  id: string,
): Promise<DepositListItem & { entries: (typeof depositEntries.$inferSelect)[] }> {
  const [row] = await db
    .select({
      c: depositContracts,
      roomCode: rooms.code,
      facilityId: rooms.facilityId,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
    })
    .from(depositContracts)
    .innerJoin(rooms, eq(rooms.id, depositContracts.roomId))
    .innerJoin(tenants, eq(tenants.id, depositContracts.tenantId))
    .where(eq(depositContracts.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  const entries = await db
    .select()
    .from(depositEntries)
    .where(eq(depositEntries.depositContractId, id))
    .orderBy(asc(depositEntries.createdAt))
  return {
    ...row.c,
    roomCode: row.roomCode,
    facilityId: row.facilityId,
    tenantName: row.fullName ?? row.companyName ?? '',
    entries,
  }
}
