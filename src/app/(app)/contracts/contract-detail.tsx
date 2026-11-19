import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, User } from 'lucide-react'
import { can } from '@/domain/access'
import { listOneOffs } from '@/server/charges/service'
import { OneOffDialog } from '@/features/charges/components/one-off-dialog'
import { DepositLedger } from '@/features/deposits/components/deposit-ledger'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { NotFoundError } from '@/domain/errors'
import { DEPOSIT_ENTRY_LABELS, depositBalance, runningDepositBalances } from '@/domain/deposit'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { getAccessContext } from '@/modules/platform'
import { listFiles } from '@/modules/platform'
import { isUsableTemplate, listTemplates } from '@/server/templates/service'
import { listHandovers } from '@/server/handovers/service'
import { getDepositContract, getLease, listLeaseOccupants } from '@/server/contracts/service'
import { formatPhoneDisplay } from '@/domain/phone'
import { PdfViewButton } from '@/components/pdf-view-button'
import { ExportMenu } from '@/features/contracts/components/export-menu'
import { listInvoices } from '@/server/invoices/service'
import { SignStatus } from '@/features/contracts/components/sign-status'
import { AddendaList } from '@/features/contracts/components/addenda-list'
import { ContractActions } from './contract-actions'
import { StartHandoverButtons } from '@/features/handovers/components/start-handover-buttons'
import { listAddenda } from '@/server/addenda/service'
import { cn } from '@/lib/utils'
import { signStatusLabel } from '@/domain/sign-status'
import type { DepositEntryStatus, DepositEntryType } from '@/domain/statuses'

type Entry = { id: string; date: string; type: DepositEntryType; amount: number; status: DepositEntryStatus }

