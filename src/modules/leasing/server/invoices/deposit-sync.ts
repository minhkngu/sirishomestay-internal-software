import { and, asc, eq } from 'drizzle-orm'
import { depositEntries, invoiceLines, invoices, payments } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { splitPaymentsDepositFirst } from '@/domain/deposit'
import { recordAudit } from '@/modules/platform'

/**
 * Tiền thu của hoá đơn có dòng "Tiền cọc còn thiếu" trả cọc trước, phần còn lại là tiền thuê. Khi phần cọc đã thu đủ,
 * dòng thu cọc đang chờ trong sổ cọc được hoàn tất (thu cùng hoá đơn); khoản thu bị gỡ hoặc sửa làm phần cọc không còn đủ thì trả về chờ.
 * Dòng hoàn tất ở đây đánh dấu bằng ghi chú để sổ quỹ không tính hai lần.
 */
export async function syncDepositWithInvoice(tx: DB, ctx: AccessContext, invoiceId: string): Promise<void> {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId))
  if (!inv) return
  const [lines, pays] = await Promise.all([
    tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)),
    tx
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(asc(payments.paidOn), asc(payments.createdAt)),
  ])
  const marker = `Thu cùng hoá đơn ${inv.code}`
  const depositDue = lines.filter((l) => l.type === 'deposit').reduce((n, l) => n + l.amount, 0)
  const covered =
    inv.status === 'approved' && depositDue > 0
      ? [...splitPaymentsDepositFirst(pays, depositDue).values()].reduce((n, x) => n + x.deposit, 0)
      : 0
  const entries = await tx.select().from(depositEntries).where(eq(depositEntries.leaseId, inv.leaseId))
  const strip = (note: string) => note.replace(` · ${marker}`, '').replace(marker, '').trim()
  const doneByInvoice = entries.filter((x) => x.status === 'done' && x.note.includes(marker))
  // Phần cọc đã thu chưa đủ cho các dòng đã hoàn tất: trả về chờ, dòng mới nhất trước
  let keep = covered
  for (const e of [...doneByInvoice].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (e.amount <= keep) {
      keep -= e.amount
      continue
    }
    await tx
      .update(depositEntries)
      .set({ status: 'pending', method: null, note: strip(e.note), updatedAt: new Date() })
      .where(eq(depositEntries.id, e.id))
  }
  let remaining = keep
  if (remaining <= 0 || pays.length === 0) return
  const last = pays.at(-1)!
  const pending = entries
    .filter((x) => x.status === 'pending' && (x.type === 'collect' || x.type === 'topup'))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt.getTime() - b.createdAt.getTime()))
  for (const e of pending) {
    if (e.amount > remaining) continue
    remaining -= e.amount
    const [after] = await tx
      .update(depositEntries)
      .set({
        status: 'done',
        date: last.paidOn,
        method: last.method,
        note: e.note ? `${e.note} · ${marker}` : marker,
        updatedAt: new Date(),
      })
      .where(and(eq(depositEntries.id, e.id), eq(depositEntries.status, 'pending')))
      .returning()
    if (after)
      await recordAudit(tx, ctx, {
        action: 'update',
        entity: 'deposit_entry',
        entityId: e.id,
        facilityId: inv.facilityId,
        summary: `Hoàn tất dòng sổ cọc (${marker})`,
        before: e,
        after,
      })
  }
}
