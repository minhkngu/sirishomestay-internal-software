import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import {
  addenda,
  contractVersions,
  depositContracts,
  depositEntries,
  files,
  handoverItems,
  handovers,
  invoiceLines,
  leaseOccupants,
  leases,
  pendingAdjustments,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { addDays } from '@/domain/dates'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry, ForfeitInput } from '@/domain/types'
import { recordAudit, getSettings } from '@/modules/platform'
import { addWalletEntry } from '../wallet/service'

/**
 * Chốt trạng thái hợp đồng thanh lý (`ended`), cập nhật `endDate`, đặt hạn xoá ảnh bàn giao/giấy tờ,
 * và đánh dấu `terminationFinalized: true` trong `contractVersions` để khôi phục vẫn hoạt động trọn vẹn.
 */
export async function applyTerminationClosure(
  tx: DB,
  ctx: AccessContext,
  opts: { leaseId: string; facilityId: string; endDate: string; versionId?: string },
): Promise<void> {
  const [lease] = await tx.select().from(leases).where(eq(leases.id, opts.leaseId))
  if (!lease || lease.status === 'ended') return
  const endDate = opts.endDate
  await tx.update(leases).set({ status: 'ended', endDate, updatedAt: new Date() }).where(eq(leases.id, lease.id))

  const { photoRetentionDays } = await getSettings(tx)
  const deleteAfter = addDays(endDate, photoRetentionDays)
  const items = await tx
    .select({ id: handoverItems.id })
    .from(handoverItems)
    .innerJoin(handovers, eq(handovers.id, handoverItems.handoverId))
    .where(eq(handovers.leaseId, lease.id))
  const beforeFiles: (typeof files.$inferSelect)[] = []
  if (items.length) {
    beforeFiles.push(
      ...(await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.ownerType, 'handover_photo'),
            inArray(
              files.ownerId,
              items.map((i) => i.id),
            ),
          ),
        )),
    )
    await tx
      .update(files)
      .set({ deleteAfter, updatedAt: new Date() })
      .where(
        and(
          eq(files.ownerType, 'handover_photo'),
          inArray(
            files.ownerId,
            items.map((i) => i.id),
          ),
        ),
      )
  }
  const occupants = await tx
    .select({ id: leaseOccupants.tenantId })
    .from(leaseOccupants)
    .where(eq(leaseOccupants.leaseId, lease.id))
  const tenantIds = [...new Set([lease.tenantId, ...occupants.map((o) => o.id)])]
  for (const tenantId of tenantIds) {
    const [otherLease] = await tx
      .select({ id: leases.id })
      .from(leases)
      .where(and(eq(leases.status, 'active'), ne(leases.id, lease.id), eq(leases.tenantId, tenantId)))
      .limit(1)
    const [asOccupant] = await tx
      .select({ id: leases.id })
      .from(leaseOccupants)
      .innerJoin(leases, eq(leases.id, leaseOccupants.leaseId))
      .where(and(eq(leaseOccupants.tenantId, tenantId), eq(leases.status, 'active'), ne(leases.id, lease.id)))
      .limit(1)
    const [pendingDeposit] = await tx
      .select({ id: depositContracts.id })
      .from(depositContracts)
      .where(and(eq(depositContracts.tenantId, tenantId), eq(depositContracts.status, 'pending')))
      .limit(1)
    if (!otherLease && !asOccupant && !pendingDeposit) {
      beforeFiles.push(
        ...(await tx
          .select()
          .from(files)
          .where(and(eq(files.ownerType, 'tenant_document'), eq(files.ownerId, tenantId)))),
      )
      await tx
        .update(files)
        .set({ deleteAfter, updatedAt: new Date() })
        .where(and(eq(files.ownerType, 'tenant_document'), eq(files.ownerId, tenantId)))
    }
  }
  const [version] = opts.versionId
    ? await tx.select().from(contractVersions).where(eq(contractVersions.id, opts.versionId)).limit(1)
    : await tx
        .select()
        .from(contractVersions)
        .where(
          and(
            eq(contractVersions.contractId, lease.id),
            eq(contractVersions.kind, 'lease'),
            eq(contractVersions.operation, 'termination'),
          ),
        )
        .orderBy(desc(contractVersions.sequence))
        .limit(1)
  if (version) {
    const retention = beforeFiles.map((file) => ({
      id: file.id,
      before: file.deleteAfter,
      after: deleteAfter,
      name: file.name,
      facilityId: file.facilityId,
    }))
    await tx
      .update(contractVersions)
      .set({ snapshot: { ...(version.snapshot as object), terminationFinalized: true, retention } })
      .where(eq(contractVersions.id, version.id))
  }
  await recordAudit(tx, ctx, {
    action: 'update',
    entity: 'lease',
    entityId: lease.id,
    facilityId: opts.facilityId,
    summary: `Thanh lý hợp đồng ${lease.code}`,
    before: { status: lease.status, endDate: lease.endDate },
    after: { status: 'ended', endDate },
  })
}

