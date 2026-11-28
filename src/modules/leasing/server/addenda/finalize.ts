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
  payments,
  pendingAdjustments,
  tenantWalletEntries,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { addDays } from '@/domain/dates'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry, ForfeitInput } from '@/domain/types'
import { recordAudit, getSettings } from '@/modules/platform'
import { roomChangeBlockerMessage, type RoomChangeBlockers } from '../../domain/room-change-blockers'
import { rebalanceTransferLine } from '../../domain/transfer-line'
import { addWalletEntry, walletBalance } from '../wallet/service'

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

/** Hoá đơn tháng còn nháp hoặc còn nợ của hợp đồng (không tính hoá đơn thanh lý), cản việc chuyển phòng. */
export async function loadRoomChangeBlockers(tx: DB, leaseId: string): Promise<RoomChangeBlockers> {
  const rows = await tx
    .select({ id: invoices.id, code: invoices.code, status: invoices.status, periodStart: invoices.periodStart })
    .from(invoices)
    .where(and(eq(invoices.leaseId, leaseId), ne(invoices.kind, 'termination')))
    .orderBy(invoices.periodStart)
  if (!rows.length) return { drafts: [], unpaid: [] }
  const ids = rows.map((r) => r.id)
  const [totals, paids] = await Promise.all([
    tx
      .select({ id: invoiceLines.invoiceId, n: sql<number>`sum(${invoiceLines.amount})::float8` })
      .from(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, ids))
      .groupBy(invoiceLines.invoiceId),
    tx
      .select({ id: payments.invoiceId, n: sql<number>`sum(${payments.amount})::float8` })
      .from(payments)
      .where(inArray(payments.invoiceId, ids))
      .groupBy(payments.invoiceId),
  ])
  const sum = (list: { id: string; n: number }[], id: string) => list.find((x) => x.id === id)?.n ?? 0
  const period = (start: string) => `${start.slice(5, 7)}/${start.slice(0, 4)}`
  return {
    drafts: rows.filter((r) => r.status === 'draft').map((r) => ({ code: r.code, period: period(r.periodStart) })),
    unpaid: rows
      .filter((r) => r.status === 'approved' && sum(totals, r.id) > 0 && sum(totals, r.id) - sum(paids, r.id) > 0)
      .map((r) => ({
        code: r.code,
        period: period(r.periodStart),
        owed: sum(totals, r.id) - sum(paids, r.id),
      })),
  }
}

/**
 * Đóng nợ cũ của hợp đồng khi duyệt hoá đơn thanh lý (mọi loại): tính lại dòng "Nợ cũ" (meta.unpaid) theo nợ thật của các hoá đơn
 * tháng đã duyệt (khoản thu nhập trễ giữa lúc lập nháp và lúc duyệt làm số nợ giảm), rồi ghi khoản `carry` cho từng hoá đơn còn nợ
 * để không đòi hai lần. Chạy lại không ghi trùng: hoá đơn đã hết nợ thì bỏ qua. Bỏ duyệt hoá đơn thanh lý xoá các khoản `carry` này.
 */
