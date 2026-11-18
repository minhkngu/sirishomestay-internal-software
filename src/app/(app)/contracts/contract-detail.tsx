import { FileUpload } from '@/components/file-upload'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  User,
} from 'lucide-react'
import { can } from '@/domain/access'
import { listOneOffs } from '@/server/charges/service'
import { OneOffDialog } from '@/features/charges/components/one-off-dialog'
import { DepositLedger } from '@/features/deposits/components/deposit-ledger'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { NotFoundError } from '@/domain/errors'
import { depositBalance } from '@/domain/deposit'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { getAccessContext } from '@/server/session'
import { listFiles } from '@/server/files/service'
import { listTemplates } from '@/server/templates/service'
import { listHandovers } from '@/server/handovers/service'
import { StartHandoverButtons } from '@/features/handovers/components/start-handover-buttons'
import { getDepositContract, getLease } from '@/server/contracts/service'
import { ExportMenu } from '@/features/contracts/components/export-menu'
import { LeaseInvoiceTemplate } from '@/features/contracts/components/lease-invoice-template'
import { listInvoiceTemplates } from '@/server/invoice-templates/service'
import { listInvoices } from '@/server/invoices/service'
import { SignStatus } from '@/features/contracts/components/sign-status'
import { AddendaList } from '@/features/contracts/components/addenda-list'
import { OccupantDialog } from '@/features/contracts/components/occupant-dialog'
import { TransferWizard } from '@/features/contracts/components/transfer-wizard'
import { addendumFormData, listAddenda } from '@/server/addenda/service'
import { cn } from '@/lib/utils'

const ENTRY: Record<string, string> = {
  collect: 'Thu cọc',
  topup: 'Thu cọc bổ sung',
  deduct: 'Khấu trừ',
  refund: 'Hoàn cọc',
  forfeit: 'Mất cọc',
}

type Entry = { id: string; date: string; type: string; amount: number; status: string }

function runningBalances(entries: Entry[]): number[] {
  const out: number[] = []
  let run = 0
  for (const e of entries) {
    if (e.status === 'done') run += e.type === 'collect' || e.type === 'topup' ? e.amount : -e.amount
    out.push(run)
  }
  return out
}