/**
 * Duyệt hoá đơn thanh lý: trừ ví khách thật bằng dòng ví của hoá đơn, và nếu hợp đồng này được chuyển phòng
 * (có hợp đồng mới trỏ về nó) thì cộng dồn kết quả T (dương là nợ, âm là số dư) sang hợp đồng mới thành điều chỉnh chờ.
 * Mọi bút toán có `sourceKey` nên chạy lại không ghi trùng.
 */
async function settleWalletAndTransfer(
  tx: DB,
  invoice: { id: string; facilityId: string },
  lease: { id: string; code: string; tenantId: string },
  endDate: string,
): Promise<void> {
  const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id))
  const meta = (l: (typeof lines)[number]) => (l.meta ?? {}) as Record<string, unknown>
  const walletLine = lines.find((l) => typeof meta(l).wallet === 'number')
  if (walletLine && walletLine.amount < 0)
    await addWalletEntry(tx, {
      tenantId: lease.tenantId,
      facilityId: invoice.facilityId,
      amount: walletLine.amount,
      kind: 'use_termination',
      leaseId: lease.id,
      invoiceId: invoice.id,
      date: endDate,
      note: 'Ví khách gạch vào hoá đơn thanh lý',
      sourceKey: `use_termination:${invoice.id}`,
    })
  const transferLine = lines.find((l) => meta(l).transfer === true)
  if (!transferLine) return
  const [next] = await tx.select({ id: leases.id }).from(leases).where(eq(leases.transferFromLeaseId, lease.id))
  const carried = -transferLine.amount
  if (!next || carried === 0) return
  await tx
    .insert(pendingAdjustments)
    .values({
      leaseId: next.id,
      description: `Chuyển từ hợp đồng ${lease.code}`,
      amount: carried,
      sourceKey: `transfer:${lease.id}`,
    })
    .onConflictDoNothing({ target: pendingAdjustments.sourceKey })
}

/**
 * Chạy khi hoá đơn thanh lý được duyệt: chốt hợp đồng nếu chưa chốt (dữ liệu cũ);
 * ghi sổ cọc `forfeit` (mất cọc) và `deduct` (phần cọc đã trừ vào hoá đơn) ở trạng thái done để số dư về 0.
 */
export async function finalizeTermination(
  tx: DB,
  ctx: AccessContext,
  invoice: { id: string; leaseId: string; facilityId: string },
): Promise<void> {
  const [a] = await tx
    .select()
    .from(addenda)
    .where(and(eq(addenda.leaseId, invoice.leaseId), eq(addenda.type, 'termination')))
    .orderBy(desc(addenda.createdAt))
    .limit(1)
  if (!a) return
  const [lease] = await tx.select().from(leases).where(eq(leases.id, invoice.leaseId))
  if (!lease) return
  const endDate = a.effectiveDate
  if (lease.status !== 'ended') {
    await applyTerminationClosure(tx, ctx, {
      leaseId: lease.id,
      facilityId: invoice.facilityId,
      endDate,
    })
  }
  await settleWalletAndTransfer(tx, invoice, lease, endDate)

  const entries = await tx.select().from(depositEntries).where(eq(depositEntries.leaseId, lease.id))
  const alreadySettled = entries.some((e) => e.status === 'done' && (e.type === 'forfeit' || e.type === 'deduct'))
  if (alreadySettled) return
  const balance = depositBalance(
    entries.map((e) => ({
      id: e.id,
      date: e.date,
      type: e.type as DepositEntry['type'],
      amount: e.amount,
      status: e.status as DepositEntry['status'],
    })),
  )
  const forfeit = (a.depositForfeit ?? { mode: 'none' }) as ForfeitInput
  const forfeited =
    forfeit.mode === 'all' ? balance : forfeit.mode === 'partial' ? Math.min(forfeit.amount ?? 0, balance) : 0
  const offsetLines = await tx
    .select({ amount: invoiceLines.amount })
    .from(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, invoice.id), eq(invoiceLines.type, 'deposit_offset')))
  const offset = Math.min(-offsetLines.reduce((n, l) => n + l.amount, 0), balance - forfeited)
  if (forfeited > 0)
    await tx.insert(depositEntries).values({
      leaseId: lease.id,
      date: endDate,
      type: 'forfeit',
      amount: forfeited,
      status: 'done',
      note: 'Mất cọc khi thanh lý',
    })
  if (offset > 0)
    await tx.insert(depositEntries).values({
      leaseId: lease.id,
      date: endDate,
      type: 'deduct',
      amount: offset,
      status: 'done',
      note: `Trừ vào hoá đơn thanh lý`,
    })
}
