import { and, asc, eq, inArray, like, lte, ne, sql } from 'drizzle-orm'
import {
  addenda, assets, contractVersions, depositContracts, depositEntries, docTemplates, facilities, feeTypes, feeUnits, files, handoverItems, handovers, incidents, invoices, payments, oneOffCharges, pendingAdjustments, invoiceTemplates, leaseFees, leaseFeeSnapshots, leaseOccupants, leases, rooms, tenants,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, facilityScope, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { addDays, todayVN } from '@/domain/dates'
import { depositBalance } from '@/domain/deposit'
import { buildFirstInvoice } from '@/domain/invoice-builder'
import { contractTermsAt } from '@/domain/contract-terms'
import type { ContractFee, DepositEntry, InvoiceLineInput, LeaseTerms, Proration } from '@/domain/types'
import { recordAudit } from '@/server/audit'
import { captureContractVersion } from './history'
import { ensureFeeMeter } from '@/server/meters/service'
import { createAssetInTransaction, moveAssetsInTransaction, setAssetStatusInTransaction } from '@/server/assets/service'
import { startHandoverInTransaction } from '@/server/handovers/service'
import { registerExportOwnerResolver, registerOwnerResolver } from '@/server/files/owners'
import type { ExportFormat } from '@/server/convert'
import { leaseData, loadAddenda } from '@/server/invoices/service'
import { getSettings } from '@/server/settings/service'
import { exportDocument, registerDocLoader } from '@/server/templates/service'
import type { StorageAdapter } from '@/server/storage/types'

export type Lease = typeof leases.$inferSelect
export type DepositContract = typeof depositContracts.$inferSelect
export type SignStatus = 'draft' | 'exported' | 'signed'

const SIGN_RANK: Record<SignStatus, number> = { draft: 0, exported: 1, signed: 2 }

// ------------------------------------------------------------------ helpers

async function loadRoom(db: Pick<DB, 'select'>, ctx: AccessContext, roomId: string) {
  const [r] = await db.select().from(rooms).where(eq(rooms.id, roomId))
  if (!r) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', r.facilityId)
  return r
}

async function loadTenant(db: Pick<DB, 'select'>, ctx: AccessContext, tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
  if (!t) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', t.homeFacilityId)
  return t
}

export async function nextLeaseCode(tx: Pick<DB, 'select'>, facilityCode: string, startDate: string): Promise<string> {
  const prefix = `${facilityCode}-HĐ-${startDate.slice(0, 4)}-`
  const rows = await tx.select({ code: leases.code }).from(leases).where(like(leases.code, `${prefix}%`))
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

async function contractFees(tx: Pick<DB, 'select'>, leaseId: string): Promise<ContractFee[]> {
  const [lease] = await tx.select({ feeModel: leases.feeModel }).from(leases).where(eq(leases.id, leaseId))
  if (lease?.feeModel === 'snapshot') {
    const rows = await tx.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, leaseId))
    return rows.map(f => ({ leaseFeeId: f.id, feeTypeId: f.feeTypeId, name: f.name, unit: f.unit, billing: f.billing as ContractFee['billing'], quantityFrom: f.quantitySource === 'occupants' ? 'occupants' as const : 'manual' as const, quantitySource: f.quantitySource as NonNullable<ContractFee['quantitySource']>, quantity: f.quantity, unitPrice: f.unitPrice }))
  }
  const rows = await tx
    .select({ f: leaseFees, t: feeTypes, u: feeUnits })
    .from(leaseFees)
    .innerJoin(feeTypes, eq(feeTypes.id, leaseFees.feeTypeId))
    .innerJoin(feeUnits, eq(feeUnits.id, feeTypes.unitId))
    .where(eq(leaseFees.leaseId, leaseId))
  return rows.map(({ f, t, u }) => ({
    feeTypeId: t.id, name: t.name, unit: u.name, billing: t.billing as ContractFee['billing'], quantityFrom: t.quantityFrom as ContractFee['quantityFrom'],
    quantity: f.quantity, unitPrice: f.unitPrice,
  }))
}

const toDomainEntry = (e: typeof depositEntries.$inferSelect): DepositEntry => ({
  id: e.id, date: e.date, type: e.type as DepositEntry['type'], amount: e.amount, status: e.status as DepositEntry['status'], method: e.method, note: e.note,
})

// ------------------------------------------------------------------ hợp đồng cọc

export type DepositInput = { roomId: string; tenantId: string; depositAmount: number; agreedRent: number; expectedMoveIn: string; collected?: boolean }

export async function createDepositContract(db: DB, ctx: AccessContext, input: DepositInput): Promise<{ contract: DepositContract; warnings: string[] }> {
  const room = await loadRoom(db, ctx, input.roomId)
  await loadTenant(db, ctx, input.tenantId)
  if (!room.isActive) throw new ValidationError('Phòng đã ngừng sử dụng')
  if (input.depositAmount < 0 || input.agreedRent < 0) throw new ValidationError('Số tiền không hợp lệ')
  return db.transaction(async (tx) => {
    const [dup] = await tx.select().from(depositContracts).where(and(eq(depositContracts.roomId, room.id), eq(depositContracts.status, 'pending')))
    if (dup) throw new ValidationError('Phòng đã có hợp đồng cọc đang chờ')
    const warnings: string[] = []
    const [active] = await tx.select().from(leases).where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
    if (active && input.expectedMoveIn < active.endDate) {
      warnings.push(`Ngày vào ở dự kiến trước ngày kết thúc của hợp đồng hiện tại (${active.endDate.split('-').reverse().join('/')})`)
    }
    const [contract] = await tx.insert(depositContracts).values({
      roomId: room.id, tenantId: input.tenantId, depositAmount: input.depositAmount, agreedRent: input.agreedRent, expectedMoveIn: input.expectedMoveIn,
    }).returning()
    if (input.depositAmount > 0) {
      await tx.insert(depositEntries).values({
        depositContractId: contract.id, date: todayVN(), type: 'collect', amount: input.depositAmount,
        status: input.collected === false ? 'pending' : 'done', method: 'cash', note: 'Cọc giữ chỗ',
      })
    }
    await recordAudit(tx, ctx, { action: 'create', entity: 'deposit_contract', entityId: contract.id, facilityId: room.facilityId, summary: `Tạo hợp đồng cọc phòng ${room.code}`, after: contract })
    return { contract, warnings }
  })
}

