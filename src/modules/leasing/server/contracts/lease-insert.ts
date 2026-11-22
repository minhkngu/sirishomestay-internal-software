import { and, eq, inArray, ne } from 'drizzle-orm'
import {
  assets,
  depositEntries,
  docTemplates,
  facilities,
  feeTypes,
  feeUnits,
  handoverItems,
  invoiceTemplates,
  leaseFeeSnapshots,
  leaseOccupants,
  leases,
  rooms,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { depositBalance } from '../../domain/deposit'
import { MAX_MONEY } from '@/domain/money'
import { buildFirstInvoice } from '../../domain/invoice-builder'
import type { ContractFee, LeaseTerms, Proration } from '@/domain/types'
import { recordAudit, getSettings } from '@/modules/platform'
import { ensureFeeMeter } from '@/modules/meters'
import { createAssetInTransaction, moveAssetsInTransaction, setAssetStatusInTransaction } from '@/modules/assets'
import { startHandoverInTransaction } from '../handovers/service'
import { loadRoom, loadTenant, toDomainEntry, type Lease } from './shared'
import { contractFees, nextLeaseCode } from './lease-queries'
import type { LeaseCreated, LeaseFeeInput, LeaseInput } from './lease-types'

/** Bước 1: nạp phòng, khách, kiểm tra mẫu, ngày, tiền, người ở và phòng chưa có hợp đồng đang hiệu lực. */
async function validateLeaseInput(tx: DB, ctx: AccessContext, input: LeaseInput) {
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
  const occupants = [...new Set([tenant.id, ...(input.occupantIds ?? [])])]
  if (occupants.length === 0)
    throw new ValidationError('Chọn ít nhất một người ở', { occupantIds: 'Chọn ít nhất một người ở' })
  for (const o of occupants) await loadTenant(tx, ctx, o)

  const [active] = await tx
    .select()
    .from(leases)
    .where(and(eq(leases.roomId, room.id), eq(leases.status, 'active')))
  if (active) throw new ValidationError('Phòng đã có hợp đồng trong khoảng thời gian này')
  return { room, tenant, occupants }
}

type LeaseRoom = Awaited<ReturnType<typeof loadRoom>>
type LeaseTenant = Awaited<ReturnType<typeof loadTenant>>

/** Bước 2: sinh mã và ghi hợp đồng cùng danh sách người ở. */
async function insertLeaseRow(
  tx: DB,
  input: LeaseInput,
  room: LeaseRoom,
  tenant: LeaseTenant,
  occupants: string[],
  fromDepositId: string | null,
): Promise<Lease> {
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
      dueRule: input.dueRule ?? null,
      proration: input.proration ?? null,
      billingCycleMonths: input.billingCycleMonths ?? 1,
      fromDepositContractId: fromDepositId,
    })
    .returning()
  await tx.insert(leaseOccupants).values(occupants.map((tenantId) => ({ leaseId: lease.id, tenantId })))
  return lease
}

type MeterStart = { leaseFeeId: string; reading: number }

/** Bước 3: ghi phí dạng bản chụp phí (kiểm tra từng dòng, gắn đồng hồ nếu cần). Trả về chỉ số đầu của các phí theo đồng hồ. */
async function insertLeaseFees(
  tx: DB,
  ctx: AccessContext,
  lease: Lease,
  room: LeaseRoom,
  input: LeaseInput,
): Promise<MeterStart[]> {
  const meterStarts: MeterStart[] = []
  if (!input.fees?.length) return meterStarts
  const fees = input.fees
  // Phí tính theo đồng hồ được thêm nhiều dòng cùng loại (mỗi dòng một đồng hồ); các phí khác chỉ một dòng mỗi loại
  const meterIds = fees.flatMap((f) => (f.existingMeterId ? [f.existingMeterId] : []))
  if (new Set(meterIds).size !== meterIds.length) throw new ValidationError('Đồng hồ bị chọn trùng')
  const seenCommon = new Set<string>()
  for (const fee of fees) {
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
        row.type.quantityFrom === 'manual' ? 'legacy_fixed' : (row.type.quantityFrom as LeaseFeeInput['quantitySource'])
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
    if (source === 'meter') {
      await ensureFeeMeter(tx, ctx, {
        roomId: room.id,
        leaseFeeId: savedFee.id,
        initialReading: fee.initialReading,
        existingMeterId: fee.existingMeterId,
        installedOn: input.startDate,
      })
      meterStarts.push({ leaseFeeId: savedFee.id, reading: fee.initialReading! })
    }
  }
  return meterStarts
}

