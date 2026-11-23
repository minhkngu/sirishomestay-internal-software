import { and, eq, inArray, ne } from 'drizzle-orm'
import { assets, depositContracts, docTemplates, invoiceTemplates, leaseOccupants, leases, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/modules/platform'
import { captureContractVersion } from './history'
import { createAssetInTransaction, moveAssetsInTransaction, setAssetStatusInTransaction } from '@/modules/assets'
import { loadRoom, loadTenant, checkMoney, checkDate } from './shared'
import { insertLease } from './lease-insert'
import { applyLeaseFeeEdits } from './lease-fees'
import type { LeaseCreated, LeaseInput, LeaseEditInput } from './lease-types'

export { nextLeaseCode, listLeases, listLeaseOccupants, getLease } from './lease-queries'
export type { LeaseListItem, LeaseDetail } from './lease-queries'
export type { LeaseFeeInput, LeaseInput, LeaseCreated, LeaseEditInput } from './lease-types'

export async function createLease(db: DB, ctx: AccessContext, input: LeaseInput): Promise<LeaseCreated> {
  return db.transaction(async (tx) => insertLease(tx as unknown as DB, ctx, input, null))
}

export async function convertDepositToLease(
  db: DB,
  ctx: AccessContext,
  depositId: string,
  input: LeaseInput,
): Promise<LeaseCreated> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(depositContracts).where(eq(depositContracts.id, depositId))
    if (!c) throw new NotFoundError()
    await loadRoom(tx, ctx, c.roomId)
    if (c.status !== 'pending') throw new ValidationError('Hợp đồng cọc không còn ở trạng thái chờ')
    if (c.roomId !== input.roomId) throw new ValidationError('Hợp đồng cọc thuộc phòng khác')
    const r = await insertLease(tx as unknown as DB, ctx, input, depositId)
    await tx
      .update(depositContracts)
      .set({ status: 'converted', updatedAt: new Date() })
      .where(eq(depositContracts.id, depositId))
    return r
  })
}

// ------------------------------------------------------------------ sửa hợp đồng

export async function updateLease(
  db: DB,
  ctx: AccessContext,
  id: string,
  input: LeaseEditInput,
  confirmedSigned: boolean,
): Promise<void> {
  await db.transaction(async (raw) => {
    const tx = raw as unknown as DB
    const [before] = await tx.select().from(leases).where(eq(leases.id, id)).for('update')
    if (!before) throw new NotFoundError()
    await loadRoom(tx, ctx, before.roomId)
    const target = await loadRoom(tx, ctx, input.roomId)
    await loadTenant(tx, ctx, input.tenantId)
    if (before.signStatus === 'signed' && confirmedSigned !== true)
      throw new ValidationError('Cần xác nhận sửa hợp đồng đã ký')
    checkDate(input.startDate)
    checkDate(input.endDate)
    checkMoney(input.monthlyRent)
    checkMoney(input.depositAmount)
    if (input.endDate < input.startDate) throw new ValidationError('Ngày kết thúc phải sau ngày bắt đầu')
    if (!target.isActive && target.id !== before.roomId) throw new ValidationError('Phòng đã ngừng sử dụng')
    if (before.status === 'active') {
      const [other] = await tx
        .select()
        .from(leases)
        .where(and(eq(leases.roomId, input.roomId), eq(leases.status, 'active'), ne(leases.id, id)))
      if (other) throw new ValidationError('Phòng đã có hợp đồng đang hiệu lực')
    }
    if (input.invoiceTemplateId) {
      const [template] = await tx
        .select({ id: invoiceTemplates.id })
        .from(invoiceTemplates)
        .where(eq(invoiceTemplates.id, input.invoiceTemplateId))
      if (!template) throw new ValidationError('Mẫu hóa đơn không hợp lệ')
    }
    if (input.contractTemplateId) {
      const [template] = await tx.select().from(docTemplates).where(eq(docTemplates.id, input.contractTemplateId))
      if (!template || template.docType !== 'lease' || !template.body)
        throw new ValidationError('Mẫu hợp đồng không hợp lệ hoặc chưa sẵn sàng')
    }
    if (input.fees !== undefined) await applyLeaseFeeEdits(tx, ctx, id, input.fees, input.roomId, input.startDate)
    await captureContractVersion(tx, ctx, 'lease', id, 'edit')
    const [after] = await tx
      .update(leases)
      .set({
        roomId: input.roomId,
        tenantId: input.tenantId,
        startDate: input.startDate,
        endDate: input.endDate,
        monthlyRent: input.monthlyRent,
        depositAmount: input.depositAmount,
        note: input.note ?? '',
        ...(input.contractTemplateId !== undefined && { contractTemplateId: input.contractTemplateId }),
        ...(input.invoiceTemplateId !== undefined && { invoiceTemplateId: input.invoiceTemplateId }),
        updatedAt: new Date(),
      })
      .where(eq(leases.id, id))
      .returning()
    // Đổi người đại diện (bên ký): người cũ vẫn ở lại, người mới được thêm vào danh sách người ở nếu chưa có
    if (before.tenantId !== input.tenantId)
      await tx.insert(leaseOccupants).values({ leaseId: id, tenantId: input.tenantId }).onConflictDoNothing()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'lease',
      entityId: id,
      facilityId: target.facilityId,
      summary: `Sửa hợp đồng thuê ${before.code}`,
      before,
      after,
    })
  })
}