/** Huỷ cọc: mất cọc ghi dòng `forfeit` (đã xong); hoàn cọc ghi dòng `refund` chờ chi. */
export async function cancelDepositContract(db: DB, ctx: AccessContext, id: string, outcome: 'forfeit' | 'refund'): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(depositContracts).where(eq(depositContracts.id, id))
    if (!c) throw new NotFoundError()
    const room = await loadRoom(tx, ctx, c.roomId)
    if (c.status !== 'pending') throw new ValidationError('Hợp đồng cọc không còn ở trạng thái chờ')
    const entries = await tx.select().from(depositEntries).where(eq(depositEntries.depositContractId, id))
    const held = depositBalance(entries.map(toDomainEntry))
    await tx.update(depositContracts).set({ status: 'cancelled', cancelOutcome: outcome, updatedAt: new Date() }).where(eq(depositContracts.id, id))
    if (held > 0) {
      await tx.insert(depositEntries).values({
        depositContractId: id, date: todayVN(), type: outcome, amount: held, status: outcome === 'forfeit' ? 'done' : 'pending',
        note: outcome === 'forfeit' ? 'Mất cọc do huỷ hợp đồng cọc' : 'Hoàn cọc do huỷ hợp đồng cọc',
      })
    }
    await recordAudit(tx, ctx, { action: 'update', entity: 'deposit_contract', entityId: id, facilityId: room.facilityId, summary: `Huỷ hợp đồng cọc (${outcome === 'forfeit' ? 'mất cọc' : 'hoàn cọc'})`, before: { status: c.status }, after: { status: 'cancelled', outcome } })
  })
}

// ------------------------------------------------------------------ hợp đồng thuê

export type LeaseFeeInput = { feeTypeId: string | null; name: string; unit: string; quantitySource: 'occupants' | 'room' | 'meter' | 'period_input'; unitPrice: number; quantity?: number; initialReading?: number; existingMeterId?: string }
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
    remove: Array<{ assetId: string; action: 'dispose' } | { assetId: string; action: 'move'; to: { kind: 'warehouse' | 'room'; id: string } }>
    conditions?: Array<{ assetCode: string; condition: string }>
  }
  feeModel?: 'legacy' | 'snapshot'
  fees?: LegacyFeeInput[] | LeaseFeeInput[]
  dueRule?: unknown
  proration?: Proration | null
  billingCycleMonths?: number
  billWaterByMeter?: boolean
}

export type LeaseCreated = { lease: Lease; firstInvoiceLines: InvoiceLineInput[]; warnings: string[]; handoverItems: Array<{ assetCode: string; itemId: string }> }

