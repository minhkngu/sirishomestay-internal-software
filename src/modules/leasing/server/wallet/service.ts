import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { tenantWalletEntries } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import type { WalletEntryKind } from '@/domain/statuses'

export type WalletEntryInput = {
  tenantId: string
  facilityId: string
  /** Dương là cộng vào ví (thu vượt), âm là dùng. */
  amount: number
  kind: WalletEntryKind
  leaseId?: string
  invoiceId?: string
  paymentId?: string
  date: string
  note?: string
  /** Khoá chống ghi trùng: ghi lại cùng khoá thì bỏ qua. */
  sourceKey: string
}

/** Số dư ví của khách tại một cơ sở: tổng các biến động. Ví không dùng chéo cơ sở. */
export async function walletBalance(db: DB, tenantId: string, facilityId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${tenantWalletEntries.amount}), 0)::float8` })
    .from(tenantWalletEntries)
    .where(and(eq(tenantWalletEntries.tenantId, tenantId), eq(tenantWalletEntries.facilityId, facilityId)))
  return row?.n ?? 0
}

/** Ghi một biến động ví; trùng `sourceKey` thì bỏ qua. Trả true nếu đã ghi mới. */
export async function addWalletEntry(tx: DB, e: WalletEntryInput): Promise<boolean> {
  const [exists] = await tx
    .select({ id: tenantWalletEntries.id })
    .from(tenantWalletEntries)
    .where(eq(tenantWalletEntries.sourceKey, e.sourceKey))
  if (exists) return false
  await tx
    .insert(tenantWalletEntries)
    .values({
      tenantId: e.tenantId,
      facilityId: e.facilityId,
      amount: e.amount,
      kind: e.kind,
      leaseId: e.leaseId ?? null,
      invoiceId: e.invoiceId ?? null,
      paymentId: e.paymentId ?? null,
      date: e.date,
      note: e.note ?? '',
      sourceKey: e.sourceKey,
    })
    .onConflictDoNothing({ target: tenantWalletEntries.sourceKey })
  return true
}

/**
 * Gỡ các biến động ví gắn với khoản thu sắp bị xoá: dùng ví (−) được trả lại, thu vượt (+) bị rút lại.
 * Mặc định từ chối nếu rút lại làm ví âm (tiền dư đã được dùng); `allowNegative` dùng khi xoá cả hợp đồng.
 */
export async function reverseWalletForPayments(
  tx: DB,
  paymentIds: string[],
  opts: { allowNegative?: boolean } = {},
): Promise<void> {
  if (!paymentIds.length) return
  const rows = await tx.select().from(tenantWalletEntries).where(inArray(tenantWalletEntries.paymentId, paymentIds))
  if (!rows.length) return
  if (!opts.allowNegative) {
    const net = new Map<string, { tenantId: string; facilityId: string; delta: number }>()
    for (const r of rows) {
      const key = `${r.tenantId}|${r.facilityId}`
      const g = net.get(key) ?? { tenantId: r.tenantId, facilityId: r.facilityId, delta: 0 }
      g.delta -= r.amount
      net.set(key, g)
    }
    for (const g of net.values())
      if ((await walletBalance(tx, g.tenantId, g.facilityId)) + g.delta < 0)
        throw new ValidationError('Tiền dư của khoản thu này đã được dùng: gỡ các khoản dùng ví trước')
  }
  await tx.delete(tenantWalletEntries).where(
    inArray(
      tenantWalletEntries.id,
      rows.map((r) => r.id),
    ),
  )
}

/** Lịch sử biến động ví của khách tại một cơ sở (mới nhất trước); cần quyền thu tiền ở cơ sở đó. */
export async function listWalletEntries(db: DB, ctx: AccessContext, tenantId: string, facilityId: string) {
  assertCan(ctx, 'billing', facilityId)
  return db
    .select()
    .from(tenantWalletEntries)
    .where(and(eq(tenantWalletEntries.tenantId, tenantId), eq(tenantWalletEntries.facilityId, facilityId)))
    .orderBy(desc(tenantWalletEntries.date), desc(tenantWalletEntries.createdAt))
}

/** Biến động thu vượt (tiền thật khách đưa) trong phạm vi cơ sở và tháng, cho sổ quỹ. */
export async function listOverpayEntries(db: DB, filter: { facilityIds: string[] | 'all'; month?: string }) {
  const rows = await db
    .select()
    .from(tenantWalletEntries)
    .where(eq(tenantWalletEntries.kind, 'overpay'))
    .orderBy(desc(tenantWalletEntries.date))
  return rows.filter(
    (r) =>
      (filter.facilityIds === 'all' || filter.facilityIds.includes(r.facilityId)) &&
      (!filter.month || r.date.startsWith(filter.month)),
  )
}
