import { and, asc, eq, inArray, like, lte, ne } from 'drizzle-orm'
import {
  assets,
  depositContracts,
  depositEntries,
  docTemplates,
  facilities,
  feeTypes,
  feeUnits,
  handoverItems,
  invoiceTemplates,
  leaseFees,
  leaseFeeSnapshots,
  leaseOccupants,
  leases,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, facilityScope, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { addDays, todayVN } from '@/domain/dates'
import { depositBalance } from '@/domain/deposit'
import { MAX_MONEY } from '@/domain/money'
import { buildFirstInvoice } from '@/domain/invoice-builder'
import { contractTermsAt } from '@/domain/contract-terms'
import type { ContractFee, InvoiceLineInput, LeaseTerms, Proration } from '@/domain/types'
import { recordAudit } from '@/server/audit'
import { captureContractVersion } from './history'
import { ensureFeeMeter } from '@/server/meters/service'
import { createAssetInTransaction, moveAssetsInTransaction, setAssetStatusInTransaction } from '@/server/assets/service'
import { startHandoverInTransaction } from '@/server/handovers/service'
import { leaseData, loadAddenda } from '@/server/invoices/service'
import { getSettings } from '@/server/settings/service'
import { loadRoom, loadTenant, toDomainEntry, checkMoney, checkDate, type Lease } from './shared'

export async function nextLeaseCode(tx: Pick<DB, 'select'>, facilityCode: string, startDate: string): Promise<string> {
  const prefix = `${facilityCode}-HĐ-${startDate.slice(0, 4)}-`
  const rows = await tx
    .select({ code: leases.code })
    .from(leases)
    .where(like(leases.code, `${prefix}%`))
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

async function contractFees(tx: Pick<DB, 'select'>, leaseId: string): Promise<ContractFee[]> {
  const [lease] = await tx.select({ feeModel: leases.feeModel }).from(leases).where(eq(leases.id, leaseId))
  if (lease?.feeModel === 'snapshot') {
    const rows = await tx.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, leaseId))
    return rows.map((f) => ({
      leaseFeeId: f.id,
      feeTypeId: f.feeTypeId,
      name: f.name,
      unit: f.unit,
      billing: f.billing as ContractFee['billing'],
      quantityFrom: f.quantitySource === 'occupants' ? ('occupants' as const) : ('manual' as const),
      quantitySource: f.quantitySource as NonNullable<ContractFee['quantitySource']>,
      quantity: f.quantity,
      unitPrice: f.unitPrice,
    }))
  }
  const rows = await tx
    .select({ f: leaseFees, t: feeTypes, u: feeUnits })
    .from(leaseFees)
    .innerJoin(feeTypes, eq(feeTypes.id, leaseFees.feeTypeId))
    .innerJoin(feeUnits, eq(feeUnits.id, feeTypes.unitId))
    .where(eq(leaseFees.leaseId, leaseId))
  return rows.map(({ f, t, u }) => ({
    leaseFeeId: f.id,
    feeTypeId: t.id,
    name: t.name,
    unit: u.name,
    billing: t.billing as ContractFee['billing'],
    quantityFrom: t.quantityFrom as ContractFee['quantityFrom'],
    quantity: f.quantity,
    unitPrice: f.unitPrice,
  }))
}

// ------------------------------------------------------------------ hợp đồng thuê

export type LeaseFeeInput = {
  feeTypeId: string | null
  name: string
  unit: string
  quantitySource: 'occupants' | 'room' | 'meter' | 'period_input'
  unitPrice: number
  quantity?: number
  initialReading?: number
  existingMeterId?: string
}
type LegacyFeeInput = { feeTypeId: string; quantity: number; unitPrice: number }
export type LeaseInput = {
  roomId: string
  tenantId: string
  occupantIds?: string[]
  startDate: string
  endDate: string
  monthlyRent: number
  depositAmount: number
  receivedDeposit?: number
  note?: string
  contractTemplateId?: string | null
  invoiceTemplateId?: string | null
  handover?: {
    expectedRoomAssetIds: string[]
    addAssetIds: string[]
    expectedAddedLocations?: Array<{ assetId: string; kind: string; id: string }>
    newAssets: Array<{ code: string; name: string; model: string; category: string; value: number; condition: string }>
    remove: Array<
      | { assetId: string; action: 'dispose' }
      | { assetId: string; action: 'move'; to: { kind: 'warehouse' | 'room'; id: string } }
    >
    conditions?: Array<{ assetCode: string; condition: string }>
  }
  feeModel?: 'legacy' | 'snapshot'
  fees?: LegacyFeeInput[] | LeaseFeeInput[]
  dueRule?: unknown
  proration?: Proration | null
  billingCycleMonths?: number
  billWaterByMeter?: boolean
}