async function insertLease(tx: DB, ctx: AccessContext, input: LeaseInput, fromDepositId: string | null): Promise<LeaseCreated> {
  const room = await loadRoom(tx, ctx, input.roomId)
  const tenant = await loadTenant(tx, ctx, input.tenantId)
  if (input.invoiceTemplateId) {
    const [template] = await tx.select({ id: invoiceTemplates.id }).from(invoiceTemplates).where(eq(invoiceTemplates.id, input.invoiceTemplateId))
    if (!template) throw new ValidationError('Mẫu hóa đơn không hợp lệ', { invoiceTemplateId: 'Chọn mẫu hóa đơn hợp lệ' })
  }
  if (input.contractTemplateId) {
    const [template] = await tx.select({ template: docTemplates, file: files }).from(docTemplates).leftJoin(files, eq(files.id, docTemplates.fileId)).where(eq(docTemplates.id, input.contractTemplateId))
    if (!template || template.template.docType !== 'lease' || !template.file?.confirmedAt || template.file.ownerType !== 'template' || template.file.ownerId !== template.template.id) throw new ValidationError('Mẫu hợp đồng không hợp lệ hoặc chưa sẵn sàng', { contractTemplateId: 'Chọn mẫu hợp đồng hợp lệ' })
  }
  if (input.endDate < input.startDate) throw new ValidationError('Ngày kết thúc phải sau ngày bắt đầu', { endDate: 'Ngày kết thúc phải sau ngày bắt đầu' })
  if (input.monthlyRent < 0 || input.depositAmount < 0) throw new ValidationError('Số tiền không hợp lệ')
  const occupants = input.feeModel === 'snapshot' ? [...new Set([tenant.id, ...(input.occupantIds ?? [])])] : [...new Set(input.occupantIds?.length ? input.occupantIds : [tenant.id])]
  if (occupants.length === 0) throw new ValidationError('Chọn ít nhất một người ở', { occupantIds: 'Chọn ít nhất một người ở' })
  for (const o of occupants) {
    const occupant = await loadTenant(tx, ctx, o)
    if (input.feeModel !== 'snapshot' && occupant.kind === 'company' && occupant.id !== tenant.id) throw new ValidationError('Người ở phải là khách cá nhân', { occupantIds: 'Người ở phải là khách cá nhân' })
  }

  const [active] = await tx.select().from(leases).where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
  if (active) throw new ValidationError('Phòng đã có hợp đồng trong khoảng thời gian này')

  const [fac] = await tx.select().from(facilities).where(eq(facilities.id, room.facilityId))
  const code = await nextLeaseCode(tx, fac.code, input.startDate)
  const [lease] = await tx.insert(leases).values({
    code, roomId: room.id, tenantId: tenant.id, startDate: input.startDate, endDate: input.endDate, monthlyRent: input.monthlyRent,
    depositAmount: input.depositAmount, note: input.note ?? '', contractTemplateId: input.contractTemplateId ?? null, invoiceTemplateId: input.invoiceTemplateId ?? null, feeModel: input.feeModel ?? 'legacy', dueRule: input.dueRule ?? null, proration: input.proration ?? null, billingCycleMonths: input.billingCycleMonths ?? 1, billWaterByMeter: input.billWaterByMeter ?? true, fromDepositContractId: fromDepositId,
  }).returning()
  await tx.insert(leaseOccupants).values(occupants.map((tenantId) => ({ leaseId: lease.id, tenantId })))
  if (input.fees?.length && input.feeModel === 'snapshot') {
    const fees = input.fees as LeaseFeeInput[]
    // Phí tính theo đồng hồ được thêm nhiều dòng cùng loại (mỗi dòng một đồng hồ); các phí khác chỉ một dòng mỗi loại
    const meterIds = fees.flatMap(f => f.existingMeterId ? [f.existingMeterId] : [])
    if (new Set(meterIds).size !== meterIds.length) throw new ValidationError('Đồng hồ bị chọn trùng')
    const seenCommon = new Set<string>()
    for (const fee of input.fees as LeaseFeeInput[]) {
      if (!Number.isSafeInteger(fee.unitPrice) || fee.unitPrice < 0 || fee.unitPrice > 2_147_483_647 || !['occupants', 'room', 'meter', 'period_input'].includes(fee.quantitySource)) throw new ValidationError('Phí dịch vụ không hợp lệ')
      let name = fee.name?.trim(), unit = fee.unit?.trim(), source: NonNullable<ContractFee['quantitySource']> = fee.quantitySource
      let billing: ContractFee['billing'] = source === 'meter' || source === 'period_input' ? 'per_occurrence' : 'monthly_fixed'
      if (fee.feeTypeId) {
        const [row] = await tx.select({ type: feeTypes, unit: feeUnits }).from(feeTypes).innerJoin(feeUnits, eq(feeTypes.unitId, feeUnits.id)).where(eq(feeTypes.id, fee.feeTypeId))
        if (!row || !row.type.isActive) throw new ValidationError('Loại phí không tồn tại hoặc đã lưu trữ')
        name = row.type.name; unit = row.unit.name; billing = row.type.billing as ContractFee['billing']
        source = row.type.quantityFrom === 'manual' ? 'legacy_fixed' : row.type.quantityFrom as LeaseFeeInput['quantitySource']
      }
      // Chỉ phí theo đồng hồ được nhiều dòng cùng loại; dùng nguồn số lượng thật của loại phí, không tin dữ liệu client
      if (fee.feeTypeId && source !== 'meter') {
        if (seenCommon.has(fee.feeTypeId)) throw new ValidationError('Phí hoặc đồng hồ bị chọn trùng')
        seenCommon.add(fee.feeTypeId)
      }
      if (!name || !unit) throw new ValidationError('Nhập tên và đơn vị phí')
      const quantity = source === 'legacy_fixed' ? (fee.quantity ?? 1) : 1
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2_147_483_647) throw new ValidationError('Số lượng phí không hợp lệ')
      const [savedFee] = await tx.insert(leaseFeeSnapshots).values({ leaseId: lease.id, feeTypeId: fee.feeTypeId, name, unit, quantitySource: source, quantity, billing, unitPrice: fee.unitPrice }).returning()
      if (source === 'meter') await ensureFeeMeter(tx, ctx, { roomId: room.id, feeTypeId: fee.feeTypeId, leaseFeeId: savedFee.id, initialReading: fee.initialReading, existingMeterId: fee.existingMeterId, installedOn: input.startDate })
    }
  } else if (input.fees?.length) await tx.insert(leaseFees).values((input.fees as LegacyFeeInput[]).map((f) => ({ leaseId: lease.id, ...f })))

  // sổ cọc: cọc giữ chỗ chuyển sang hợp đồng thuê; phần còn thiếu ghi dòng thu chờ
  let held = 0
  if (fromDepositId) {
    const moved = await tx.update(depositEntries).set({ leaseId: lease.id, updatedAt: new Date() }).where(and(eq(depositEntries.depositContractId, fromDepositId), eq(depositEntries.status, 'done'))).returning()
    held = depositBalance(moved.map(toDomainEntry))
  }
  const received = input.receivedDeposit ?? held
  if (!Number.isSafeInteger(input.depositAmount) || !Number.isSafeInteger(received) || received < held || received < 0 || received > input.depositAmount) {
    throw new ValidationError('Tiền cọc thực nhận không hợp lệ', { receivedDeposit: 'Tiền thực nhận phải từ số cọc kế thừa đến số cọc hợp đồng' })
  }
  if (received > held) {
    await tx.insert(depositEntries).values({ leaseId: lease.id, date: todayVN(), type: 'collect', amount: received - held, status: 'done', note: 'Cọc thực nhận khi tạo hợp đồng' })
  }
  const missing = input.depositAmount - received
  if (missing > 0) {
    await tx.insert(depositEntries).values({ leaseId: lease.id, date: input.startDate, type: 'collect', amount: missing, status: 'pending', note: 'Cọc còn thiếu theo hợp đồng thuê' })
  }

  let createdHandoverItems: Array<{ assetCode: string; itemId: string }> = []
  if (input.handover) {
    const h = input.handover
    if (h.addAssetIds.length || h.newAssets.length || h.remove.length) assertCan(ctx, 'assets', room.facilityId)
    // Khóa cơ sở của phòng và mọi cơ sở đích của việc di chuyển theo một thứ tự cố định, tránh deadlock khi hai hợp đồng chuyển chéo cơ sở
    const targetFacilities: string[] = []
    for (const item of h.remove) {
      if (item.action !== 'move' || !item.to) continue
      if (typeof item.to.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.to.id)) throw new ValidationError('Đích di chuyển không hợp lệ')
      if (item.to.kind === 'warehouse') targetFacilities.push(item.to.id)
      else if (item.to.kind === 'room') { const [r] = await tx.select({ f: rooms.facilityId }).from(rooms).where(eq(rooms.id, item.to.id)); if (r) targetFacilities.push(r.f) }
    }
    for (const id of [...new Set([room.facilityId, ...targetFacilities])].sort()) await tx.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, id)).for('update')
    const current = await tx.select().from(assets).where(and(eq(assets.locationKind, 'room'), eq(assets.locationId, room.id), ne(assets.status, 'disposed'))).for('update')
    const expected = new Set(h.expectedRoomAssetIds)
    const added = new Set(h.addAssetIds)
    const removed = new Set(h.remove.map((x) => x.assetId))
    if (expected.size !== h.expectedRoomAssetIds.length || added.size !== h.addAssetIds.length || removed.size !== h.remove.length || current.length !== expected.size || current.some((a) => !expected.has(a.id)) || h.remove.some((x) => !expected.has(x.assetId)) || h.addAssetIds.some((id) => expected.has(id))) {
      throw new ValidationError('Danh sách tài sản đã thay đổi hoặc không hợp lệ, vui lòng tải lại')
    }
    if (h.addAssetIds.length) {
      const additions = await tx.select().from(assets).where(inArray(assets.id, h.addAssetIds)).for('update')
      if (additions.length !== h.addAssetIds.length || additions.some((a) => a.facilityId !== room.facilityId || a.status === 'disposed' || (!h.expectedAddedLocations?.some((loc) => loc.assetId === a.id && loc.kind === a.locationKind && loc.id === a.locationId)))) throw new ValidationError('Tài sản không hợp lệ hoặc không thuộc cơ sở')
      await moveAssetsInTransaction(tx, ctx, h.addAssetIds, { kind: 'room', id: room.id }, 'Bàn giao nhận phòng')
    }
    for (const item of h.remove) {
      if (item.action === 'dispose') await setAssetStatusInTransaction(tx, ctx, item.assetId, 'disposed')
      else if (item.action === 'move' && item.to && (item.to.kind === 'warehouse' || item.to.kind === 'room') && typeof item.to.id === 'string') {
        if (item.to.kind === 'room' && item.to.id === room.id) throw new ValidationError('Không thể chuyển tài sản vào chính phòng đang lập hợp đồng')
        await moveAssetsInTransaction(tx, ctx, [item.assetId], item.to, 'Bàn giao nhận phòng')
      } else throw new ValidationError('Cách xử lý tài sản không hợp lệ')
    }
    for (const asset of h.newAssets) await createAssetInTransaction(tx, ctx, { ...asset, facilityId: room.facilityId, location: { kind: 'room', id: room.id } })
    const handover = await startHandoverInTransaction(tx, ctx, lease.id, 'check_in')
    createdHandoverItems = await tx.select({ assetCode: assets.code, itemId: handoverItems.id }).from(handoverItems).innerJoin(assets, eq(assets.id, handoverItems.assetId)).where(eq(handoverItems.handoverId, handover.id))
    const conditions = h.conditions ?? []
    if (!Array.isArray(conditions) || conditions.some(c => !c || typeof c.assetCode !== 'string') || new Set(conditions.map(c => c.assetCode)).size !== conditions.length) throw new ValidationError('Tình trạng tài sản không hợp lệ')
    for (const entry of conditions) {
      const item = createdHandoverItems.find(x => x.assetCode === entry.assetCode)
      if (!item || typeof entry.condition !== 'string' || !entry.condition.trim() || entry.condition.trim().length > 300) throw new ValidationError('Tình trạng tài sản không hợp lệ hoặc không thuộc biên bản')
      await tx.update(handoverItems).set({ condition: entry.condition.trim() }).where(eq(handoverItems.id, item.itemId))
    }
  }

  // hoá đơn đầu tiên (nháp) — bảng hoá đơn nối ở Task 14, trước đó trả về dòng nháp
  const settings = await getSettings(tx)
  const proration = (lease.proration as Proration | null) ?? settings.proration
  const fees = await contractFees(tx, lease.id)
  const terms: LeaseTerms = {
    billingCycleMonths: lease.billingCycleMonths, billWaterByMeter: lease.billWaterByMeter,
    roomId: lease.roomId, startDate: lease.startDate, endDate: lease.endDate, monthlyRent: lease.monthlyRent,
    depositAmount: lease.depositAmount, fees, occupantIds: occupants,
  }
  const firstInvoiceLines = buildFirstInvoice(terms, lease.startDate, proration, received)
  await recordAudit(tx, ctx, { action: 'create', entity: 'lease', entityId: lease.id, facilityId: room.facilityId, summary: `Tạo hợp đồng thuê ${lease.code}`, after: lease })
  return { lease, firstInvoiceLines, warnings: [], handoverItems: createdHandoverItems }
}