export type LeaseAssetChanges = {
  /** Tài sản có sẵn của cơ sở đưa vào phòng. */
  add: string[]
  /** Tài sản mới tạo thẳng trong phòng. */
  create: { code: string; name: string; model: string; category: string; value: number; condition: string }[]
  /** Tài sản đang trong phòng: thanh lý hoặc chuyển về kho của cơ sở. */
  remove: { assetId: string; action: 'dispose' | 'warehouse' }[]
}

/** Cập nhật tài sản trong phòng của hợp đồng thuê (một giao dịch). Biên bản bàn giao lấy danh sách theo tài sản trong phòng nên tự cập nhật theo. */
export async function updateLeaseAssets(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  changes: LeaseAssetChanges,
): Promise<void> {
  await db.transaction(async (raw) => {
    const tx = raw as unknown as DB
    const [row] = await tx
      .select({ roomId: leases.roomId, facilityId: rooms.facilityId })
      .from(leases)
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .where(eq(leases.id, leaseId))
    if (!row) throw new NotFoundError()
    assertCan(ctx, 'assets', row.facilityId)
    const inRoom = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.locationKind, 'room'), eq(assets.locationId, row.roomId), ne(assets.status, 'disposed')))
    const roomIds = new Set(inRoom.map((a) => a.id))
    for (const r of changes.remove) {
      if (!roomIds.has(r.assetId)) throw new ValidationError('Tài sản không nằm trong phòng này')
      if (r.action === 'dispose') await setAssetStatusInTransaction(tx, ctx, r.assetId, 'disposed')
      else if (r.action === 'warehouse')
        await moveAssetsInTransaction(
          tx,
          ctx,
          [r.assetId],
          { kind: 'warehouse', id: row.facilityId },
          'Cập nhật hợp đồng',
        )
      else throw new ValidationError('Cách xử lý tài sản không hợp lệ')
    }
    if (changes.add.length) {
      const found = await tx.select().from(assets).where(inArray(assets.id, changes.add))
      if (
        found.length !== new Set(changes.add).size ||
        found.some((a) => a.facilityId !== row.facilityId || a.status === 'disposed' || roomIds.has(a.id))
      )
        throw new ValidationError('Tài sản không hợp lệ hoặc không thuộc cơ sở')
      await moveAssetsInTransaction(tx, ctx, changes.add, { kind: 'room', id: row.roomId }, 'Cập nhật hợp đồng')
    }
    for (const asset of changes.create)
      await createAssetInTransaction(tx, ctx, {
        ...asset,
        facilityId: row.facilityId,
        location: { kind: 'room', id: row.roomId },
      })
  })
}