export async function settleOldInvoices(
  tx: DB,
  ctx: AccessContext,
  terminationInvoiceId: string,
  paidOn?: string,
): Promise<void> {
  const [term] = await tx.select().from(invoices).where(eq(invoices.id, terminationInvoiceId))
  if (!term) return
  const old = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.leaseId, term.leaseId), eq(invoices.status, 'approved'), ne(invoices.kind, 'termination')))
  const debts: { id: string; owed: number }[] = []
  for (const inv of old) {
    const [t] = await tx
      .select({ n: sql<number>`coalesce(sum(${invoiceLines.amount}), 0)::float8` })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, inv.id))
    const [p] = await tx
      .select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::float8` })
      .from(payments)
      .where(eq(payments.invoiceId, inv.id))
    if (t.n > 0 && t.n - p.n > 0) debts.push({ id: inv.id, owed: t.n - p.n })
  }
  const debt = debts.reduce((n, d) => n + d.owed, 0)
  const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, term.id))
  const unpaid = lines.find((l) => ((l.meta ?? {}) as Record<string, unknown>).unpaid === true)
  if (unpaid && debt === 0) await tx.delete(invoiceLines).where(eq(invoiceLines.id, unpaid.id))
  else if (unpaid) {
    if (unpaid.amount !== debt)
      await tx
        .update(invoiceLines)
        .set({ quantity: 1, unitPrice: debt, amount: debt })
        .where(eq(invoiceLines.id, unpaid.id))
  } else if (debt > 0)
    await tx.insert(invoiceLines).values({
      invoiceId: term.id,
      type: 'adjustment',
      description: 'Nợ cũ chưa thanh toán',
      quantity: 1,
      unitPrice: debt,
      amount: debt,
      meta: { unpaid: true },
    })
  for (const d of debts)
    await tx.insert(payments).values({
      invoiceId: d.id,
      paidOn: paidOn ?? term.periodEnd,
      amount: d.owed,
      method: 'carry',
      note: `Gộp vào thanh lý ${term.code}`,
      receivedBy: ctx.userId,
    })
}

/**
 * Duyệt hoá đơn thanh lý: đóng nợ cũ (`settleOldInvoices`), nếu hợp đồng này được chuyển phòng (có hợp đồng mới trỏ về nó)
 * thì tính lại dòng chuyển bằng −(tổng các dòng khác) vì hoá đơn nháp có thể đã được sửa; trừ ví khách thật bằng dòng ví
 * của hoá đơn (kiểm lại số dư dưới khoá khách), rồi cộng dồn T (dương là nợ, âm là số dư) sang hợp đồng mới thành điều chỉnh chờ.
 * Mọi bút toán có `sourceKey` hoặc kiểm trùng nên chạy lại không ghi trùng.
 */
async function settleWalletAndTransfer(
  tx: DB,
  ctx: AccessContext,
  invoice: { id: string; facilityId: string },
  lease: { id: string; code: string; tenantId: string },
  endDate: string,
): Promise<void> {
  await tx.execute(sql`select id from tenants where id = ${lease.tenantId} for update`)
  await settleOldInvoices(tx, ctx, invoice.id, endDate)
  const [next] = await tx.select({ id: leases.id }).from(leases).where(eq(leases.transferFromLeaseId, lease.id))
  let lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id))
  const meta = (l: (typeof lines)[number]) => (l.meta ?? {}) as Record<string, unknown>
  if (next && lines.some((l) => meta(l).transfer === true)) {
    const rebalanced = rebalanceTransferLine(lines)
    const out = lines.find((l) => meta(l).transfer === true)!
    const kept = rebalanced.find((l) => l.id === out.id)
    if (!kept) await tx.delete(invoiceLines).where(eq(invoiceLines.id, out.id))
    else if (kept.amount !== out.amount)
      await tx
        .update(invoiceLines)
        .set({ quantity: 1, unitPrice: kept.unitPrice, amount: kept.amount })
        .where(eq(invoiceLines.id, out.id))
    lines = rebalanced
  }
  const walletLine = lines.find((l) => typeof meta(l).wallet === 'number')
  if (walletLine && walletLine.amount < 0) {
    const sourceKey = `use_termination:${invoice.id}`
    const [posted] = await tx
      .select({ id: tenantWalletEntries.id })
      .from(tenantWalletEntries)
      .where(eq(tenantWalletEntries.sourceKey, sourceKey))
    if (!posted) {
      const balance = await walletBalance(tx, lease.tenantId)
      if (balance < -walletLine.amount)
        throw new ValidationError(
          `Số dư ví đã đổi sau khi lập hoá đơn thanh lý (còn ${balance.toLocaleString('vi-VN')}): sửa dòng ví của hoá đơn rồi duyệt lại`,
        )
      await addWalletEntry(tx, {
        tenantId: lease.tenantId,
        facilityId: invoice.facilityId,
        amount: walletLine.amount,
        kind: 'use_termination',
        leaseId: lease.id,
        invoiceId: invoice.id,
        date: endDate,
        note: 'Ví khách gạch vào hoá đơn thanh lý',
        sourceKey,
      })
    }
  }
  if (!next || !lines.some((l) => meta(l).transfer === true)) return
  const carried = lines.filter((l) => meta(l).transfer !== true).reduce((n, l) => n + l.amount, 0)
  if (carried === 0) return
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
 * Duyệt hoá đơn có khoản chuyển từ hợp đồng cũ (`transfer:*`) mà tổng âm: đưa hoá đơn về 0 bằng dòng "Số dư chuyển vào ví"
 * và ghi phần dư (`carry_surplus`) vào ví khách. Duyệt lại sau khi bỏ duyệt không ghi trùng.
 */
export async function settleTransferSurplus(
  tx: DB,
  invoice: { id: string; leaseId: string; facilityId: string },
  date: string,
): Promise<void> {
  const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id))
  const meta = (l: (typeof lines)[number]) => (l.meta ?? {}) as Record<string, unknown>
  const hasTransfer = lines.some(
    (l) => typeof meta(l).sourceKey === 'string' && String(meta(l).sourceKey).startsWith('transfer:'),
  )
  if (!hasTransfer || lines.some((l) => meta(l).surplus === true)) return
  const total = lines.reduce((n, l) => n + l.amount, 0)
  if (total >= 0) return
  const [lease] = await tx.select({ tenantId: leases.tenantId }).from(leases).where(eq(leases.id, invoice.leaseId))
  if (!lease) return
  await tx.insert(invoiceLines).values({
    invoiceId: invoice.id,
    type: 'adjustment',
    description: 'Số dư chuyển vào ví',
    quantity: 1,
    unitPrice: -total,
    amount: -total,
    meta: { surplus: true },
  })
  await addWalletEntry(tx, {
    tenantId: lease.tenantId,
    facilityId: invoice.facilityId,
    amount: -total,
    kind: 'carry_surplus',
    leaseId: invoice.leaseId,
    invoiceId: invoice.id,
    date,
    note: 'Số dư chuyển phòng vượt hoá đơn đầu',
    sourceKey: `carry_surplus:${invoice.id}`,
  })
}

/** Bỏ duyệt hoặc xoá hoá đơn đã đẩy dư vào ví: xoá dòng và biến động ví; từ chối nếu ví đã dùng tới phần đó. */
export async function undoTransferSurplus(tx: DB, invoiceId: string): Promise<void> {
  const [entry] = await tx
    .select()
    .from(tenantWalletEntries)
    .where(eq(tenantWalletEntries.sourceKey, `carry_surplus:${invoiceId}`))
  if (entry) {
    if ((await walletBalance(tx, entry.tenantId)) - entry.amount < 0)
      throw new ValidationError('Số dư chuyển vào ví đã được dùng: gỡ các khoản dùng ví trước')
    await tx.delete(tenantWalletEntries).where(eq(tenantWalletEntries.id, entry.id))
  }
  await tx
    .delete(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, invoiceId), sql`${invoiceLines.meta} ->> 'surplus' = 'true'`))
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
  // Lưới an toàn: hoá đơn thanh lý chuyển phòng không còn dòng "Nợ cũ", nên hợp đồng cũ không được phát sinh nợ sau khi lập nháp
  const [transferLine] = await tx
    .select({ id: invoiceLines.id })
    .from(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, invoice.id), sql`${invoiceLines.meta} ->> 'transfer' = 'true'`))
    .limit(1)
  if (transferLine) {
    const message = roomChangeBlockerMessage({ ...(await loadRoomChangeBlockers(tx, lease.id)), drafts: [] })
    if (message) throw new ValidationError(message)
  }
  await settleWalletAndTransfer(tx, ctx, invoice, lease, endDate)

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