export async function createLease(db: DB, ctx: AccessContext, input: LeaseInput): Promise<LeaseCreated> {
  return db.transaction(async (tx) => insertLease(tx as unknown as DB, ctx, input, null))
}

export async function convertDepositToLease(db: DB, ctx: AccessContext, depositId: string, input: LeaseInput): Promise<LeaseCreated> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(depositContracts).where(eq(depositContracts.id, depositId))
    if (!c) throw new NotFoundError()
    await loadRoom(tx, ctx, c.roomId)
    if (c.status !== 'pending') throw new ValidationError('Hợp đồng cọc không còn ở trạng thái chờ')
    if (c.roomId !== input.roomId) throw new ValidationError('Hợp đồng cọc thuộc phòng khác')
    const r = await insertLease(tx as unknown as DB, ctx, input, depositId)
    await tx.update(depositContracts).set({ status: 'converted', updatedAt: new Date() }).where(eq(depositContracts.id, depositId))
    return r
  })
}

// ------------------------------------------------------------------ truy vấn

export type LeaseListItem = Lease & { roomCode: string; facilityId: string; tenantName: string; occupantCount: number }

export async function listLeases(
  db: DB, ctx: AccessContext,
  opts: { status?: 'active' | 'ended'; facilityId?: string; facilityIds?: string[]; expiringWithinDays?: number; unsigned?: boolean; today?: string; roomId?: string; tenantId?: string },
): Promise<LeaseListItem[]> {
  assertCan(ctx, 'tenants_contracts', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(rooms.facilityId, scope))
  if (opts.facilityId) conds.push(eq(rooms.facilityId, opts.facilityId))
  if (opts.facilityIds?.length) conds.push(inArray(rooms.facilityId, opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))))
  if (opts.status) conds.push(eq(leases.status, opts.status))
  if (opts.expiringWithinDays != null) conds.push(eq(leases.status, 'active'), lte(leases.endDate, addDays(opts.today ?? todayVN(), opts.expiringWithinDays)))
  if (opts.unsigned) conds.push(ne(leases.signStatus, 'signed'))
  if (opts.roomId) conds.push(eq(leases.roomId, opts.roomId))
  if (opts.tenantId) conds.push(eq(leases.tenantId, opts.tenantId))
  const rows = await db
    .select({ l: leases, roomCode: rooms.code, facilityId: rooms.facilityId, fullName: tenants.fullName, companyName: tenants.companyName })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(and(...conds))
    .orderBy(asc(leases.code))
  const occ = rows.length ? await db.select().from(leaseOccupants).where(inArray(leaseOccupants.leaseId, rows.map((r) => r.l.id))) : []
  return rows.map((r) => ({
    ...r.l, roomCode: r.roomCode, facilityId: r.facilityId, tenantName: r.fullName ?? r.companyName ?? '',
    occupantCount: occ.filter((o) => o.leaseId === r.l.id).length,
  }))
}