export type LeaseCreated = {
  lease: Lease
  firstInvoiceLines: InvoiceLineInput[]
  warnings: string[]
  handoverItems: Array<{ assetCode: string; itemId: string }>
}

async function insertLease(
  tx: DB,
  ctx: AccessContext,
  input: LeaseInput,
  fromDepositId: string | null,
): Promise<LeaseCreated> {
  const room = await loadRoom(tx, ctx, input.roomId)
  const tenant = await loadTenant(tx, ctx, input.tenantId)
  if (input.invoiceTemplateId) {
    const [template] = await tx
      .select({ id: invoiceTemplates.id })
      .from(invoiceTemplates)
      .where(eq(invoiceTemplates.id, input.invoiceTemplateId))
    if (!template)
      throw new ValidationError('Mẫu hóa đơn không hợp lệ', { invoiceTemplateId: 'Chọn mẫu hóa đơn hợp lệ' })
  }
  if (input.contractTemplateId) {
    const [template] = await tx.select().from(docTemplates).where(eq(docTemplates.id, input.contractTemplateId))
    if (!template || template.docType !== 'lease' || !template.body)
      throw new ValidationError('Mẫu hợp đồng không hợp lệ hoặc chưa sẵn sàng', {
        contractTemplateId: 'Chọn mẫu hợp đồng hợp lệ',
      })
  }
  if (input.endDate < input.startDate)
    throw new ValidationError('Ngày kết thúc phải sau ngày bắt đầu', { endDate: 'Ngày kết thúc phải sau ngày bắt đầu' })
  if (input.monthlyRent < 0 || input.depositAmount < 0) throw new ValidationError('Số tiền không hợp lệ')
  // Cột tiền là số nguyên 32 bit; vượt thì Postgres báo lỗi khó hiểu, nên chặn sớm với thông báo rõ
  if (input.monthlyRent > MAX_MONEY)
    throw new ValidationError('Tiền thuê quá lớn (tối đa 2.147.483.647)', { monthlyRent: 'Tiền thuê quá lớn' })
  if (input.depositAmount > MAX_MONEY)
    throw new ValidationError('Tiền cọc quá lớn (tối đa 2.147.483.647)', { depositAmount: 'Tiền cọc quá lớn' })
  const occupants =
    input.feeModel === 'snapshot'
      ? [...new Set([tenant.id, ...(input.occupantIds ?? [])])]
      : [...new Set(input.occupantIds?.length ? input.occupantIds : [tenant.id])]
  if (occupants.length === 0)
    throw new ValidationError('Chọn ít nhất một người ở', { occupantIds: 'Chọn ít nhất một người ở' })
  for (const o of occupants) {
    const occupant = await loadTenant(tx, ctx, o)
    if (input.feeModel !== 'snapshot' && occupant.kind === 'company' && occupant.id !== tenant.id)
      throw new ValidationError('Người ở phải là khách cá nhân', { occupantIds: 'Người ở phải là khách cá nhân' })
  }

  const [active] = await tx
    .select()
    .from(leases)
    .where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
  if (active) throw new ValidationError('Phòng đã có hợp đồng trong khoảng thời gian này')

  const [fac] = await tx.select().from(facilities).where(eq(facilities.id, room.facilityId))
  const code = await nextLeaseCode(tx, fac.code, input.startDate)
  const [lease] = await tx
    .insert(leases)
    .values({
      code,
      roomId: room.id,
      tenantId: tenant.id,
      startDate: input.startDate,
      endDate: input.endDate,
      monthlyRent: input.monthlyRent,
      depositAmount: input.depositAmount,
      note: input.note ?? '',
      contractTemplateId: input.contractTemplateId ?? null,
      invoiceTemplateId: input.invoiceTemplateId ?? null,
      feeModel: input.feeModel ?? 'legacy',
      dueRule: input.dueRule ?? null,
      proration: input.proration ?? null,
      billingCycleMonths: input.billingCycleMonths ?? 1,
      billWaterByMeter: input.billWaterByMeter ?? true,
      fromDepositContractId: fromDepositId,
    })
    .returning()
  await tx.insert(leaseOccupants).values(occupants.map((tenantId) => ({ leaseId: lease.id, tenantId })))
  if (input.fees?.length && input.feeModel === 'snapshot') {
    const fees = input.fees as LeaseFeeInput[]
    // Phí tính theo đồng hồ được thêm nhiều dòng cùng loại (mỗi dòng một đồng hồ); các phí khác chỉ một dòng mỗi loại
    const meterIds = fees.flatMap((f) => (f.existingMeterId ? [f.existingMeterId] : []))
    if (new Set(meterIds).size !== meterIds.length) throw new ValidationError('Đồng hồ bị chọn trùng')
    const seenCommon = new Set<string>()
    for (const fee of input.fees as LeaseFeeInput[]) {
      if (
        !Number.isSafeInteger(fee.unitPrice) ||
        fee.unitPrice < 0 ||
        fee.unitPrice > 2_147_483_647 ||
        !['occupants', 'room', 'meter', 'period_input'].includes(fee.quantitySource)
      )
        throw new ValidationError('Phí dịch vụ không hợp lệ')
      let name = fee.name?.trim(),
        unit = fee.unit?.trim(),
        source: NonNullable<ContractFee['quantitySource']> = fee.quantitySource
      let billing: ContractFee['billing'] =
        source === 'meter' || source === 'period_input' ? 'per_occurrence' : 'monthly_fixed'
      if (fee.feeTypeId) {
        const [row] = await tx
          .select({ type: feeTypes, unit: feeUnits })
          .from(feeTypes)
          .innerJoin(feeUnits, eq(feeTypes.unitId, feeUnits.id))
          .where(eq(feeTypes.id, fee.feeTypeId))
        if (!row || !row.type.isActive) throw new ValidationError('Loại phí không tồn tại hoặc đã lưu trữ')
        name = row.type.name
        unit = row.unit.name
        billing = row.type.billing as ContractFee['billing']
        source =
          row.type.quantityFrom === 'manual'
            ? 'legacy_fixed'
            : (row.type.quantityFrom as LeaseFeeInput['quantitySource'])
      }
      // Chỉ phí theo đồng hồ được nhiều dòng cùng loại; dùng nguồn số lượng thật của loại phí, không tin dữ liệu client
      if (fee.feeTypeId && source !== 'meter') {
        if (seenCommon.has(fee.feeTypeId)) throw new ValidationError('Phí hoặc đồng hồ bị chọn trùng')
        seenCommon.add(fee.feeTypeId)
      }
      if (!name || !unit) throw new ValidationError('Nhập tên và đơn vị phí')
      const quantity = source === 'legacy_fixed' ? (fee.quantity ?? 1) : 1
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2_147_483_647)
        throw new ValidationError('Số lượng phí không hợp lệ')
      const [savedFee] = await tx
        .insert(leaseFeeSnapshots)
        .values({
          leaseId: lease.id,
          feeTypeId: fee.feeTypeId,
          name,
          unit,
          quantitySource: source,
          quantity,
          billing,
          unitPrice: fee.unitPrice,
        })
        .returning()
      if (source === 'meter')
        await ensureFeeMeter(tx, ctx, {
          roomId: room.id,
          feeTypeId: fee.feeTypeId,
          leaseFeeId: savedFee.id,
          initialReading: fee.initialReading,
          existingMeterId: fee.existingMeterId,
          installedOn: input.startDate,
        })
    }
  } else if (input.fees?.length)
    await tx.insert(leaseFees).values((input.fees as LegacyFeeInput[]).map((f) => ({ leaseId: lease.id, ...f })))

  // sổ cọc: cọc giữ chỗ chuyển sang hợp đồng thuê; phần còn thiếu ghi dòng thu chờ
  let held = 0
  if (fromDepositId) {
    const moved = await tx
      .update(depositEntries)
      .set({ leaseId: lease.id, updatedAt: new Date() })
      .where(and(eq(depositEntries.depositContractId, fromDepositId), eq(depositEntries.status, 'done')))
      .returning()
    held = depositBalance(moved.map(toDomainEntry))
  }
  const received = input.receivedDeposit ?? held
  if (
    !Number.isSafeInteger(input.depositAmount) ||
    !Number.isSafeInteger(received) ||
    received < held ||
    received < 0 ||
    received > input.depositAmount
  ) {
    throw new ValidationError('Tiền cọc thực nhận không hợp lệ', {
      receivedDeposit: 'Tiền thực nhận phải từ số cọc kế thừa đến số cọc hợp đồng',
    })
  }
  if (received > held) {
    await tx.insert(depositEntries).values({
      leaseId: lease.id,
      date: todayVN(),
      type: 'collect',
      amount: received - held,
      status: 'done',
      note: 'Cọc thực nhận khi tạo hợp đồng',
    })
  }
  const missing = input.depositAmount - received
  if (missing > 0) {
    await tx.insert(depositEntries).values({
      leaseId: lease.id,
      date: input.startDate,
      type: 'collect',
      amount: missing,
      status: 'pending',
      note: 'Cọc còn thiếu theo hợp đồng thuê',
    })
  }

  let createdHandoverItems: Array<{ assetCode: string; itemId: string }> = []
  if (input.handover) {
    const h = input.handover
    if (h.addAssetIds.length || h.newAssets.length || h.remove.length) assertCan(ctx, 'assets', room.facilityId)
    // Khóa cơ sở của phòng và mọi cơ sở đích của việc di chuyển theo một thứ tự cố định, tránh deadlock khi hai hợp đồng chuyển chéo cơ sở
    const targetFacilities: string[] = []
    for (const item of h.remove) {
      if (item.action !== 'move' || !item.to) continue
      if (
        typeof item.to.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.to.id)
      )
        throw new ValidationError('Đích di chuyển không hợp lệ')
      if (item.to.kind === 'warehouse') targetFacilities.push(item.to.id)
      else if (item.to.kind === 'room') {
        const [r] = await tx.select({ f: rooms.facilityId }).from(rooms).where(eq(rooms.id, item.to.id))
        if (r) targetFacilities.push(r.f)
      }
    }
    for (const id of [...new Set([room.facilityId, ...targetFacilities])].sort())
      await tx.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, id)).for('update')
    const current = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.locationKind, 'room'), eq(assets.locationId, room.id), ne(assets.status, 'disposed')))
      .for('update')
    const expected = new Set(h.expectedRoomAssetIds)
    const added = new Set(h.addAssetIds)
    const removed = new Set(h.remove.map((x) => x.assetId))
    if (
      expected.size !== h.expectedRoomAssetIds.length ||
      added.size !== h.addAssetIds.length ||
      removed.size !== h.remove.length ||
      current.length !== expected.size ||
      current.some((a) => !expected.has(a.id)) ||
      h.remove.some((x) => !expected.has(x.assetId)) ||
      h.addAssetIds.some((id) => expected.has(id))
    ) {
      throw new ValidationError('Danh sách tài sản đã thay đổi hoặc không hợp lệ, vui lòng tải lại')
    }
    if (h.addAssetIds.length) {
      const additions = await tx.select().from(assets).where(inArray(assets.id, h.addAssetIds)).for('update')
      if (
        additions.length !== h.addAssetIds.length ||
        additions.some(
          (a) =>
            a.facilityId !== room.facilityId ||
            a.status === 'disposed' ||
            !h.expectedAddedLocations?.some(
              (loc) => loc.assetId === a.id && loc.kind === a.locationKind && loc.id === a.locationId,
            ),
        )
      )
        throw new ValidationError('Tài sản không hợp lệ hoặc không thuộc cơ sở')
      await moveAssetsInTransaction(tx, ctx, h.addAssetIds, { kind: 'room', id: room.id }, 'Bàn giao nhận phòng')
    }
    for (const item of h.remove) {
      if (item.action === 'dispose') await setAssetStatusInTransaction(tx, ctx, item.assetId, 'disposed')
      else if (
        item.action === 'move' &&
        item.to &&
        (item.to.kind === 'warehouse' || item.to.kind === 'room') &&
        typeof item.to.id === 'string'
      ) {
        if (item.to.kind === 'room' && item.to.id === room.id)
          throw new ValidationError('Không thể chuyển tài sản vào chính phòng đang lập hợp đồng')
        await moveAssetsInTransaction(tx, ctx, [item.assetId], item.to, 'Bàn giao nhận phòng')
      } else throw new ValidationError('Cách xử lý tài sản không hợp lệ')
    }
    for (const asset of h.newAssets)
      await createAssetInTransaction(tx, ctx, {
        ...asset,
        facilityId: room.facilityId,
        location: { kind: 'room', id: room.id },
      })
    const handover = await startHandoverInTransaction(tx, ctx, lease.id, 'check_in')
    createdHandoverItems = await tx
      .select({ assetCode: assets.code, itemId: handoverItems.id })
      .from(handoverItems)
      .innerJoin(assets, eq(assets.id, handoverItems.assetId))
      .where(eq(handoverItems.handoverId, handover.id))
    const conditions = h.conditions ?? []
    if (
      !Array.isArray(conditions) ||
      conditions.some((c) => !c || typeof c.assetCode !== 'string') ||
      new Set(conditions.map((c) => c.assetCode)).size !== conditions.length
    )
      throw new ValidationError('Tình trạng tài sản không hợp lệ')
    for (const entry of conditions) {
      const item = createdHandoverItems.find((x) => x.assetCode === entry.assetCode)
      if (
        !item ||
        typeof entry.condition !== 'string' ||
        !entry.condition.trim() ||
        entry.condition.trim().length > 300
      )
        throw new ValidationError('Tình trạng tài sản không hợp lệ hoặc không thuộc biên bản')
      await tx.update(handoverItems).set({ condition: entry.condition.trim() }).where(eq(handoverItems.id, item.itemId))
    }
  }

  // hoá đơn đầu tiên (nháp) — bảng hoá đơn nối ở Task 14, trước đó trả về dòng nháp
  const settings = await getSettings(tx)
  const proration = (lease.proration as Proration | null) ?? settings.proration
  const fees = await contractFees(tx, lease.id)
  const terms: LeaseTerms = {
    billingCycleMonths: lease.billingCycleMonths,
    billWaterByMeter: lease.billWaterByMeter,
    roomId: lease.roomId,
    startDate: lease.startDate,
    endDate: lease.endDate,
    monthlyRent: lease.monthlyRent,
    depositAmount: lease.depositAmount,
    fees,
    occupantIds: occupants,
  }
  const firstInvoiceLines = buildFirstInvoice(terms, lease.startDate, proration, received)
  await recordAudit(tx, ctx, {
    action: 'create',
    entity: 'lease',
    entityId: lease.id,
    facilityId: room.facilityId,
    summary: `Tạo hợp đồng thuê ${lease.code}`,
    after: lease,
  })
  return { lease, firstInvoiceLines, warnings: [], handoverItems: createdHandoverItems }
}

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

