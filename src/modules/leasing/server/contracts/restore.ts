import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import {
  addenda,
  contractVersions,
  depositContracts,
  depositEntries,
  files,
  handoverItems,
  handovers,
  invoiceLines,
  invoices,
  leaseOccupants,
  leases,
  meterReadings,
  oneOffCharges,
  payments,
  pendingAdjustments,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import { assertCan, can, facilityKey, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { todayVN } from '@/domain/dates'
import { recordAudit } from '@/modules/platform'
import type { StorageAdapter } from '@/modules/platform'

type Kind = 'lease' | 'deposit'
type Snapshot = {
  contract: typeof leases.$inferSelect | typeof depositContracts.$inferSelect
  occupants: { tenantId: string }[]
  entries: { id: string }[]
  invoices: { id: string }[]
  payments: { id: string }[]
  addenda: { id: string }[]
  handovers: { id: string }[]
  terminationHandoverId?: string | null
  terminationReadings?: { before: typeof meterReadings.$inferSelect | null; after: typeof meterReadings.$inferSelect }[]
  terminationFinalized?: boolean
  terminationOneOffIds?: string[]
  retention?: { id: string; before: string | null; after: string; name: string; facilityId: string | null }[]
}
export type RestorePreview = {
  versionId: string
  operation: string
  items: { type: string; id: string; label: string }[]
  blockedReason: string | null
  token: string
}

/** Read-only preview. A later mutation must re-read it under locks and compare the token. */
export async function previewContractRestore(
  db: DB,
  ctx: AccessContext,
  kind: Kind,
  id: string,
): Promise<RestorePreview> {
  if (kind !== 'lease' && kind !== 'deposit') throw new ValidationError('Loại hợp đồng không hợp lệ')
  const table = kind === 'lease' ? leases : depositContracts
  const [contract] = await db.select().from(table).where(eq(table.id, id))
  if (!contract) throw new NotFoundError()
  const [room] = await db.select().from(rooms).where(eq(rooms.id, contract.roomId))
  if (!room) throw new NotFoundError()
  assertCan(ctx, 'tenants_contracts', room.facilityId)
  const [version] = await db
    .select()
    .from(contractVersions)
    .where(and(eq(contractVersions.contractId, id), eq(contractVersions.kind, kind)))
    .orderBy(desc(contractVersions.sequence))
    .limit(1)
  if (!version) throw new ValidationError('Không có thay đổi để khôi phục')
  const snapshot = version.snapshot as Snapshot
  const [previousRoom] = await db.select().from(rooms).where(eq(rooms.id, snapshot.contract.roomId))
  if (!previousRoom) throw new ValidationError('Phòng trước đó không còn tồn tại')
  assertCan(ctx, 'tenants_contracts', previousRoom.facilityId)
  const restoredPeople = [
    ...new Set([snapshot.contract.tenantId, ...snapshot.occupants.map((person) => person.tenantId)]),
  ]
  const people = await db
    .select({ id: tenants.id, facilityId: tenants.homeFacilityId })
    .from(tenants)
    .where(inArray(tenants.id, restoredPeople))
  if (people.length !== restoredPeople.length) throw new NotFoundError()
  for (const person of people) assertCan(ctx, 'tenants_contracts', facilityKey(person.facilityId))
  const entries = await db
    .select()
    .from(depositEntries)
    .where(kind === 'lease' ? eq(depositEntries.leaseId, id) : eq(depositEntries.depositContractId, id))
  const invoiceRows = kind === 'lease' ? await db.select().from(invoices).where(eq(invoices.leaseId, id)) : []
  for (const invoice of invoiceRows) assertCan(ctx, 'tenants_contracts', invoice.facilityId)
  const invoiceIds = invoiceRows.map((x) => x.id)
  const payRows = invoiceIds.length
    ? await db.select().from(payments).where(inArray(payments.invoiceId, invoiceIds))
    : []
  const addons = kind === 'lease' ? await db.select().from(addenda).where(eq(addenda.leaseId, id)) : []
  const handoverRows = kind === 'lease' ? await db.select().from(handovers).where(eq(handovers.leaseId, id)) : []
  const added = <T extends { id: string }>(current: T[], before: { id: string }[]) =>
    current.filter((row) => !before.some((old) => old.id === row.id))
  const items = [
    ...added(invoiceRows, snapshot.invoices).map((x) => ({ type: 'invoice', id: x.id, label: x.code })),
    ...added(payRows, snapshot.payments).map((x) => ({
      type: 'payment',
      id: x.id,
      label: `${x.paidOn} · ${x.amount}`,
    })),
    ...added(entries, snapshot.entries).map((x) => ({ type: 'deposit', id: x.id, label: `${x.date} · ${x.amount}` })),
    ...added(addons, snapshot.addenda).map((x) => ({
      type: 'addendum',
      id: x.id,
      label: `${x.type} · ${x.effectiveDate}`,
    })),
    ...(version.operation === 'termination' && snapshot.terminationHandoverId
      ? handoverRows
          .filter((x) => x.id === snapshot.terminationHandoverId)
          .map((x) => ({ type: 'handover', id: x.id, label: `${x.kind} · ${x.date}` }))
      : []),
  ].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  const addonIds = items.filter((item) => item.type === 'addendum').map((item) => item.id)
  const adjustments =
    kind === 'lease' && addonIds.length
      ? await db.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, id))
      : []
  for (const item of adjustments.filter((p) => addonIds.some((addonId) => p.sourceKey.startsWith(`${addonId}:`))))
    items.push({ type: 'adjustment', id: item.id, label: item.description })
  const lines = invoiceIds.length
    ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invoiceIds))
    : []
  for (const line of lines.filter(
    (line) =>
      typeof (line.meta as { sourceKey?: unknown } | null)?.sourceKey === 'string' &&
      addonIds.some((addonId) => String((line.meta as { sourceKey: string }).sourceKey).startsWith(`${addonId}:`)),
  ))
    items.push({ type: 'invoice_line', id: line.id, label: line.description })
  const handoverIds = items.filter((item) => item.type === 'handover').map((item) => item.id)
  const handoverItemRows = handoverIds.length
    ? await db.select().from(handoverItems).where(inArray(handoverItems.handoverId, handoverIds))
    : []
  const exportOwners = items
    .filter((item) => ['invoice', 'payment', 'addendum', 'handover'].includes(item.type))
    .map((item) => item.id)
  const exportFiles = exportOwners.length
    ? await db
        .select()
        .from(files)
        .where(and(eq(files.ownerType, 'export'), inArray(files.ownerId, exportOwners)))
    : []
  const signedAddenda = addonIds.length
    ? await db
        .select()
        .from(files)
        .where(and(eq(files.ownerType, 'signed_addendum'), inArray(files.ownerId, addonIds)))
    : []
  const photos = handoverItemRows.length
    ? await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.ownerType, 'handover_photo'),
            inArray(
              files.ownerId,
              handoverItemRows.map((item) => item.id),
            ),
          ),
        )
    : []
  for (const file of [...exportFiles, ...signedAddenda, ...photos]) {
    if (file.facilityId) assertCan(ctx, 'tenants_contracts', file.facilityId)
    items.push({ type: 'file', id: file.id, label: file.name || 'Tệp đính kèm' })
  }
  const readingEffects = snapshot.terminationReadings ?? []
  const currentReadings = readingEffects.length
    ? await db
        .select()
        .from(meterReadings)
        .where(
          inArray(
            meterReadings.id,
            readingEffects.map((effect) => effect.after.id),
          ),
        )
    : []
  for (const effect of readingEffects)
    items.push({
      type: 'meter_reading',
      id: effect.after.id,
      label: `${effect.after.readOn} · ${effect.after.value}${effect.before ? ' · trả lại chỉ số cũ' : ''}`,
    })
  const retention = snapshot.retention ?? []
  const currentRetention = retention.length
    ? await db
        .select()
        .from(files)
        .where(
          inArray(
            files.id,
            retention.map((item) => item.id),
          ),
        )
    : []
  for (const item of retention) {
    if (item.facilityId) assertCan(ctx, 'tenants_contracts', item.facilityId)
    items.push({ type: 'file_retention', id: item.id, label: `${item.name || 'Tệp'} · khôi phục hạn lưu` })
  }
  const oneOffIds = snapshot.terminationOneOffIds ?? []
  const oneOffRows = oneOffIds.length
    ? await db.select().from(oneOffCharges).where(inArray(oneOffCharges.id, oneOffIds))
    : []
  for (const row of oneOffRows)
    items.push({
      type: 'one_off',
      id: row.id,
      label: `${row.description || 'Khoản phát sinh'} · khoản do thanh lý tạo`,
    })
  items.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  let blockedReason: string | null = null
  if (version.operation !== 'termination' && contract.status !== snapshot.contract.status)
    blockedReason = 'Trạng thái hợp đồng đã thay đổi sau lần sửa; không thể khôi phục tự động'
  if (added(addons, snapshot.addenda).some((addon) => addon.type === 'transfer' || addon.type === 'occupants'))
    blockedReason = 'Có phụ lục chuyển phòng hoặc thay đổi người ở chưa hỗ trợ hoàn tác tự động'
  if (kind === 'lease' && snapshot.contract.status === 'active') {
    const [busy] = await db
      .select({ id: leases.id })
      .from(leases)
      .where(and(eq(leases.roomId, snapshot.contract.roomId), eq(leases.status, 'active'), ne(leases.id, id)))
      .limit(1)
    if (busy) blockedReason = 'Phòng đã có hợp đồng mới; không thể khôi phục'
  }
  if (
    readingEffects.some(
      (effect) =>
        !currentReadings.some(
          (reading) =>
            reading.id === effect.after.id &&
            reading.value === effect.after.value &&
            reading.readOn === effect.after.readOn,
        ),
    )
  )
    blockedReason = 'Chỉ số thanh lý đã thay đổi; không thể khôi phục tự động'
  if (version.operation === 'termination' && !snapshot.terminationReadings)
    blockedReason = 'Thiếu lịch sử chỉ số thanh lý; không thể khôi phục tự động'
  if (version.operation === 'termination' && snapshot.terminationHandoverId === undefined)
    blockedReason = 'Thiếu lịch sử bàn giao thanh lý; không thể khôi phục tự động'
  if (snapshot.terminationHandoverId && !handoverRows.some((h) => h.id === snapshot.terminationHandoverId))
    blockedReason = 'Biên bản thanh lý đã thay đổi; không thể khôi phục tự động'
  if (version.operation === 'termination' && contract.status === 'ended' && !snapshot.terminationFinalized)
    blockedReason = 'Thiếu lịch sử hoàn tất thanh lý; không thể khôi phục tự động'
  if (
    retention.some(
      (effect) => !currentRetention.some((file) => file.id === effect.id && file.deleteAfter === effect.after),
    )
  )
    blockedReason = 'Hạn lưu tệp đã thay đổi; không thể khôi phục tự động'
  const ordered = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
  const token = createHash('sha256')
    .update(
      JSON.stringify({
        versionId: version.id,
        contract,
        items,
        blockedReason,
        people: ordered(people),
        invoiceRows: ordered(invoiceRows),
        payRows: ordered(payRows),
        entries: ordered(entries),
        addons: ordered(addons),
        handoverRows: ordered(handoverRows),
        handoverItems: ordered(handoverItemRows),
        lines: ordered(lines),
        adjustments: ordered(adjustments),
        exportFiles: ordered(exportFiles),
        signedAddenda: ordered(signedAddenda),
        photos: ordered(photos),
        currentReadings: ordered(currentReadings),
        currentRetention: ordered(currentRetention),
      }),
    )
    .digest('hex')
  return { versionId: version.id, operation: version.operation, items, blockedReason, token }
}