export type LeaseDetail = LeaseListItem & { fees: ContractFee[]; occupantIds: string[]; depositEntries: (typeof depositEntries.$inferSelect)[]; terms: LeaseTerms }

export async function getLease(db: DB, ctx: AccessContext, id: string): Promise<LeaseDetail> {
  const [row] = await db
    .select({ l: leases, roomCode: rooms.code, facilityId: rooms.facilityId, fullName: tenants.fullName, companyName: tenants.companyName })
    .from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).innerJoin(tenants, eq(tenants.id, leases.tenantId)).where(eq(leases.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  const [occ, fees, entries] = await Promise.all([
    db.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, id)),
    contractFees(db, id),
    db.select().from(depositEntries).where(eq(depositEntries.leaseId, id)).orderBy(asc(depositEntries.date), asc(depositEntries.createdAt)),
  ])
  const occupantIds = occ.map((o) => o.tenantId)
  // Điều khoản hiện hành = hợp đồng gốc + phụ lục có hiệu lực tới hôm nay
  const today = todayVN()
  const terms = contractTermsAt(await leaseData(db, id), await loadAddenda(db, id), today < row.l.startDate ? row.l.startDate : today)
  return { ...row.l, roomCode: row.roomCode, facilityId: row.facilityId, tenantName: row.fullName ?? row.companyName ?? '', occupantCount: occupantIds.length, fees, occupantIds, depositEntries: entries, terms }
}

export async function getPendingDepositContract(db: DB, ctx: AccessContext, roomId: string): Promise<DepositContract | null> {
  await loadRoom(db, ctx, roomId)
  const [c] = await db.select().from(depositContracts).where(and(eq(depositContracts.roomId, roomId), eq(depositContracts.status, 'pending')))
  return c ?? null
}

// ------------------------------------------------------------------ sửa và xoá hợp đồng

export type LeaseEditInput = Pick<LeaseInput, 'roomId' | 'tenantId' | 'startDate' | 'endDate' | 'monthlyRent' | 'depositAmount' | 'note'>

function checkMoney(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) throw new ValidationError('Số tiền không hợp lệ')
}
function checkDate(value: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new ValidationError('Ngày không hợp lệ')
}

export async function updateLease(db: DB, ctx: AccessContext, id: string, input: LeaseEditInput, confirmedSigned: boolean): Promise<void> {
  await db.transaction(async raw => {
    const tx = raw as unknown as DB
    const [before] = await tx.select().from(leases).where(eq(leases.id, id)).for('update')
    if (!before) throw new NotFoundError()
    await loadRoom(tx, ctx, before.roomId)
    const target = await loadRoom(tx, ctx, input.roomId)
    await loadTenant(tx, ctx, input.tenantId)
    if (before.signStatus === 'signed' && confirmedSigned !== true) throw new ValidationError('Cần xác nhận sửa hợp đồng đã ký')
    checkDate(input.startDate); checkDate(input.endDate); checkMoney(input.monthlyRent); checkMoney(input.depositAmount)
    if (input.endDate < input.startDate) throw new ValidationError('Ngày kết thúc phải sau ngày bắt đầu')
    if (!target.isActive && target.id !== before.roomId) throw new ValidationError('Phòng đã ngừng sử dụng')
    if (before.status === 'active') {
      const [other] = await tx.select().from(leases).where(and(eq(leases.roomId, input.roomId), eq(leases.status, 'active'), ne(leases.id, id)))
      if (other) throw new ValidationError('Phòng đã có hợp đồng đang hiệu lực')
    }
    await captureContractVersion(tx, ctx, 'lease', id, 'edit')
    const [after] = await tx.update(leases).set({ roomId: input.roomId, tenantId: input.tenantId, startDate: input.startDate, endDate: input.endDate, monthlyRent: input.monthlyRent, depositAmount: input.depositAmount, note: input.note ?? '', updatedAt: new Date() }).where(eq(leases.id, id)).returning()
    if (before.tenantId !== input.tenantId) {
      await tx.delete(leaseOccupants).where(and(eq(leaseOccupants.leaseId, id), eq(leaseOccupants.tenantId, before.tenantId)))
      await tx.insert(leaseOccupants).values({ leaseId: id, tenantId: input.tenantId }).onConflictDoNothing()
    }
    await recordAudit(tx, ctx, { action: 'update', entity: 'lease', entityId: id, facilityId: target.facilityId, summary: `Sửa hợp đồng thuê ${before.code}`, before, after })
  })
}