// ------------------------------------------------------------------ truy vấn

export type LeaseListItem = Lease & { roomCode: string; facilityId: string; tenantName: string; occupantCount: number }

export async function listLeases(
  db: DB,
  ctx: AccessContext,
  opts: {
    status?: 'active' | 'ended'
    facilityId?: string
    facilityIds?: string[]
    expiringWithinDays?: number
    unsigned?: boolean
    today?: string
    roomId?: string
    tenantId?: string
  },
): Promise<LeaseListItem[]> {
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
  if (opts.status) conds.push(eq(leases.status, opts.status))
  if (opts.expiringWithinDays != null)
    conds.push(
      eq(leases.status, 'active'),
      lte(leases.endDate, addDays(opts.today ?? todayVN(), opts.expiringWithinDays)),
    )
  if (opts.unsigned) conds.push(ne(leases.signStatus, 'signed'))
  if (opts.roomId) conds.push(eq(leases.roomId, opts.roomId))
  if (opts.tenantId) conds.push(eq(leases.tenantId, opts.tenantId))
  const rows = await db
    .select({
      l: leases,
      roomCode: rooms.code,
      facilityId: rooms.facilityId,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
    })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(...conds))
    .orderBy(asc(leases.code))
  const occ = rows.length
    ? await db
        .select()
        .from(leaseOccupants)
        .where(
          inArray(
            leaseOccupants.leaseId,
            rows.map((r) => r.l.id),
          ),
        )
    : []
  return rows.map((r) => ({
    ...r.l,
    roomCode: r.roomCode,
    facilityId: r.facilityId,
    tenantName: r.fullName ?? r.companyName ?? '',
    occupantCount: occ.filter((o) => o.leaseId === r.l.id).length,
  }))
}