function Ledger({ entries }: { entries: Entry[] }) {
  const done = runningBalances(entries)
  const currentBalance = depositBalance(
    entries.map((e) => ({
      id: e.id,
      date: e.date,
      type: e.type as 'collect',
      amount: e.amount,
      status: e.status as 'done',
    }))
  )

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Ngày</th>
              <th className="px-4 py-3">Nghiệp vụ</th>
              <th className="px-4 py-3 text-right">Số tiền</th>
              <th className="px-4 py-3 text-center">Trạng thái</th>
              <th className="px-4 py-3 text-right">Số dư luỹ kế</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {entries.map((e, i) => (
              <tr key={e.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground">{formatDateVN(e.date)}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-foreground">{ENTRY[e.type] || e.type}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                  {formatVND(e.amount)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      e.status === 'done'
                        ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700'
                        : 'border border-amber-200/80 bg-amber-50 text-amber-700'
                    )}
                  >
                    {e.status === 'done' ? 'Đã xong' : 'Chờ'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                  {formatVND(done[i])}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                  Chưa có dòng ghi sổ cọc nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-xs">
        <span className="text-muted-foreground">Số dư cọc hiện tại:</span>
        <strong className="text-sm font-bold text-foreground tabular-nums">{formatVND(currentBalance)}</strong>
      </div>
    </div>
  )
}

export default async function ContractDetail({ id }: { id: string }) {
  const ctx = await getAccessContext()
  let lease: Awaited<ReturnType<typeof getLease>> | null = null
  try {
    lease = await getLease(db, ctx, id)
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e
  }

  if (!lease) {
    let deposit
    try {
      deposit = await getDepositContract(db, ctx, id)
    } catch (e) {
      if (e instanceof NotFoundError) notFound()
      throw e
    }
    const templates = (await listTemplates(db, ctx, 'deposit_contract')).filter((t) => t.fileId)
    const statusLabels: Record<string, string> = {
      pending: 'Đang chờ',
      converted: 'Đã chuyển thành hợp đồng thuê',
      cancelled: 'Đã huỷ',
    }

    return (
      <div className="max-w-4xl space-y-6">
        <div className="space-y-3">
          <Link
            href="/contracts"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Danh sách hợp đồng</span>
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Hợp đồng cọc — phòng {deposit.roomCode}
                </h1>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium border',
                    deposit.status === 'pending'
                      ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                      : deposit.status === 'converted'
                      ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                      : 'border-border/80 bg-muted/60 text-muted-foreground'
                  )}
                >
                  {statusLabels[deposit.status] || deposit.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Khách thuê: <strong className="font-medium text-foreground">{deposit.tenantName}</strong>
              </p>
            </div>

            {deposit.status === 'pending' && (
              <Link
                href={`/contracts/new?deposit=${deposit.id}`}
                className={cn(buttonVariants({ size: 'sm' }), 'rounded-xl shadow-2xs')}
              >
                Chuyển thành hợp đồng thuê
              </Link>
            )}
          </div>
        </div>

        {/* Deposit Summary Details */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
            <div className="text-[11px] font-medium text-muted-foreground">Bên thuê</div>
            <div className="mt-1 text-sm font-semibold text-foreground truncate">{deposit.tenantName}</div>
          </div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
            <div className="text-[11px] font-medium text-muted-foreground">Tiền cọc giữ chỗ</div>
            <div className="mt-1 text-sm font-bold tabular-nums text-primary">
              {formatVND(deposit.depositAmount)}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
            <div className="text-[11px] font-medium text-muted-foreground">Giá thuê thoả thuận</div>
            <div className="mt-1 text-sm font-bold tabular-nums text-foreground">
              {formatVND(deposit.agreedRent)}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
            <div className="text-[11px] font-medium text-muted-foreground">Vào ở dự kiến</div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {formatDateVN(deposit.expectedMoveIn)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
          <SignStatus
            kind="deposit"
            id={deposit.id}
            status={deposit.signStatus as 'draft'}
            signedFileId={deposit.signedFileId}
          />
          <ExportMenu
            kind="deposit"
            id={deposit.id}
            templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
          />
        </div>

        <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Sổ cọc</h2>
          <Ledger entries={deposit.entries} />
        </section>
      </div>
    )
  }

  const billing = can(ctx, 'billing', lease.facilityId)
  const contractInvoices = billing ? (await listInvoices(db, ctx, { facilityId: lease.facilityId })).filter(invoice => invoice.leaseId === lease.id) : []
  const charges = billing ? await listOneOffs(db, ctx, lease.id) : []
  const handoverList = await listHandovers(db, ctx, lease.id)
  const addendaList = await listAddenda(db, ctx, lease.id)
  const form = lease.status === 'active' ? await addendumFormData(db, ctx, lease.id) : null
  const [templates, exports, photos, invoiceTemplates] = await Promise.all([
    listTemplates(db, ctx, 'lease').then((t) => t.filter((x) => x.fileId)),
    listFiles(db, ctx, 'export', lease.id),
    listFiles(db, ctx, 'lease_photo', lease.id),
    listInvoiceTemplates(db, ctx),
  ])

  const isActive = lease.status === 'active'

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/contracts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          <span>Danh sách hợp đồng</span>
        </Link>

        {/* Hero Contract Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{lease.code}</h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  isActive
                    ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700'
                    : 'border border-border/80 bg-muted/60 text-muted-foreground'
                )}
              >
                {isActive ? 'Đang hiệu lực' : 'Đã kết thúc'}
              </span>
              <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Phòng {lease.roomCode}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <User className="size-3.5 text-primary" />
                <span>{lease.tenantName}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5 text-muted-foreground" />
                <span>
                  {formatDateVN(lease.startDate)} – {formatDateVN(lease.terms.endDate)}
                </span>
              </span>
              {lease.legacyCode && (
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span>Mã cũ: {lease.legacyCode}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Tổng quan</h2>
          <LeaseInvoiceTemplate leaseId={lease.id} selectedTemplateId={lease.invoiceTemplateId} templates={invoiceTemplates.map(t => ({ id: t.id, name: t.name, isDefault: t.isDefault }))} />
          {lease.note && <p className="rounded-xl border p-4 text-sm whitespace-pre-wrap">{lease.note}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="text-[11px] font-medium text-muted-foreground">Giá thuê hàng tháng</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-foreground">
                {formatVND(lease.terms.monthlyRent)} <span className="text-xs font-normal text-muted-foreground">/tháng</span>
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="text-[11px] font-medium text-muted-foreground">Tiền cọc giữ</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-foreground">
                {formatVND(lease.terms.depositAmount)}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="text-[11px] font-medium text-muted-foreground">Thời hạn hợp đồng</div>
              <div className="mt-1 text-xs font-semibold text-foreground">
                {formatDateVN(lease.startDate)} – {formatDateVN(lease.terms.endDate)}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="text-[11px] font-medium text-muted-foreground">Số người ở</div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {lease.terms.occupantIds.length} <span className="text-xs font-normal text-muted-foreground">người</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phí dịch vụ & Cố định</h3>
            <div className="text-xs text-foreground">
              {lease.terms.fees.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {lease.terms.fees.map((f, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs"
                    >
                      <span className="font-medium">{f.name}:</span>
                      <strong className="font-bold text-foreground tabular-nums">{formatVND(f.unitPrice)}</strong>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">Không có phụ phí dịch vụ riêng.</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {billing && <OneOffDialog leaseId={lease.id} charges={charges} />}
            {form && (
              <OccupantDialog
                leaseId={lease.id}
                people={form.people}
                currentIds={lease.terms.occupantIds}
                today={form.today}
              />
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-base font-semibold">Phụ lục</h2>
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
            <AddendaList
              items={addendaList.map((a) => ({
                id: a.id,
                type: a.type,
                effectiveDate: a.effectiveDate,
                signStatus: a.signStatus,
                signedFileId: a.signedFileId,
              }))}
            />
            {form && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                <TransferWizard
                  leaseId={lease.id}
                  currentRoomId={form.currentRoomId}
                  freeRooms={form.freeRooms}
                  meters={form.meters}
                  today={form.today}
                />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Biên bản bàn giao</h3>
                <p className="text-xs text-muted-foreground">Biên bản check-in nhận phòng và check-out trả phòng</p>
              </div>
              <StartHandoverButtons leaseId={lease.id} />
            </div>

            {handoverList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                Chưa có biên bản bàn giao nào.
              </div>
            ) : (
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                {handoverList.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-foreground">
                        {h.kind === 'check_in' ? 'Check-in' : 'Check-out'}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{formatDateVN(h.date)}</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                          h.status === 'done'
                            ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700'
                            : 'border border-border/80 bg-muted/60 text-muted-foreground'
                        )}
                      >
                        {h.status === 'done' ? 'Đã hoàn tất' : 'Nháp'}
                      </span>
                      <Link
                        href={`/handovers/${h.id}`}
                        className="font-medium text-primary hover:underline underline-offset-2"
                      >
                        Xem biên bản →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">Hóa đơn</h2>
          {!billing ? <p className="text-sm text-muted-foreground">Bạn không có quyền xem hóa đơn.</p> : contractInvoices.length ? <ul className="divide-y rounded-xl border">{contractInvoices.map(invoice => <li key={invoice.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><Link href={`/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">{invoice.code}</Link><span>{formatDateVN(invoice.periodStart)} – {formatDateVN(invoice.periodEnd)}</span><span>{formatVND(invoice.total)} · Đã thu {formatVND(invoice.paid)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Chưa có hóa đơn.</p>}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">Sổ cọc</h2>
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
            <DepositLedger entries={lease.depositEntries} canEdit={billing} leaseId={lease.id} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-base font-semibold">Giấy tờ</h2>
          <section className="space-y-3 rounded-2xl border p-5"><h3 className="font-semibold">Ảnh hợp đồng</h3>
            <div className="flex flex-wrap gap-3">{photos.map((f) => <a key={f.id} href={`/api/files/${f.id}`}><img src={`/api/files/${f.id}?thumb=1`} alt={f.name || 'Ảnh hợp đồng'} className="h-24 w-24 rounded object-cover" /></a>)}</div>
            <FileUpload ownerType="lease_photo" ownerId={lease.id} multiple label="Thêm ảnh hợp đồng" />
          </section>
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
            <SignStatus
              kind="lease"
              id={lease.id}
              status={lease.signStatus as 'draft'}
              signedFileId={lease.signedFileId}
            />
            <ExportMenu
              kind="lease"
              id={lease.id}
              selectedTemplateId={lease.contractTemplateId}
              templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
            />
            {exports.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-border/60">
                <h4 className="text-xs font-semibold text-foreground">Tệp đã xuất</h4>
                <div className="space-y-1">
                  {exports.map((f) => (
                    <div key={f.id} className="text-xs">
                      <a
                        className="font-medium text-primary hover:underline underline-offset-2"
                        href={`/api/files/${f.id}`}
                      >
                        {f.name}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