/** Restore unsupported operations fail closed until their effects can be reversed safely. */
export async function restoreContract(
  db: DB,
  ctx: AccessContext,
  kind: Kind,
  id: string,
  previewToken: string,
  storage: StorageAdapter,
): Promise<{ pendingFiles: number }> {
  const fileIds = await db.transaction(
    async (raw) => {
      const tx = raw as unknown as DB
      const table = kind === 'lease' ? leases : depositContracts
      const [current] = await tx.select().from(table).where(eq(table.id, id)).for('update')
      if (!current) throw new NotFoundError()
      const preview = await previewContractRestore(tx, ctx, kind, id)
      if (preview.token !== previewToken)
        throw new ValidationError('Dữ liệu đã thay đổi; hãy xem lại trước khi xác nhận')
      if (preview.blockedReason) throw new ValidationError(preview.blockedReason)
      if (!['edit', 'extension', 'termination', 'assignment'].includes(preview.operation))
        throw new ValidationError('Chưa hỗ trợ khôi phục loại thay đổi này')
      const [version] = await tx.select().from(contractVersions).where(eq(contractVersions.id, preview.versionId))
      const snapshot = version.snapshot as Snapshot
      const ids = (type: string) => preview.items.filter((item) => item.type === type).map((item) => item.id)
      const invoiceIds = ids('invoice'),
        paymentIds = ids('payment'),
        entryIds = ids('deposit'),
        addonIds = ids('addendum'),
        handoverIds = ids('handover')
      for (const effect of snapshot.terminationReadings ?? []) {
        if (effect.before)
          await tx
            .update(meterReadings)
            .set({ value: effect.before.value, updatedAt: new Date() })
            .where(eq(meterReadings.id, effect.after.id))
        else await tx.delete(meterReadings).where(eq(meterReadings.id, effect.after.id))
      }
      for (const effect of snapshot.retention ?? [])
        await tx.update(files).set({ deleteAfter: effect.before, updatedAt: new Date() }).where(eq(files.id, effect.id))
      const adjustmentIds = ids('adjustment'),
        lineIds = ids('invoice_line')
      if (adjustmentIds.length) await tx.delete(pendingAdjustments).where(inArray(pendingAdjustments.id, adjustmentIds))
      if (lineIds.length) await tx.delete(invoiceLines).where(inArray(invoiceLines.id, lineIds))
      const affectedFiles = ids('file').length
        ? await tx
            .select()
            .from(files)
            .where(inArray(files.id, ids('file')))
        : []
      for (const file of affectedFiles) if (file.facilityId) assertCan(ctx, 'tenants_contracts', file.facilityId)
      const [currentRoom] = await tx.select().from(rooms).where(eq(rooms.id, current.roomId))
      if (affectedFiles.length)
        await tx
          .update(files)
          .set({
            ownerType: 'pending_contract_restore',
            confirmedAt: null,
            deleteAfter: todayVN(),
            facilityId: sql`coalesce(${files.facilityId}, ${currentRoom.facilityId})`,
            updatedAt: new Date(),
          })
          .where(
            inArray(
              files.id,
              affectedFiles.map((f) => f.id),
            ),
          )
      if (paymentIds.length) await tx.delete(payments).where(inArray(payments.id, paymentIds))
      if (invoiceIds.length) {
        await tx.update(oneOffCharges).set({ invoiceId: null }).where(inArray(oneOffCharges.invoiceId, invoiceIds))
        await tx
          .update(pendingAdjustments)
          .set({ invoiceId: null })
          .where(inArray(pendingAdjustments.invoiceId, invoiceIds))
        await tx.delete(invoices).where(inArray(invoices.id, invoiceIds))
      }
      if (ids('one_off').length) await tx.delete(oneOffCharges).where(inArray(oneOffCharges.id, ids('one_off')))
      if (entryIds.length) await tx.delete(depositEntries).where(inArray(depositEntries.id, entryIds))
      if (addonIds.length) await tx.delete(addenda).where(inArray(addenda.id, addonIds))
      if (handoverIds.length) await tx.delete(handovers).where(inArray(handovers.id, handoverIds))
      if (kind === 'lease') {
        const old = snapshot.contract as typeof leases.$inferSelect
        await tx
          .update(leases)
          .set({
            roomId: old.roomId,
            tenantId: old.tenantId,
            startDate: old.startDate,
            endDate: old.endDate,
            monthlyRent: old.monthlyRent,
            depositAmount: old.depositAmount,
            note: old.note,
            status: old.status,
            updatedAt: new Date(),
          })
          .where(eq(leases.id, id))
        await tx.delete(leaseOccupants).where(eq(leaseOccupants.leaseId, id))
        if (snapshot.occupants.length)
          await tx.insert(leaseOccupants).values(snapshot.occupants.map((o) => ({ leaseId: id, tenantId: o.tenantId })))
      } else {
        const old = snapshot.contract as typeof depositContracts.$inferSelect
        await tx
          .update(depositContracts)
          .set({
            roomId: old.roomId,
            tenantId: old.tenantId,
            depositAmount: old.depositAmount,
            agreedRent: old.agreedRent,
            expectedMoveIn: old.expectedMoveIn,
            updatedAt: new Date(),
          })
          .where(eq(depositContracts.id, id))
      }
      await tx.delete(contractVersions).where(eq(contractVersions.id, version.id))
      const [room] = await tx.select().from(rooms).where(eq(rooms.id, current.roomId))
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: kind === 'lease' ? 'lease' : 'deposit_contract',
        entityId: id,
        facilityId: room.facilityId,
        summary: 'Khôi phục hợp đồng một bước',
        before: current,
        after: { versionId: version.id, deleted: preview.items },
      })
      return affectedFiles
    },
    { isolationLevel: 'serializable' },
  )
  let pendingFiles = 0
  for (const file of fileIds) {
    try {
      await storage.delete(file.storageKey)
      if (file.thumbKey) await storage.delete(file.thumbKey)
      await db.delete(files).where(and(eq(files.id, file.id), eq(files.ownerType, 'pending_contract_restore')))
    } catch {
      pendingFiles++
    }
  }
  return { pendingFiles }
}

export async function cleanupPendingRestoredFiles(
  db: DB,
  ctx: AccessContext,
  storage: StorageAdapter,
): Promise<number> {
  assertCan(ctx, 'tenants_contracts')
  const rows = await db.select().from(files).where(eq(files.ownerType, 'pending_contract_restore'))
  let pending = 0
  for (const file of rows) {
    if (file.facilityId ? !can(ctx, 'tenants_contracts', file.facilityId) : !ctx.isAdmin) continue
    try {
      await storage.delete(file.storageKey)
      if (file.thumbKey) await storage.delete(file.thumbKey)
      await db.delete(files).where(and(eq(files.id, file.id), eq(files.ownerType, 'pending_contract_restore')))
    } catch {
      pending++
    }
  }
  return pending
}