function Ledger({ entries }: { entries: Entry[] }) {
  const typed = entries
  const done = runningDepositBalances(typed)
  const currentBalance = depositBalance(typed)

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
                  <span className="font-medium text-foreground">{DEPOSIT_ENTRY_LABELS[e.type] ?? e.type}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{formatVND(e.amount)}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      e.status === 'done'
                        ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700'
                        : 'border border-amber-200/80 bg-amber-50 text-amber-700',
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

function DocRow({ d }: { d: { id: string; label: string; name: string; date: string; previewHref?: string } }) {
  if (d.previewHref)
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
        <span>
          <span className="font-medium text-foreground">{d.label}</span>{' '}
          {d.name && <span className="text-muted-foreground">· {d.name}</span>}
        </span>
        <PdfViewButton href={d.previewHref} title={d.label}>
          Xem PDF
        </PdfViewButton>
      </li>
    )
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
      <span>
        <span className="font-medium text-foreground">{d.label}</span>{' '}
        <span className="text-muted-foreground">
          · {d.name}
          {d.date ? ` · ${d.date}` : ''}
        </span>
      </span>
      <span className="flex gap-3">
        {d.label.includes('PDF') ? (
          <PdfViewButton href={`/api/files/${d.id}?inline=1`} title={d.label}>
            Xem trước
          </PdfViewButton>
        ) : (
          <a
            className="font-medium text-primary hover:underline"
            href={`/api/files/${d.id}?inline=1`}
            target="_blank"
            rel="noreferrer"
          >
            Xem trước
          </a>
        )}
        <a className="font-medium text-primary hover:underline" href={`/api/files/${d.id}`}>
          Tải xuống
        </a>
      </span>
    </li>
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
    const templates = (await listTemplates(db, ctx, 'deposit_contract')).filter(isUsableTemplate)
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
                        : 'border-border/80 bg-muted/60 text-muted-foreground',
                  )}
                >
                  {statusLabels[deposit.status] || deposit.status}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    deposit.signStatus === 'signed'
                      ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                      : 'border-border/80 bg-muted/60 text-muted-foreground',
                  )}
                >
                  {signStatusLabel(deposit.signStatus)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Khách thuê: <strong className="font-medium text-foreground">{deposit.tenantName}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ContractActions
                id={deposit.id}
                kind="deposit"
                active={false}
                canDelete={can(ctx, 'delete_contracts', deposit.facilityId)}
                redirectAfterDelete="/contracts"
              />
              {/* Thẻ <a> (tải trang đầy đủ) có chủ ý: popup tạo mở đè lên trang cọc này không chuyển được sang hợp đồng thuê vừa tạo (invoices.spec). */}
              {deposit.status === 'pending' && (
                <a
                  href={`/contracts/new?deposit=${deposit.id}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'rounded-xl shadow-2xs')}
                >
                  Chuyển thành hợp đồng thuê
                </a>
              )}
            </div>
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
            <div className="mt-1 text-sm font-bold tabular-nums text-primary">{formatVND(deposit.depositAmount)}</div>
          </div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
            <div className="text-[11px] font-medium text-muted-foreground">Giá thuê thoả thuận</div>
            <div className="mt-1 text-sm font-bold tabular-nums text-foreground">{formatVND(deposit.agreedRent)}</div>
          </div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
            <div className="text-[11px] font-medium text-muted-foreground">Vào ở dự kiến</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatDateVN(deposit.expectedMoveIn)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
          <ExportMenu
            kind="deposit"
            id={deposit.id}
            templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
          />
          <SignStatus
            kind="deposit"
            id={deposit.id}
            status={deposit.signStatus as 'draft'}
            signedFileId={deposit.signedFileId}
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
  const contractInvoices = billing
    ? (await listInvoices(db, ctx, { facilityId: lease.facilityId })).filter((invoice) => invoice.leaseId === lease.id)
    : []
  const charges = billing ? await listOneOffs(db, ctx, lease.id) : []
  const handoverList = await listHandovers(db, ctx, lease.id)
  const addendaList = await listAddenda(db, ctx, lease.id)
  const [templates, exports, photos] = await Promise.all([
    listTemplates(db, ctx, 'lease').then((t) => t.filter(isUsableTemplate)),
    listFiles(db, ctx, 'export', lease.id),
    listFiles(db, ctx, 'lease_photo', lease.id),
  ])

  const isActive = lease.status === 'active'
  const safeFiles = async (ownerId: string) => {
    try {
      return await listFiles(db, ctx, 'export', ownerId)
    } catch {
      return []
    }
  }
  const addendumTypeLabel: Record<string, string> = {
    extension: 'Gia hạn',
    transfer: 'Chuyển phòng',
    assignment: 'Chuyển nhượng',
    termination: 'Thanh lý',
    occupants: 'Đổi người ở',
  }
  const [addendaFiles, handoverFiles] = await Promise.all([
    Promise.all(addendaList.map(async (a) => ({ a, files: await safeFiles(a.id) }))),
    Promise.all(handoverList.map(async (h) => ({ h, files: await safeFiles(h.id) }))),
  ])
  const fileDate = (f: { createdAt: Date }) => formatDateVN(f.createdAt.toISOString().slice(0, 10))
  const savedDocs: { id: string; group: 'Hợp đồng' | 'Phụ lục'; label: string; name: string; date: string }[] = [
    ...(lease.signedFileId
      ? [
          {
            id: lease.signedFileId,
            group: 'Hợp đồng' as const,
            label: 'Bản hợp đồng đã ký',
            name: 'bản scan',
            date: '',
          },
        ]
      : []),
    ...exports.map((f) => ({
      id: f.id,
      group: 'Hợp đồng' as const,
      label: f.contentType === 'application/pdf' ? 'Hợp đồng · bản PDF' : 'Hợp đồng · bản Word',
      name: f.name,
      date: fileDate(f),
    })),
    ...addendaFiles.flatMap(({ a, files }) => [
      ...files.map((f) => ({
        id: f.id,
        group: 'Phụ lục' as const,
        label: `Phụ lục ${addendumTypeLabel[a.type] ?? a.type}`,
        name: f.name,
        date: fileDate(f),
      })),
      ...(a.signedFileId
        ? [
            {
              id: a.signedFileId,
              group: 'Phụ lục' as const,
              label: `Phụ lục ${addendumTypeLabel[a.type] ?? a.type} đã ký`,
              name: 'bản scan',
              date: '',
            },
          ]
        : []),
    ]),
  ]
  // Mọi thao tác thay đổi nằm trong popup "Sửa hợp đồng"; trang chi tiết chỉ để xem
  const occupants = await listLeaseOccupants(db, ctx, lease.facilityId, [
    ...new Set([lease.tenantId, ...lease.terms.occupantIds]),
  ])

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
                    : 'border border-border/80 bg-muted/60 text-muted-foreground',
                )}
              >
                {isActive ? 'Đang hiệu lực' : 'Đã kết thúc'}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  lease.signStatus === 'signed'
                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                    : 'border-border/80 bg-muted/60 text-muted-foreground',
                )}
              >
                {signStatusLabel(lease.signStatus)}
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
          <ContractActions
            id={lease.id}
            kind="lease"
            active={isActive}
            canDelete={can(ctx, 'delete_contracts', lease.facilityId)}
            redirectAfterDelete="/contracts"
          />
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Hợp đồng</div>
                <ExportMenu
                  compact
                  kind="lease"
                  id={lease.id}
                  selectedTemplateId={lease.contractTemplateId}
                  templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
                />
              </div>
              <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
                {savedDocs
                  .filter((d) => d.group === 'Hợp đồng')
                  .map((d) => (
                    <DocRow key={d.id} d={d} />
                  ))}
                {!savedDocs.some((d) => d.group === 'Hợp đồng' && d.label.includes('PDF')) && (
                  <DocRow
                    d={{
                      id: 'lease-preview',
                      label: 'Hợp đồng thuê',
                      name: '',
                      date: '',
                      previewHref: `/api/documents/preview?docType=lease&id=${lease.id}${lease.contractTemplateId ? `&templateId=${lease.contractTemplateId}` : ''}`,
                    }}
                  />
                )}
              </ul>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Phụ lục</div>
              <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
                {savedDocs
                  .filter((d) => d.group === 'Phụ lục')
                  .map((d) => (
                    <DocRow key={d.id} d={d} />
                  ))}
                {!savedDocs.some((d) => d.group === 'Phụ lục') && (
                  <li className="px-3 py-1.5 text-xs text-muted-foreground">Chưa có phụ lục nào được xuất hoặc ký.</li>
                )}
              </ul>
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Biên bản bàn giao tài sản
                </div>
                <StartHandoverButtons leaseId={lease.id} />
              </div>
              <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
                {handoverFiles.map(({ h, files }) => {
                  const savedPdf = files.find((f) => f.contentType === 'application/pdf')
                  const title = h.kind === 'check_in' ? 'Biên bản check-in' : 'Biên bản check-out'
                  const href = savedPdf
                    ? `/api/files/${savedPdf.id}?inline=1`
                    : `/api/documents/preview?docType=${h.kind === 'check_in' ? 'handover_check_in' : 'handover_check_out'}&id=${h.id}`
                  return (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
                      <span>
                        <Link href={`/handovers/${h.id}`} className="font-medium text-foreground hover:underline">
                          {title}
                        </Link>{' '}
                        <span className="text-muted-foreground">
                          · {formatDateVN(h.date)} · {h.status === 'done' ? 'Đã hoàn tất' : 'Nháp'}
                        </span>
                      </span>
                      <PdfViewButton href={href} title={title}>
                        Xem PDF
                      </PdfViewButton>
                    </li>
                  )
                })}
                {handoverFiles.length === 0 && (
                  <li className="px-3 py-1.5 text-xs text-muted-foreground">
                    Chưa có biên bản bàn giao nào. Bấm Check-in hoặc Check-out để tạo.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Tổng quan</h2>
          {lease.note && <p className="rounded-xl border p-4 text-sm whitespace-pre-wrap">{lease.note}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="text-[11px] font-medium text-muted-foreground">Giá thuê hàng tháng</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-foreground">
                {formatVND(lease.terms.monthlyRent)}{' '}
                <span className="text-xs font-normal text-muted-foreground">/tháng</span>
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
                {lease.terms.occupantIds.length}{' '}
                <span className="text-xs font-normal text-muted-foreground">người</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Người ở</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-4 font-medium">Họ và tên</th>
                    <th className="py-1.5 pr-4 font-medium">Căn cước / Passport</th>
                    <th className="py-1.5 font-medium">Số điện thoại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {[...occupants]
                    .sort((a, b) => Number(b.id === lease.tenantId) - Number(a.id === lease.tenantId))
                    .map((o) => (
                      <tr key={o.id}>
                        <td className="py-1.5 pr-4 font-medium text-foreground">
                          {o.name}
                          {o.id === lease.tenantId && (
                            <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              Đại diện
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-foreground">{o.idNumber ?? '—'}</td>
                        <td className="py-1.5 text-foreground">{o.phone ? formatPhoneDisplay(o.phone) : '—'}</td>
                      </tr>
                    ))}
                  {occupants.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-muted-foreground">
                        Chưa có người ở.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Phí dịch vụ & Cố định
            </h3>
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
            {billing && charges.length > 0 && <OneOffDialog leaseId={lease.id} charges={charges} readOnly />}
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
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">Hóa đơn</h2>
          {!billing ? (
            <p className="text-sm text-muted-foreground">Bạn không có quyền xem hóa đơn.</p>
          ) : contractInvoices.length ? (
            <ul className="divide-y rounded-xl border">
              {contractInvoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                  <Link href={`/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">
                    {invoice.code}
                  </Link>
                  <span>
                    {formatDateVN(invoice.periodStart)} – {formatDateVN(invoice.periodEnd)}
                  </span>
                  <span>
                    {formatVND(invoice.total)} · Đã thu {formatVND(invoice.paid)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có hóa đơn.</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">Sổ cọc</h2>
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
            <DepositLedger entries={lease.depositEntries} canEdit={false} leaseId={lease.id} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-base font-semibold">Giấy tờ</h2>
          <section className="space-y-3 rounded-2xl border p-5">
            <h3 className="font-semibold">Ảnh chụp hợp đồng (đính kèm)</h3>
            <div className="flex flex-wrap gap-3">
              {photos.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- ảnh thu nhỏ từ route /api/files có kiểm quyền; next/image cần khai báo thêm cấu hình ảnh */}
                  <img
                    src={`/api/files/${f.id}?thumb=1`}
                    alt={f.name || 'Ảnh hợp đồng'}
                    className="h-24 w-24 rounded object-cover"
                  />
                </a>
              ))}
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}
