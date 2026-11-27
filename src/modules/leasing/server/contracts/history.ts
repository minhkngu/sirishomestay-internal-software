import { desc, eq, inArray } from 'drizzle-orm'
import {
  addenda,
  contractVersions,
  depositContracts,
  depositEntries,
  handoverItems,
  handovers,
  invoiceLines,
  invoices,
  leaseFeeMeters,
  leaseFeeSnapshots,
  leaseOccupants,
  leases,
  meterReadings,
  meters,
  payments,
  pendingAdjustments,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { NotFoundError } from '@/domain/errors'

export async function captureContractVersion(
  tx: DB,
  ctx: AccessContext,
  kind: 'lease' | 'deposit',
  id: string,
  operation: 'edit' | 'termination' | 'assignment' | 'extension',
): Promise<string> {
  const [last] = await tx
    .select({ sequence: contractVersions.sequence })
    .from(contractVersions)
    .where(eq(contractVersions.contractId, id))
    .orderBy(desc(contractVersions.sequence))
    .limit(1)
  const [contract] =
    kind === 'lease'
      ? await tx.select().from(leases).where(eq(leases.id, id))
      : await tx.select().from(depositContracts).where(eq(depositContracts.id, id))
  if (!contract) throw new NotFoundError()
  const entries = await tx
    .select()
    .from(depositEntries)
    .where(kind === 'lease' ? eq(depositEntries.leaseId, id) : eq(depositEntries.depositContractId, id))
  const invoiceRows = kind === 'lease' ? await tx.select().from(invoices).where(eq(invoices.leaseId, id)) : []
  const invoiceIds = invoiceRows.map((i) => i.id)
  const related =
    kind === 'lease'
      ? {
          occupants: await tx.select().from(leaseOccupants).where(eq(leaseOccupants.leaseId, id)),
          addenda: await tx.select().from(addenda).where(eq(addenda.leaseId, id)),
          handovers: await tx.select().from(handovers).where(eq(handovers.leaseId, id)),
          adjustments: await tx.select().from(pendingAdjustments).where(eq(pendingAdjustments.leaseId, id)),
          meters: await tx.select().from(meters).where(eq(meters.roomId, contract.roomId)),
          // Phí dịch vụ và đồng hồ gắn phí: để Khôi phục sau gia hạn hoặc sửa hợp đồng hoàn lại cả phí
          fees: await tx.select().from(leaseFeeSnapshots).where(eq(leaseFeeSnapshots.leaseId, id)),
          feeMeters: await tx
            .select({ leaseFeeId: leaseFeeMeters.leaseFeeId, meterId: leaseFeeMeters.meterId })
            .from(leaseFeeMeters)
            .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
            .where(eq(leaseFeeSnapshots.leaseId, id)),
        }
      : { occupants: [], addenda: [], handovers: [], adjustments: [], meters: [], fees: [], feeMeters: [] }
  const handoverIds = related.handovers.map((h) => h.id)
  const meterIds = related.meters.map((m) => m.id)
  const snapshot = {
    contract,
    entries,
    invoices: invoiceRows,
    ...related,
    payments: invoiceIds.length ? await tx.select().from(payments).where(inArray(payments.invoiceId, invoiceIds)) : [],
    invoiceLines: invoiceIds.length
      ? await tx.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invoiceIds))
      : [],
    handoverItems: handoverIds.length
      ? await tx.select().from(handoverItems).where(inArray(handoverItems.handoverId, handoverIds))
      : [],
    meterReadings: meterIds.length
      ? await tx.select().from(meterReadings).where(inArray(meterReadings.meterId, meterIds))
      : [],
  }
  const [row] = await tx
    .insert(contractVersions)
    .values({ contractId: id, kind, operation, sequence: (last?.sequence ?? 0) + 1, actorId: ctx.userId, snapshot })
    .returning()
  return row.id
}

/** Record exactly which meter readings termination inserted or updated. */
export async function recordTerminationReadings(
  tx: DB,
  versionId: string,
  date: string,
  meterIds: string[],
): Promise<void> {
  const [version] = await tx.select().from(contractVersions).where(eq(contractVersions.id, versionId))
  const snapshot = version.snapshot as { meterReadings: (typeof meterReadings.$inferSelect)[] }
  const after = meterIds.length
    ? await tx.select().from(meterReadings).where(inArray(meterReadings.meterId, meterIds))
    : []
  const changes = after
    .filter((row) => row.kind === 'termination' && row.readOn === date)
    .map((row) => ({ after: row, before: snapshot.meterReadings.find((old) => old.id === row.id) ?? null }))
  await tx
    .update(contractVersions)
    .set({ snapshot: { ...snapshot, terminationReadings: changes } })
    .where(eq(contractVersions.id, versionId))
}

export async function recordTerminationHandover(
  tx: DB,
  versionId: string,
  createdHandoverId: string | null,
): Promise<void> {
  const [version] = await tx.select().from(contractVersions).where(eq(contractVersions.id, versionId))
  await tx
    .update(contractVersions)
    .set({ snapshot: { ...(version.snapshot as object), terminationHandoverId: createdHandoverId } })
    .where(eq(contractVersions.id, versionId))
}

/** Ghi các khoản phát sinh (phạt…) do thanh lý tạo ra để hoàn tác xoá đúng chúng. */
export async function recordTerminationOneOffs(tx: DB, versionId: string, oneOffIds: string[]): Promise<void> {
  const [version] = await tx.select().from(contractVersions).where(eq(contractVersions.id, versionId))
  await tx
    .update(contractVersions)
    .set({ snapshot: { ...(version.snapshot as object), terminationOneOffIds: oneOffIds } })
    .where(eq(contractVersions.id, versionId))
}