export async function updateDepositContract(db: DB, ctx: AccessContext, id: string, input: DepositInput, confirmedSigned: boolean): Promise<void> {
  await db.transaction(async raw => {
    const tx = raw as unknown as DB
    const [before] = await tx.select().from(depositContracts).where(eq(depositContracts.id, id)).for('update')
    if (!before) throw new NotFoundError()
    await loadRoom(tx, ctx, before.roomId)
    const room = await loadRoom(tx, ctx, input.roomId)
    await loadTenant(tx, ctx, input.tenantId)
    if (before.signStatus === 'signed' && confirmedSigned !== true) throw new ValidationError('Cần xác nhận sửa hợp đồng đã ký')
    checkMoney(input.depositAmount); checkMoney(input.agreedRent); checkDate(input.expectedMoveIn)
    if (!room.isActive && room.id !== before.roomId) throw new ValidationError('Phòng đã ngừng sử dụng')
    if (before.status === 'pending') {
      const [other] = await tx.select().from(depositContracts).where(and(eq(depositContracts.roomId, input.roomId), eq(depositContracts.status, 'pending'), ne(depositContracts.id, id)))
      if (other) throw new ValidationError('Phòng đã có hợp đồng cọc đang chờ')
    }
    await captureContractVersion(tx, ctx, 'deposit', id, 'edit')
    const [after] = await tx.update(depositContracts).set({ roomId: input.roomId, tenantId: input.tenantId, depositAmount: input.depositAmount, agreedRent: input.agreedRent, expectedMoveIn: input.expectedMoveIn, updatedAt: new Date() }).where(eq(depositContracts.id, id)).returning()
    await recordAudit(tx, ctx, { action: 'update', entity: 'deposit_contract', entityId: id, facilityId: room.facilityId, summary: 'Sửa hợp đồng cọc', before, after })
  })
}

export async function deleteContract(db: DB, ctx: AccessContext, kind: 'lease' | 'deposit', id: string, confirmed: boolean, storage: StorageAdapter): Promise<{ pendingFiles: number }> {
  if (kind !== 'lease' && kind !== 'deposit') throw new ValidationError('Loại hợp đồng không hợp lệ')
  if (confirmed !== true) throw new ValidationError('Cần xác nhận xoá hợp đồng')
  await db.transaction(async raw => {
    const tx = raw as unknown as DB
    const table = kind === 'lease' ? leases : depositContracts
    const [before] = await tx.select().from(table).where(eq(table.id, id)).for('update')
    if (!before) throw new NotFoundError()
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, before.roomId))
    if (!room) throw new NotFoundError()
    assertCan(ctx, 'delete_contracts', room.facilityId)
    await tx.delete(contractVersions).where(and(eq(contractVersions.contractId, id), eq(contractVersions.kind, kind)))
    if (kind === 'deposit') {
      const linked = await tx.select({ facilityId: rooms.facilityId }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(eq(leases.fromDepositContractId, id))
      for (const l of linked) assertCan(ctx, 'delete_contracts', l.facilityId)
      await tx.update(files).set({ ownerType: 'pending_contract_delete', confirmedAt: null, deleteAfter: todayVN(), facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`, updatedAt: new Date() }).where(and(eq(files.ownerId, id), inArray(files.ownerType, ['signed_contract', 'export'])))
      const markedFiles = await tx.select({ facilityId: files.facilityId }).from(files).where(and(eq(files.ownerType, 'pending_contract_delete'), eq(files.ownerId, id)))
      for (const file of markedFiles) if (file.facilityId) assertCan(ctx, 'delete_contracts', file.facilityId)
      await tx.update(leases).set({ fromDepositContractId: null, updatedAt: new Date() }).where(eq(leases.fromDepositContractId, id))
      await tx.delete(depositEntries).where(eq(depositEntries.depositContractId, id))
      await tx.delete(depositContracts).where(eq(depositContracts.id, id))
    } else {
      const invoiceRows = await tx.select({ id: invoices.id, facilityId: invoices.facilityId }).from(invoices).where(eq(invoices.leaseId, id))
      const handoverRows = await tx.select({ id: handovers.id, facilityId: rooms.facilityId }).from(handovers).innerJoin(rooms, eq(rooms.id, handovers.roomId)).where(eq(handovers.leaseId, id))
      for (const item of [...invoiceRows, ...handoverRows]) assertCan(ctx, 'delete_contracts', item.facilityId)
      const handoverIds = handoverRows.map(x => x.id)
      const items = handoverIds.length ? await tx.select({ id: handoverItems.id }).from(handoverItems).where(inArray(handoverItems.handoverId, handoverIds)) : []
      const addonRows = await tx.select({ id: addenda.id }).from(addenda).where(eq(addenda.leaseId, id))
      const invoiceIds = invoiceRows.map(x => x.id)
      const paymentRows = invoiceIds.length ? await tx.select({ id: payments.id }).from(payments).where(inArray(payments.invoiceId, invoiceIds)) : []
      const relatedIds = [id, ...invoiceIds, ...paymentRows.map(x => x.id), ...handoverIds, ...addonRows.map(x => x.id)]
      await tx.update(files).set({ ownerType: 'pending_contract_delete', confirmedAt: null, deleteAfter: todayVN(), facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`, updatedAt: new Date() }).where(and(eq(files.ownerType, 'export'), inArray(files.ownerId, relatedIds)))
      await tx.update(files).set({ ownerType: 'pending_contract_delete', confirmedAt: null, deleteAfter: todayVN(), facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`, updatedAt: new Date() }).where(and(inArray(files.ownerType, ['signed_contract', 'lease_photo']), eq(files.ownerId, id)))
      if (addonRows.length) await tx.update(files).set({ ownerType: 'pending_contract_delete', confirmedAt: null, deleteAfter: todayVN(), facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`, updatedAt: new Date() }).where(and(eq(files.ownerType, 'signed_addendum'), inArray(files.ownerId, addonRows.map(a => a.id))))
      if (items.length) await tx.update(files).set({ ownerType: 'pending_contract_delete', confirmedAt: null, deleteAfter: todayVN(), facilityId: sql`coalesce(${files.facilityId}, ${room.facilityId})`, updatedAt: new Date() }).where(and(eq(files.ownerType, 'handover_photo'), inArray(files.ownerId, items.map(x => x.id))))
      const markedFiles = await tx.select({ facilityId: files.facilityId }).from(files).where(and(eq(files.ownerType, 'pending_contract_delete'), inArray(files.ownerId, [...relatedIds, ...items.map(x => x.id)])))
      for (const file of markedFiles) if (file.facilityId) assertCan(ctx, 'delete_contracts', file.facilityId)
      const charges = await tx.select({ id: oneOffCharges.id }).from(oneOffCharges).where(eq(oneOffCharges.leaseId, id))
      if (charges.length) await tx.update(incidents).set({ chargedOneOffId: null, updatedAt: new Date() }).where(inArray(incidents.chargedOneOffId, charges.map(x => x.id)))
      await tx.delete(oneOffCharges).where(eq(oneOffCharges.leaseId, id))
      await tx.delete(pendingAdjustments).where(eq(pendingAdjustments.leaseId, id))
      if (invoiceIds.length) {
        await tx.update(oneOffCharges).set({ invoiceId: null }).where(inArray(oneOffCharges.invoiceId, invoiceIds))
        await tx.update(pendingAdjustments).set({ invoiceId: null }).where(inArray(pendingAdjustments.invoiceId, invoiceIds))
        await tx.delete(payments).where(inArray(payments.invoiceId, invoiceIds))
        await tx.delete(invoices).where(inArray(invoices.id, invoiceIds))
      }
      await tx.delete(depositEntries).where(eq(depositEntries.leaseId, id))
      await tx.delete(addenda).where(eq(addenda.leaseId, id))
      await tx.delete(handovers).where(eq(handovers.leaseId, id))
      await tx.delete(leases).where(eq(leases.id, id))
    }
    await recordAudit(tx, ctx, { action: 'delete', entity: kind === 'lease' ? 'lease' : 'deposit_contract', entityId: id, facilityId: room.facilityId, summary: kind === 'lease' ? 'Xoá hợp đồng thuê và dữ liệu liên quan' : 'Xoá hợp đồng cọc và dữ liệu liên quan', before })
  })
  return { pendingFiles: await cleanupPendingContractFiles(db, storage, ctx) }
}