/** Bước 4: sổ cọc. Trả về số cọc đã nhận. */
async function recordLeaseDeposit(tx: DB, lease: Lease, input: LeaseInput, fromDepositId: string | null) {
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
  return received
}

type HandoverInput = NonNullable<LeaseInput['handover']>

/** Bước 5a: khóa cơ sở và tài sản của phòng, đối chiếu danh sách tài sản client gửi lên. */
async function lockAndVerifyRoomAssets(tx: DB, room: LeaseRoom, h: HandoverInput) {
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
}

/** Bước 5b: thêm, gỡ, tạo mới tài sản theo biên bản nhận phòng. */
async function applyRoomAssetChanges(tx: DB, ctx: AccessContext, room: LeaseRoom, h: HandoverInput) {
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
}

/** Bước 5c: mở biên bản nhận phòng và ghi tình trạng từng tài sản. */
async function startCheckInHandover(tx: DB, ctx: AccessContext, leaseId: string, h: HandoverInput) {
  const handover = await startHandoverInTransaction(tx, ctx, leaseId, 'check_in')
  const createdHandoverItems = await tx
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
    if (!item || typeof entry.condition !== 'string' || !entry.condition.trim() || entry.condition.trim().length > 300)
      throw new ValidationError('Tình trạng tài sản không hợp lệ hoặc không thuộc biên bản')
    await tx.update(handoverItems).set({ condition: entry.condition.trim() }).where(eq(handoverItems.id, item.itemId))
  }
  return createdHandoverItems
}

/** Bước 5: bàn giao nhận phòng (nếu có). */
async function applyCheckInHandover(tx: DB, ctx: AccessContext, lease: Lease, room: LeaseRoom, h: HandoverInput) {
  if (h.addAssetIds.length || h.newAssets.length || h.remove.length) assertCan(ctx, 'assets', room.facilityId)
  await lockAndVerifyRoomAssets(tx, room, h)
  await applyRoomAssetChanges(tx, ctx, room, h)
  return startCheckInHandover(tx, ctx, lease.id, h)
}

/** Bước 6: dựng hoá đơn đầu tiên (nháp) và ghi nhật ký. */
async function finishLease(
  tx: DB,
  ctx: AccessContext,
  lease: Lease,
  room: LeaseRoom,
  occupants: string[],
  received: number,
  meterStarts: MeterStart[],
  createdHandoverItems: Array<{ assetCode: string; itemId: string }>,
): Promise<LeaseCreated> {
  // hoá đơn đầu tiên (nháp) — bảng hoá đơn nối ở Task 14, trước đó trả về dòng nháp
  const settings = await getSettings(tx)
  const proration = (lease.proration as Proration | null) ?? settings.proration
  const fees = await contractFees(tx, lease.id)
  const terms: LeaseTerms = {
    billingCycleMonths: lease.billingCycleMonths,
    roomId: lease.roomId,
    startDate: lease.startDate,
    endDate: lease.endDate,
    monthlyRent: lease.monthlyRent,
    depositAmount: lease.depositAmount,
    fees,
    occupantIds: occupants,
  }
  const firstInvoiceLines = buildFirstInvoice(terms, lease.startDate, proration, received, meterStarts)
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

export async function insertLease(
  tx: DB,
  ctx: AccessContext,
  input: LeaseInput,
  fromDepositId: string | null,
): Promise<LeaseCreated> {
  const { room, tenant, occupants } = await validateLeaseInput(tx, ctx, input)
  const lease = await insertLeaseRow(tx, input, room, tenant, occupants, fromDepositId)
  const meterStarts = await insertLeaseFees(tx, ctx, lease, room, input)
  const received = await recordLeaseDeposit(tx, lease, input, fromDepositId)
  const createdHandoverItems = input.handover ? await applyCheckInHandover(tx, ctx, lease, room, input.handover) : []
  return finishLease(tx, ctx, lease, room, occupants, received, meterStarts, createdHandoverItems)
}
