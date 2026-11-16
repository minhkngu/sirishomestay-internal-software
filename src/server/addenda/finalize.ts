import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { addenda, depositContracts, depositEntries, files, handoverItems, handovers, invoiceLines, leaseOccupants, leases } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { addDays } from '@/domain/dates'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry, ForfeitInput } from '@/domain/types'
import { recordAudit } from '@/server/audit'
import { getSettings } from '@/server/settings/service'

/**
 * Chạy khi hoá đơn thanh lý được duyệt: hợp đồng → ended; sổ cọc ghi `forfeit` (mất cọc) và `deduct` (phần cọc đã trừ vào hoá đơn)
 * ở trạng thái done để số dư về 0; đặt hạn xoá ảnh. Tiền hoàn khách theo dõi trên chính hoá đơn, không ghi thêm dòng `refund`.
 */
export async function finalizeTermination(tx: DB, ctx: AccessContext, invoice: { id: string; leaseId: string; facilityId: string }): Promise<void> {
  const [a] = await tx.select().from(addenda).where(and(eq(addenda.leaseId, invoice.leaseId), eq(addenda.type, 'termination'))).orderBy(desc(addenda.createdAt)).limit(1)
  if (!a) return
  const [lease] = await tx.select().from(leases).where(eq(leases.id, invoice.leaseId))
  if (!lease || lease.status === 'ended') return
  const endDate = a.effectiveDate
  await tx.update(leases).set({ status: 'ended', endDate, updatedAt: new Date() }).where(eq(leases.id, lease.id))

  const entries = await tx.select().from(depositEntries).where(eq(depositEntries.leaseId, lease.id))
  const balance = depositBalance(entries.map(e => ({ id: e.id, date: e.date, type: e.type as DepositEntry['type'], amount: e.amount, status: e.status as DepositEntry['status'] })))
  const forfeit = (a.depositForfeit ?? { mode: 'none' }) as ForfeitInput
  const forfeited = forfeit.mode === 'all' ? balance : forfeit.mode === 'partial' ? Math.min(forfeit.amount ?? 0, balance) : 0
  const offsetLines = await tx.select({ amount: invoiceLines.amount }).from(invoiceLines).where(and(eq(invoiceLines.invoiceId, invoice.id), eq(invoiceLines.type, 'deposit_offset')))
  const offset = Math.min(-offsetLines.reduce((n, l) => n + l.amount, 0), balance - forfeited)
  if (forfeited > 0) await tx.insert(depositEntries).values({ leaseId: lease.id, date: endDate, type: 'forfeit', amount: forfeited, status: 'done', note: 'Mất cọc khi thanh lý' })
  if (offset > 0) await tx.insert(depositEntries).values({ leaseId: lease.id, date: endDate, type: 'deduct', amount: offset, status: 'done', note: `Trừ vào hoá đơn thanh lý` })

  // Hạn xoá ảnh: ảnh bàn giao của hợp đồng; ảnh giấy tờ chỉ khi khách không còn hợp đồng thuê/cọc khác
  const { photoRetentionDays } = await getSettings(tx)
  const deleteAfter = addDays(endDate, photoRetentionDays)
  const items = await tx.select({ id: handoverItems.id }).from(handoverItems).innerJoin(handovers, eq(handovers.id, handoverItems.handoverId)).where(eq(handovers.leaseId, lease.id))
  if (items.length) await tx.update(files).set({ deleteAfter, updatedAt: new Date() }).where(and(eq(files.ownerType, 'handover_photo'), inArray(files.ownerId, items.map(i => i.id))))
  const occupants = await tx.select({ id: leaseOccupants.tenantId }).from(leaseOccupants).where(eq(leaseOccupants.leaseId, lease.id))
  const tenantIds = [...new Set([lease.tenantId, ...occupants.map(o => o.id)])]
  for (const tenantId of tenantIds) {
    const [otherLease] = await tx.select({ id: leases.id }).from(leases)
      .where(and(eq(leases.status, 'active'), ne(leases.id, lease.id), eq(leases.tenantId, tenantId))).limit(1)
    const [asOccupant] = await tx.select({ id: leases.id }).from(leaseOccupants).innerJoin(leases, eq(leases.id, leaseOccupants.leaseId))
      .where(and(eq(leaseOccupants.tenantId, tenantId), eq(leases.status, 'active'), ne(leases.id, lease.id))).limit(1)
    const [pendingDeposit] = await tx.select({ id: depositContracts.id }).from(depositContracts).where(and(eq(depositContracts.tenantId, tenantId), eq(depositContracts.status, 'pending'))).limit(1)
    if (!otherLease && !asOccupant && !pendingDeposit) await tx.update(files).set({ deleteAfter, updatedAt: new Date() }).where(and(eq(files.ownerType, 'tenant_document'), eq(files.ownerId, tenantId)))
  }
  await recordAudit(tx, ctx, { action: 'update', entity: 'lease', entityId: lease.id, facilityId: invoice.facilityId, summary: `Thanh lý hợp đồng ${lease.code}`, before: { status: lease.status, endDate: lease.endDate }, after: { status: 'ended', endDate, forfeited, offset } })
}