/** Tệp chưa dọn được vẫn bị ẩn và có thể thử lại mà không cần hợp đồng gốc. */
export async function cleanupPendingContractFiles(db: DB, storage: StorageAdapter, ctx?: AccessContext): Promise<number> {
  const rows = await db.select().from(files).where(eq(files.ownerType, 'pending_contract_delete'))
  let pending = 0
  for (const file of rows) {
    if (ctx && (file.facilityId ? !can(ctx, 'delete_contracts', file.facilityId) : !ctx.isAdmin)) continue
    try {
      await storage.delete(file.storageKey)
      if (file.thumbKey) await storage.delete(file.thumbKey)
      await db.delete(files).where(and(eq(files.id, file.id), eq(files.ownerType, 'pending_contract_delete')))
    } catch { pending++ }
  }
  return pending
}

// ------------------------------------------------------------------ trạng thái ký + xuất

export async function setSignStatus(db: DB, ctx: AccessContext, kind: 'lease' | 'deposit', id: string, status: SignStatus, signedFileId?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const table = kind === 'lease' ? leases : depositContracts
    const [row] = await tx.select().from(table).where(eq(table.id, id))
    if (!row) throw new NotFoundError()
    await loadRoom(tx, ctx, row.roomId)
    const current = row.signStatus as SignStatus
    if (status === 'draft' && current !== 'draft') throw new ValidationError('Không thể đưa hợp đồng về trạng thái nháp')
    if (SIGN_RANK[status] < SIGN_RANK[current]) throw new ValidationError('Không thể lùi trạng thái ký')
    if (signedFileId) {
      const [f] = await tx.select().from(files).where(eq(files.id, signedFileId))
      if (!f || f.ownerType !== 'signed_contract' || f.ownerId !== id || !f.confirmedAt) throw new ValidationError('Tệp đã ký chưa được tải lên')
    }
    await tx.update(table).set({ signStatus: status, signedFileId: signedFileId ?? row.signedFileId, updatedAt: new Date() }).where(eq(table.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: kind === 'lease' ? 'lease' : 'deposit_contract', entityId: id, summary: `Đổi trạng thái ký → ${status}`, before: { signStatus: current }, after: { signStatus: status } })
  })
}

/** Xuất hợp đồng ra Word từ mẫu; hợp đồng đang ở trạng thái nháp tự chuyển sang "đã xuất". */
export async function exportContract(db: DB, ctx: AccessContext, storage: StorageAdapter, kind: 'lease' | 'deposit', id: string, templateId?: string, format: ExportFormat = 'docx') {
  const [lease] = kind === 'lease' ? await db.select({ templateId: leases.contractTemplateId }).from(leases).where(eq(leases.id, id)) : []
  const r = await exportDocument(db, ctx, storage, { docType: kind === 'lease' ? 'lease' : 'deposit_contract', entityId: id, templateId: templateId ?? lease?.templateId ?? undefined, format })
  const table = kind === 'lease' ? leases : depositContracts
  const [row] = await db.select().from(table).where(eq(table.id, id))
  if (row?.signStatus === 'draft') await setSignStatus(db, ctx, kind, id, 'exported')
  return r
}

