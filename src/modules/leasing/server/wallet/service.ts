import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { leases, rooms, tenants, tenantWalletEntries } from '@/db'
import type { DB } from '@/db/client'
import { can, type AccessContext } from '@/domain/access'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
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