/** Họ tên, số giấy tờ và điện thoại của những người ở trong hợp đồng (hiện ở chi tiết hợp đồng). */
export async function listLeaseOccupants(
  db: DB,
  ctx: AccessContext,
  facilityId: string,
  ids: string[],
): Promise<{ id: string; name: string; idNumber: string | null; phone: string | null; isCompany: boolean }[]> {
  assertCan(ctx, 'tenants_contracts', facilityId)
  if (ids.length === 0) return []
  const rows = await db
    .select({
      id: tenants.id,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
      idNumber: tenants.idNumber,
      passportNumber: tenants.passportNumber,
      phone: tenants.phone,
      kind: tenants.kind,
    })
    .from(tenants)
    .where(inArray(tenants.id, ids))
  return rows
    .map((r) => ({
      id: r.id,
      name: r.fullName ?? r.companyName ?? '',
      idNumber: r.idNumber ?? r.passportNumber,
      phone: r.phone,
      isCompany: r.kind === 'company',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

export type LeaseDetail = LeaseListItem & {
  fees: ContractFee[]
  occupantIds: string[]
  depositEntries: (typeof depositEntries.$inferSelect)[]
  terms: LeaseTerms
}

export async function getLease(db: DB, ctx: AccessContext, id: string): Promise<LeaseDetail> {
  const [row] = await db
    .select({
      l: leases,
      roomCode: rooms.code,
      facilityId: rooms.facilityId,
      fullName: tenants.fullName,
      companyName: tenants.companyName,
    })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(eq(leases.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  const [occ, fees, entries] = await Promise.all([
    db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, id)),
    contractFees(db, id),
    db
      .select()
      .from(depositEntries)
      .where(eq(depositEntries.leaseId, id))
      .orderBy(asc(depositEntries.date), asc(depositEntries.createdAt)),
  ])
  const occupantIds = occ.map((o) => o.tenantId)
  // Điều khoản hiện hành = hợp đồng gốc + phụ lục có hiệu lực tới hôm nay
  const today = todayVN()
  const terms = contractTermsAt(
    await leaseData(db, id),
    await loadAddenda(db, id),
    today < row.l.startDate ? row.l.startDate : today,
  )
  return {
    ...row.l,
    roomCode: row.roomCode,
    facilityId: row.facilityId,
    tenantName: row.fullName ?? row.companyName ?? '',
    occupantCount: occupantIds.length,
    fees,
    occupantIds,
    depositEntries: entries,
    terms,
  }
}

// ------------------------------------------------------------------ sửa và xoá hợp đồng

/** Mẫu để nguyên (undefined) thì giữ như cũ; null là về mặc định. */
export type LeaseEditInput = Pick<
  LeaseInput,
  | 'roomId'
  | 'tenantId'
  | 'startDate'
  | 'endDate'
  | 'monthlyRent'
  | 'depositAmount'
  | 'note'
  | 'contractTemplateId'
  | 'invoiceTemplateId'
> & {
  /** Danh sách phí dịch vụ sau khi sửa : dòng có leaseFeeId là phí cũ (đổi đơn giá), dòng không có là phí thêm từ loại phí đã cài. Bỏ trống thì giữ nguyên. */
  fees?: {
    leaseFeeId?: string
    feeTypeId?: string | null
    unitPrice: number
    /** Phí theo đồng hồ thêm mới: chỉ số ban đầu và đồng hồ có sẵn (bỏ trống thì tạo đồng hồ mới). */ initialReading?: number
    existingMeterId?: string
  }[]
}

/** Sửa phí dịch vụ của hợp đồng (cả mô hình cũ và bản chụp phí): đổi đơn giá, gỡ phí, thêm phí từ loại phí đã cài. Phí theo đồng hồ không thêm hay gỡ ở đây. */
/** Chuyển phí của hợp đồng kiểu cũ sang bản chụp phí (giữ nguyên tên, đơn vị, đơn giá, số lượng) để gắn được đồng hồ. Trả về bảng đổi id phí cũ → mới. */
async function convertLegacyFees(tx: DB, leaseId: string): Promise<Map<string, string>> {
  const rows = await tx
    .select({ f: leaseFees, t: feeTypes, u: feeUnits })
    .from(leaseFees)
    .innerJoin(feeTypes, eq(feeTypes.id, leaseFees.feeTypeId))
    .innerJoin(feeUnits, eq(feeUnits.id, feeTypes.unitId))
    .where(eq(leaseFees.leaseId, leaseId))
  const mapping = new Map<string, string>()
  for (const { f, t, u } of rows) {
    const [saved] = await tx
      .insert(leaseFeeSnapshots)
      .values({
        leaseId,
        feeTypeId: t.id,
        name: t.name,
        unit: u.name,
        quantitySource: t.quantityFrom === 'manual' ? 'legacy_fixed' : t.quantityFrom,
        quantity: f.quantity,
        billing: t.billing,
        unitPrice: f.unitPrice,
      })
      .returning()
    mapping.set(f.id, saved.id)
  }
  await tx.delete(leaseFees).where(eq(leaseFees.leaseId, leaseId))
  await tx.update(leases).set({ feeModel: 'snapshot', updatedAt: new Date() }).where(eq(leases.id, leaseId))
  return mapping
}

async function applyLeaseFeeEdits(
  tx: DB,
  ctx: AccessContext,
  leaseId: string,
  feeModel: string,
  rawEdits: NonNullable<LeaseEditInput['fees']>,
  roomId: string,
): Promise<void> {
  let edits = rawEdits
  // Thêm phí theo đồng hồ vào hợp đồng kiểu cũ: chuyển sang bản chụp phí trước
  if (feeModel !== 'snapshot') {
    const newTypeIds = edits.flatMap((e) => (!e.leaseFeeId && e.feeTypeId ? [e.feeTypeId] : []))
    const addsMeter =
      newTypeIds.length > 0 &&
      (
        await tx
          .select({ id: feeTypes.id })
          .from(feeTypes)
          .where(and(inArray(feeTypes.id, newTypeIds), eq(feeTypes.quantityFrom, 'meter')))
      ).length > 0
    if (addsMeter) {
      const mapping = await convertLegacyFees(tx, leaseId)
      edits = edits.map((e) => (e.leaseFeeId ? { ...e, leaseFeeId: mapping.get(e.leaseFeeId) ?? e.leaseFeeId } : e))
      feeModel = 'snapshot'
    }
  }
  const snapshot = feeModel === 'snapshot'
  const existing = snapshot
    ? await tx
        .select({
          id: leaseFeeSnapshots.id,
          feeTypeId: leaseFeeSnapshots.feeTypeId,
          name: leaseFeeSnapshots.name,
          source: leaseFeeSnapshots.quantitySource,
        })
        .from(leaseFeeSnapshots)
        .where(eq(leaseFeeSnapshots.leaseId, leaseId))
    : (
        await tx
          .select({ id: leaseFees.id, feeTypeId: leaseFees.feeTypeId, name: feeTypes.name })
          .from(leaseFees)
          .innerJoin(feeTypes, eq(feeTypes.id, leaseFees.feeTypeId))
          .where(eq(leaseFees.leaseId, leaseId))
      ).map((r) => ({ ...r, source: 'legacy' }))
  const keepIds = new Set(edits.flatMap((e) => (e.leaseFeeId ? [e.leaseFeeId] : [])))
  for (const row of existing)
    if (!keepIds.has(row.id) && row.source === 'meter')
      throw new ValidationError(`Phí ${row.name} tính theo đồng hồ, không gỡ được tại đây`)
  const seenTypes = new Set(
    existing.filter((r) => r.feeTypeId && r.source !== 'meter').map((r) => r.feeTypeId as string),
  )
  for (const edit of edits) {
    if (!Number.isSafeInteger(edit.unitPrice) || edit.unitPrice < 0 || edit.unitPrice > 2_147_483_647)
      throw new ValidationError('Đơn giá phí không hợp lệ')
    if (edit.leaseFeeId) {
      if (!existing.some((r) => r.id === edit.leaseFeeId)) throw new ValidationError('Phí không thuộc hợp đồng này')
      if (snapshot)
        await tx
          .update(leaseFeeSnapshots)
          .set({ unitPrice: edit.unitPrice })
          .where(eq(leaseFeeSnapshots.id, edit.leaseFeeId))
      else await tx.update(leaseFees).set({ unitPrice: edit.unitPrice }).where(eq(leaseFees.id, edit.leaseFeeId))
      continue
    }
    if (!edit.feeTypeId) throw new ValidationError('Chọn loại phí đã cài đặt')
    const [row] = await tx
      .select({ type: feeTypes, unit: feeUnits })
      .from(feeTypes)
      .innerJoin(feeUnits, eq(feeTypes.unitId, feeUnits.id))
      .where(eq(feeTypes.id, edit.feeTypeId))
    if (!row || !row.type.isActive) throw new ValidationError('Loại phí không tồn tại hoặc đã lưu trữ')
    if (row.type.quantityFrom === 'meter') {
      if (!snapshot) throw new ValidationError('Hợp đồng này dùng mô hình phí cũ, chưa gắn được phí tính theo đồng hồ')
      const [saved] = await tx
        .insert(leaseFeeSnapshots)
        .values({
          leaseId,
          feeTypeId: row.type.id,
          name: row.type.name,
          unit: row.unit.name,
          quantitySource: 'meter',
          quantity: 1,
          billing: row.type.billing,
          unitPrice: edit.unitPrice,
        })
        .returning()
      await ensureFeeMeter(tx, ctx, {
        roomId,
        feeTypeId: row.type.id,
        leaseFeeId: saved.id,
        initialReading: edit.initialReading,
        existingMeterId: edit.existingMeterId,
        installedOn: todayVN(),
      })
      continue
    }
    if (seenTypes.has(row.type.id)) throw new ValidationError(`Phí ${row.type.name} đã có trong hợp đồng`)
    seenTypes.add(row.type.id)
    if (snapshot)
      await tx.insert(leaseFeeSnapshots).values({
        leaseId,
        feeTypeId: row.type.id,
        name: row.type.name,
        unit: row.unit.name,
        quantitySource: row.type.quantityFrom === 'manual' ? 'legacy_fixed' : row.type.quantityFrom,
        quantity: 1,
        billing: row.type.billing,
        unitPrice: edit.unitPrice,
      })
    else await tx.insert(leaseFees).values({ leaseId, feeTypeId: row.type.id, quantity: 1, unitPrice: edit.unitPrice })
  }
  const removed = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id)
  if (removed.length) {
    if (snapshot) await tx.delete(leaseFeeSnapshots).where(inArray(leaseFeeSnapshots.id, removed))
    else await tx.delete(leaseFees).where(inArray(leaseFees.id, removed))
  }
}

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
    if (input.fees !== undefined) await applyLeaseFeeEdits(tx, ctx, id, before.feeModel, input.fees, input.roomId)
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