// ------------------------------------------------------------------ nối với tệp và giấy tờ

registerOwnerResolver('lease_photo', async (db, ownerId) => {
  const [row] = await db.select({ facilityId: rooms.facilityId }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(eq(leases.id, ownerId))
  if (!row) throw new NotFoundError()
  return row
})

registerOwnerResolver('signed_contract', async (db, ownerId) => {
  for (const t of [leases, depositContracts] as const) {
    const [row] = await db.select({ roomId: t.roomId }).from(t).where(eq(t.id, ownerId))
    if (row) {
      const [room] = await db.select({ f: rooms.facilityId }).from(rooms).where(eq(rooms.id, row.roomId))
      return { facilityId: room.f }
    }
  }
  throw new NotFoundError()
})

registerExportOwnerResolver(async (db, ownerId) => {
  for (const t of [leases, depositContracts] as const) {
    const [row] = await db.select({ roomId: t.roomId }).from(t).where(eq(t.id, ownerId))
    if (row) {
      const [room] = await db.select({ f: rooms.facilityId }).from(rooms).where(eq(rooms.id, row.roomId))
      return { facilityId: room.f }
    }
  }
  throw new NotFoundError()
})

async function tenantEntity(db: DB, tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
  if (!t) throw new NotFoundError()
  return {
    kind: t.kind, fullName: t.fullName, companyName: t.companyName, taxCode: t.taxCode,
    idDocument: t.kind === 'foreign' ? t.passportNumber : t.idNumber, phone: t.phone, email: t.email,
  }
}

registerDocLoader('lease', async (db, ctx, id) => {
  const l = await getLease(db, ctx, id)
  const [room] = await db.select().from(rooms).where(eq(rooms.id, l.roomId))
  const [fac] = await db.select().from(facilities).where(eq(facilities.id, room.facilityId))
  const occ = await Promise.all(l.occupantIds.map(async (oid) => { const t = await tenantEntity(db, oid); return { fullName: t.fullName ?? t.companyName ?? '', idDocument: t.idDocument } }))
  return {
    facilityId: room.facilityId,
    baseName: l.code,
    entities: {
      now: todayVN(), tenant: await tenantEntity(db, l.tenantId), occupants: occ, facility: { name: fac.name, address: fac.address }, room: { code: room.code },
      lease: { code: l.code, startDate: l.startDate, endDate: l.endDate, monthlyRent: l.monthlyRent, depositAmount: l.depositAmount },
      fees: l.fees.map((f) => ({ name: f.name, unit: f.unit, quantity: f.quantityFrom === 'occupants' ? l.occupantCount : f.quantity, unitPrice: f.unitPrice })),
    },
  }
})

registerDocLoader('deposit_contract', async (db, ctx, id) => {
  const [c] = await db.select().from(depositContracts).where(eq(depositContracts.id, id))
  if (!c) throw new NotFoundError()
  const room = await loadRoom(db, ctx, c.roomId)
  const [fac] = await db.select().from(facilities).where(eq(facilities.id, room.facilityId))
  return {
    facilityId: room.facilityId,
    baseName: `coc-${room.code}-${c.expectedMoveIn}`,
    entities: {
      now: todayVN(), tenant: await tenantEntity(db, c.tenantId), facility: { name: fac.name, address: fac.address }, room: { code: room.code },
      deposit: { depositAmount: c.depositAmount, agreedRent: c.agreedRent, expectedMoveIn: c.expectedMoveIn },
    },
  }
})

// ------------------------------------------------------------------ hợp đồng cọc: danh sách / chi tiết

export type DepositListItem = DepositContract & { roomCode: string; facilityId: string; tenantName: string }

export async function listDepositContracts(db: DB, ctx: AccessContext, opts: { status?: 'pending' | 'converted' | 'cancelled'; facilityId?: string; facilityIds?: string[] }): Promise<DepositListItem[]> {
  assertCan(ctx, 'tenants_contracts', opts.facilityId)
  const scope = facilityScope(ctx)
  if (scope !== 'all' && scope.length === 0) return []
  const conds = []
  if (scope !== 'all') conds.push(inArray(rooms.facilityId, scope))
  if (opts.facilityId) conds.push(eq(rooms.facilityId, opts.facilityId))
  if (opts.facilityIds?.length) conds.push(inArray(rooms.facilityId, opts.facilityIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))))
  if (opts.status) conds.push(eq(depositContracts.status, opts.status))
  const rows = await db
    .select({ c: depositContracts, roomCode: rooms.code, facilityId: rooms.facilityId, fullName: tenants.fullName, companyName: tenants.companyName })
    .from(depositContracts).innerJoin(rooms, eq(rooms.id, depositContracts.roomId)).innerJoin(tenants, eq(tenants.id, depositContracts.tenantId))
    .where(and(...conds)).orderBy(asc(depositContracts.expectedMoveIn))
  return rows.map((r) => ({ ...r.c, roomCode: r.roomCode, facilityId: r.facilityId, tenantName: r.fullName ?? r.companyName ?? '' }))
}

export async function getDepositContract(db: DB, ctx: AccessContext, id: string): Promise<DepositListItem & { entries: (typeof depositEntries.$inferSelect)[] }> {
  const [row] = await db
    .select({ c: depositContracts, roomCode: rooms.code, facilityId: rooms.facilityId, fullName: tenants.fullName, companyName: tenants.companyName })
    .from(depositContracts).innerJoin(rooms, eq(rooms.id, depositContracts.roomId)).innerJoin(tenants, eq(tenants.id, depositContracts.tenantId)).where(eq(depositContracts.id, id))
  if (!row) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', row.facilityId)
  const entries = await db.select().from(depositEntries).where(eq(depositEntries.depositContractId, id)).orderBy(asc(depositEntries.createdAt))
  return { ...row.c, roomCode: row.roomCode, facilityId: row.facilityId, tenantName: row.fullName ?? row.companyName ?? '', entries }
}
