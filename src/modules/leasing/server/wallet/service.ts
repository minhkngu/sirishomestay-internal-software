import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { invoices, leases, payments, rooms, tenants, tenantWalletEntries } from '@/db'
import type { DB } from '@/db/client'
import { can, type AccessContext } from '@/domain/access'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { WalletEntryKind } from '@/domain/statuses'
import { recordAudit } from '@/modules/platform'

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

/** Số dư ví của khách: tổng các biến động, dùng ở mọi cơ sở. */
export async function walletBalance(db: DB, tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${tenantWalletEntries.amount}), 0)::float8` })
    .from(tenantWalletEntries)
    .where(eq(tenantWalletEntries.tenantId, tenantId))
  return row?.n ?? 0
}

/** Ghi một biến động ví; trùng `sourceKey` thì bỏ qua. Trả true chỉ khi thật sự chèn (an toàn khi chạy song song). */
export async function addWalletEntry(tx: DB, e: WalletEntryInput): Promise<boolean> {
  const rows = await tx
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
    .returning()
  return rows.length > 0
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
    const net = new Map<string, number>()
    for (const r of rows) net.set(r.tenantId, (net.get(r.tenantId) ?? 0) - r.amount)
    for (const [tenantId, delta] of net)
      if ((await walletBalance(tx, tenantId)) + delta < 0)
        throw new ValidationError('Tiền dư của khoản thu này đã được dùng: gỡ các khoản dùng ví trước')
  }
  await tx.delete(tenantWalletEntries).where(
    inArray(
      tenantWalletEntries.id,
      rows.map((r) => r.id),
    ),
  )
}

/** Cách xử lý tiền của phiếu thu bị gỡ: chuyển vào ví khách, trả lại khách, hoặc phiếu nhập nhầm (không có thật). */
export type PaymentRemoval = { kind: 'to_wallet' } | { kind: 'refund'; refundOn: string } | { kind: 'mistake' }

/**
 * Xử lý ví cho các phiếu thu sắp bị xoá; chạy TRƯỚC khi xoá phiếu. Phiếu trả bằng ví thì trả lại ví (mọi cách gỡ);
 * phiếu gộp vào thanh lý không gỡ tay được; phiếu tiền thật: `to_wallet` ghi `reallocate` (giữ ngày thu gốc),
 * `refund` thêm `refund_out` (chi), `mistake` rút tiền dư (`overpay`) của phiếu, từ chối nếu ví sẽ âm.
 */
export async function settleRemovedPayments(
  tx: DB,
  ctx: AccessContext,
  paymentIds: string[],
  removal: PaymentRemoval,
  note: string,
): Promise<void> {
  if (!paymentIds.length) return
  const rows = await tx
    .select({
      p: payments,
      facilityId: invoices.facilityId,
      leaseId: invoices.leaseId,
      tenantId: leases.tenantId,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(leases, eq(leases.id, invoices.leaseId))
    .where(inArray(payments.id, paymentIds))
  if (rows.some((r) => r.p.method === 'carry')) throw new ValidationError('Khoản gộp vào thanh lý không gỡ tay được')
  for (const tenantId of [...new Set(rows.map((r) => r.tenantId))])
    await tx.execute(sql`select id from tenants where id = ${tenantId} for update`)
  const delta = new Map<string, number>()
  const bump = (tenantId: string, n: number) => delta.set(tenantId, (delta.get(tenantId) ?? 0) + n)
  for (const r of rows) {
    const entries = await tx.select().from(tenantWalletEntries).where(eq(tenantWalletEntries.paymentId, r.p.id))
    if (r.p.method === 'wallet') {
      const used = entries.filter((e) => e.kind === 'use_invoice')
      for (const e of used) bump(r.tenantId, -e.amount)
      if (used.length)
        await tx.delete(tenantWalletEntries).where(
          inArray(
            tenantWalletEntries.id,
            used.map((e) => e.id),
          ),
        )
      continue
    }
    if (removal.kind === 'mistake') {
      const over = entries.filter((e) => e.kind === 'overpay')
      for (const e of over) bump(r.tenantId, -e.amount)
      if (over.length)
        await tx.delete(tenantWalletEntries).where(
          inArray(
            tenantWalletEntries.id,
            over.map((e) => e.id),
          ),
        )
      continue
    }
    const base = { tenantId: r.tenantId, facilityId: r.facilityId, leaseId: r.leaseId, invoiceId: r.p.invoiceId }
    await addWalletEntry(tx, {
      ...base,
      amount: r.p.amount,
      kind: 'reallocate',
      date: r.p.paidOn,
      note,
      sourceKey: `reallocate:${r.p.id}`,
    })
    bump(r.tenantId, r.p.amount)
    if (removal.kind === 'refund') {
      await addWalletEntry(tx, {
        ...base,
        amount: -r.p.amount,
        kind: 'refund_out',
        date: removal.refundOn,
        note,
        sourceKey: `refund_out:${r.p.id}`,
      })
      bump(r.tenantId, -r.p.amount)
    }
    // Tiền dư (overpay) của phiếu giữ nguyên; phiếu bị xoá thì cột paymentId của nó tự về rỗng
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'wallet',
      entityId: r.tenantId,
      facilityId: r.facilityId,
      summary: `${removal.kind === 'refund' ? 'Trả lại khách' : 'Chuyển vào ví khách'} ${r.p.amount.toLocaleString('vi-VN')} từ phiếu thu bị gỡ`,
      after: { paymentId: r.p.id, amount: r.p.amount },
    })
  }
  for (const [tenantId, d] of delta)
    if (d < 0 && (await walletBalance(tx, tenantId)) < 0)
      throw new ValidationError('Tiền dư của khoản thu này đã được dùng: gỡ các khoản dùng ví trước')
}

/**
 * Lịch sử biến động ví của khách (mới nhất trước). Cần quyền thu tiền ở cơ sở chính của khách
 * hoặc ở cơ sở của một hợp đồng của khách.
 */
export async function listWalletEntries(db: DB, ctx: AccessContext, tenantId: string) {
  const [tenant] = await db.select({ home: tenants.homeFacilityId }).from(tenants).where(eq(tenants.id, tenantId))
  if (!tenant) throw new NotFoundError('Không tìm thấy khách')
  const leaseFacilities = await db
    .selectDistinct({ id: rooms.facilityId })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .where(eq(leases.tenantId, tenantId))
  const facilityIds = [tenant.home, ...leaseFacilities.map((f) => f.id)].filter((x): x is string => !!x)
  if (!facilityIds.some((id) => can(ctx, 'billing', id))) throw new ForbiddenError('Không có quyền xem ví khách')
  return db
    .select()
    .from(tenantWalletEntries)
    .where(eq(tenantWalletEntries.tenantId, tenantId))
    .orderBy(desc(tenantWalletEntries.date), desc(tenantWalletEntries.createdAt))
}

/** Biến động ví có tiền thật đi qua (thu dư, phiếu chuyển vào ví, trả lại khách) trong phạm vi cơ sở và tháng, cho sổ quỹ. */
export async function listWalletCashEntries(db: DB, filter: { facilityIds: string[] | 'all'; month?: string }) {
  return db
    .select()
    .from(tenantWalletEntries)
    .where(
      and(
        inArray(tenantWalletEntries.kind, ['overpay', 'reallocate', 'refund_out']),
        filter.facilityIds === 'all'
          ? undefined
          : inArray(
              tenantWalletEntries.facilityId,
              filter.facilityIds.length ? filter.facilityIds : ['00000000-0000-0000-0000-000000000000'],
            ),
        filter.month ? sql`to_char(${tenantWalletEntries.date}, 'YYYY-MM') = ${filter.month}` : undefined,
      ),
    )
    .orderBy(desc(tenantWalletEntries.date))
}
