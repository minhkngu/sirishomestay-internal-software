import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, FileText } from 'lucide-react'
import { can } from '@/domain/access'
import { listOneOffs } from '@/server/charges/service'
import { OneOffDialog } from '@/features/charges/components/one-off-dialog'
import { DepositLedger } from '@/features/deposits/components/deposit-ledger'
import { buttonVariants } from '@/components/ui/button'
import { db } from '@/db/client'
import { NotFoundError } from '@/domain/errors'
import { depositBalance } from '@/domain/deposit'
import { formatDateVN, todayVN } from '@/domain/dates'
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
import { SignChip, Stat, StatusChip, TermBar, termProgress } from '@/components/contract-ui'

function Panel({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string
  count?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-border/80 bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h3 className="text-sm font-semibold text-foreground">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
          )}
        </h3>
        {action}
      </div>
      <div className="px-5 pb-4 pt-2">{children}</div>
    </section>
  )
}

function DocRow({ d }: { d: { id: string; label: string; name: string; date: string; previewHref?: string } }) {
  if (d.previewHref)
    return (
      <li className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">{d.label}</p>
        </div>
        <PdfViewButton
          href={d.previewHref}
          title={d.label}
          className="text-[13px] font-medium text-primary hover:underline hover:underline-offset-2"
        >
          Xem PDF
        </PdfViewButton>
      </li>
    )
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {d.label}
          {d.name && <span className="font-normal text-muted-foreground"> · {d.name}</span>}
        </p>
        {d.date && <p className="mt-0.5 text-xs text-muted-foreground">{d.date}</p>}
      </div>
      <span className="flex items-center gap-3 text-[13px]">
        {d.label.includes('PDF') ? (
          <PdfViewButton
            href={`/api/files/${d.id}?inline=1`}
            title={d.label}
            className="font-medium text-primary hover:underline hover:underline-offset-2"
          >
            Xem trước
          </PdfViewButton>
        ) : (
          <a
            className="font-medium text-primary hover:underline hover:underline-offset-2"
            href={`/api/files/${d.id}?inline=1`}
            target="_blank"
            rel="noreferrer"
          >
            Xem trước
          </a>
        )}
        <a className="font-medium text-primary hover:underline hover:underline-offset-2" href={`/api/files/${d.id}`}>
          Tải xuống
        </a>
      </span>
    </li>
  )
}

const INVOICE_STATE: Record<string, { label: string; tone: 'positive' | 'warning' | 'neutral' | 'negative' }> = {
  paid: { label: 'Đã thu đủ', tone: 'positive' },
  partial: { label: 'Thu một phần', tone: 'warning' },
  unpaid: { label: 'Chưa thu', tone: 'neutral' },
  overdue: { label: 'Quá hạn', tone: 'negative' },
  draft: { label: 'Nháp', tone: 'neutral' },
}

function InvoiceRows({
  invoices,
}: {
  invoices: {
    id: string
    code: string
    periodStart: string
    periodEnd: string
    total: number
    paid: number
    state: string
  }[]
}) {
  if (!invoices.length) return <p className="py-3 text-sm text-muted-foreground">Chưa có hoá đơn cho hợp đồng này.</p>
  return (
    <ul className="divide-y divide-border/60">
      {invoices.map((invoice) => {
        const state = INVOICE_STATE[invoice.state] ?? { label: invoice.state, tone: 'neutral' as const }
        const remaining = Math.max(0, invoice.total - invoice.paid)
        return (
          <li key={invoice.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <Link
                href={`/invoices/${invoice.id}`}
                className="text-[13px] font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
              >
                {invoice.code}
              </Link>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {formatDateVN(invoice.periodStart)} – {formatDateVN(invoice.periodEnd)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[13px] font-medium tabular-nums text-foreground">{formatVND(invoice.total)}</p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {remaining > 0 ? `Còn ${formatVND(remaining)}` : `Đã thu ${formatVND(invoice.paid)}`}
              </p>
            </div>
            <StatusChip tone={state.tone}>{state.label}</StatusChip>
          </li>
        )
      })}
    </ul>
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
      pending: 'Chờ chuyển hợp đồng',
      converted: 'Đã chuyển hợp đồng',
      cancelled: 'Đã huỷ',
    }
    const collected = depositBalance(
      deposit.entries.map((e) => ({
        id: e.id,
        date: e.date,
        type: e.type as 'collect',
        amount: e.amount,
        status: e.status as 'done',
      })),
    )

    return (
      <div className="space-y-5">
        <Link
          href="/contracts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          <span>Danh sách hợp đồng</span>
        </Link>

        <section className="overflow-hidden rounded-2xl border border-border/80 bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
                  Hợp đồng cọc · phòng {deposit.roomCode}
                </h1>
                <StatusChip
                  tone={
                    deposit.status === 'converted' ? 'positive' : deposit.status === 'cancelled' ? 'neutral' : 'warning'
                  }
                >
                  {statusLabels[deposit.status] || deposit.status}
                </StatusChip>
                <SignChip status={deposit.signStatus} />
              </div>
              <p className="mt-2 text-sm text-foreground">
                {deposit.tenantName}
                <span className="text-muted-foreground"> · Vào ở dự kiến {formatDateVN(deposit.expectedMoveIn)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ContractActions
                id={deposit.id}
                kind="deposit"
                active={false}
                canDelete={can(ctx, 'delete_contracts', deposit.facilityId)}
                redirectAfterDelete="/contracts"
                presentation="detail"
              />
              {/* Thẻ <a> (tải trang đầy đủ) có chủ ý: popup tạo mở đè lên trang cọc này không chuyển được sang hợp đồng thuê vừa tạo (invoices.spec). */}
              {deposit.status === 'pending' && (
                <a
                  href={`/contracts/new?deposit=${deposit.id}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'w-full sm:w-auto')}
                >
                  Chuyển thành hợp đồng thuê
                </a>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/50 lg:grid-cols-4">
            <div className="bg-card">
              <Stat label="Tiền cọc giữ chỗ" value={formatVND(deposit.depositAmount)} lead />
            </div>
            <div className="bg-card">
              <Stat label="Đã thu cọc" value={formatVND(collected)} />
            </div>
            <div className="bg-card">
              <Stat label="Giá thuê thoả thuận" value={formatVND(deposit.agreedRent)} unit="/ tháng" />
            </div>
            <div className="bg-card">
              <Stat label="Vào ở dự kiến" value={formatDateVN(deposit.expectedMoveIn)} />
            </div>
          </div>
        </section>

        <h2 className="text-base font-semibold text-foreground">Tổng quan</h2>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Panel title="Tài liệu & chữ ký">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Xuất từ mẫu hợp đồng cọc</p>
                  <ExportMenu
                    bare
                    kind="deposit"
                    id={deposit.id}
                    templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
                  />
                </div>
                <div className="border-t border-border/60 pt-4">
                  <SignStatus
                    kind="deposit"
                    id={deposit.id}
                    status={deposit.signStatus as 'draft'}
                    signedFileId={deposit.signedFileId}
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Sổ cọc" count={deposit.entries.length > 0 ? `${deposit.entries.length} dòng` : undefined}>
              <DepositLedger entries={deposit.entries} canEdit={false} leaseId={deposit.id} />
            </Panel>
          </div>

          <aside className="space-y-5">
            <Panel title="Thông tin">
              <dl className="space-y-2.5 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Bên thuê</dt>
                  <dd className="text-right font-medium text-foreground">{deposit.tenantName}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Phòng</dt>
                  <dd className="text-right font-medium text-foreground">{deposit.roomCode}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Vào ở dự kiến</dt>
                  <dd className="text-right tabular-nums text-foreground">{formatDateVN(deposit.expectedMoveIn)}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Trạng thái</dt>
                  <dd className="text-right">
                    <StatusChip
                      tone={
                        deposit.status === 'converted'
                          ? 'positive'
                          : deposit.status === 'cancelled'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {statusLabels[deposit.status] || deposit.status}
                    </StatusChip>
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Chữ ký</dt>
                  <dd className="text-right">
                    <SignChip status={deposit.signStatus} />
                  </dd>
                </div>
              </dl>
            </Panel>
          </aside>
        </div>
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
  const today = todayVN()
  const progress = termProgress(lease.startDate, lease.terms.endDate, today)
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
  const unpaid = contractInvoices.filter((invoice) => ['unpaid', 'partial', 'overdue'].includes(invoice.state))
  const unpaidAmount = unpaid.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), 0)
  const finding = unpaid.length > 0 ? `${unpaid.length} hoá đơn chưa thu đủ · còn ${formatVND(unpaidAmount)}` : null

  return (
    <div className="space-y-5">
      <Link
        href="/contracts"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        <span>Danh sách hợp đồng</span>
      </Link>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{lease.code}</h1>
              <StatusChip tone={!isActive ? 'neutral' : progress.left <= 30 ? 'warning' : 'positive'}>
                {!isActive ? 'Đã kết thúc' : progress.left <= 30 ? 'Sắp hết hạn' : 'Đang hiệu lực'}
              </StatusChip>
              <SignChip status={lease.signStatus} />
            </div>
            <p className="mt-2 text-sm text-foreground">
              {lease.tenantName}
              <span className="text-muted-foreground"> · Phòng {lease.roomCode}</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Calendar className="size-3.5" />
              <span className="tabular-nums">
                {formatDateVN(lease.startDate)} – {formatDateVN(lease.terms.endDate)}
              </span>
              {lease.legacyCode && (
                <>
                  <span>·</span>
                  <span>Mã cũ: {lease.legacyCode}</span>
                </>
              )}
            </p>
            {finding && <p className="mt-3 text-sm text-foreground">{finding}</p>}
          </div>
          <ContractActions
            id={lease.id}
            kind="lease"
            active={isActive}
            canDelete={can(ctx, 'delete_contracts', lease.facilityId)}
            redirectAfterDelete="/contracts"
            presentation="detail"
          />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/50 lg:grid-cols-4">
          <div className="bg-card">
            <Stat label="Giá thuê / tháng" value={formatVND(lease.terms.monthlyRent)} lead />
          </div>
          <div className="bg-card">
            <Stat label="Tiền cọc giữ" value={formatVND(lease.terms.depositAmount)} />
          </div>
          <div className="bg-card">
            <Stat label="Thời hạn hợp đồng">
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {formatDateVN(lease.startDate)} – {formatDateVN(lease.terms.endDate)}
              </p>
              <TermBar
                startDate={lease.startDate}
                endDate={lease.terms.endDate}
                today={today}
                ended={!isActive}
                withLabel
                className="mt-2"
              />
            </Stat>
          </div>
          <div className="bg-card">
            <Stat
              label="Số người ở"
              value={occupants.length}
              unit="người"
              note={lease.terms.fees.length ? `${lease.terms.fees.length} phí dịch vụ` : 'Không có phí riêng'}
            />
          </div>
        </div>
      </section>

      <h2 className="text-base font-semibold text-foreground">Tổng quan</h2>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="order-first space-y-5 xl:sticky xl:top-6 xl:order-none xl:col-start-2 xl:row-start-1 xl:self-start">
          <Panel title="Người ở" count={occupants.length}>
            {occupants.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Chưa có người ở.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {[...occupants]
                  .sort((a, b) => Number(b.id === lease.tenantId) - Number(a.id === lease.tenantId))
                  .map((o) => (
                    <li key={o.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                        {o.name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-foreground">
                          <span className="truncate">{o.name}</span>
                          {o.id === lease.tenantId && (
                            <StatusChip tone="positive" className="h-5 px-2 text-[10px]">
                              Đại diện
                            </StatusChip>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {o.idNumber ?? 'Chưa có giấy tờ'}
                          {o.phone ? ` · ${formatPhoneDisplay(o.phone)}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>

          <Panel title="Phí dịch vụ & cố định" count={lease.terms.fees.length || undefined}>
            {lease.terms.fees.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {lease.terms.fees.map((f, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-3 py-2.5 text-[13px] first:pt-0 last:pb-0"
                  >
                    <span className="text-foreground">{f.name}</span>
                    <span className="font-medium tabular-nums text-foreground">{formatVND(f.unitPrice)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">Không có phụ phí dịch vụ riêng.</p>
            )}
            {billing && charges.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <OneOffDialog leaseId={lease.id} charges={charges} readOnly />
              </div>
            )}
          </Panel>

          {lease.note && (
            <Panel title="Ghi chú">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{lease.note}</p>
            </Panel>
          )}

          <Panel title="Giấy tờ" count={photos.length || undefined}>
            <p className="text-xs text-muted-foreground">Ảnh chụp hợp đồng đính kèm</p>
            {photos.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2.5">
                {photos.map((f) => (
                  <a
                    key={f.id}
                    href={`/api/files/${f.id}`}
                    className="block overflow-hidden rounded-lg border border-border/60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- ảnh thu nhỏ từ route /api/files có kiểm quyền; next/image cần khai báo thêm cấu hình ảnh */}
                    <img
                      src={`/api/files/${f.id}?thumb=1`}
                      alt={f.name || 'Ảnh hợp đồng'}
                      className="size-20 object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Chưa có ảnh chụp nào.</p>
            )}
          </Panel>
        </aside>

        <div className="space-y-5 xl:col-start-1 xl:row-start-1">
          <Panel
            title="Tài liệu hợp đồng"
            action={
              <ExportMenu
                compact
                kind="lease"
                id={lease.id}
                selectedTemplateId={lease.contractTemplateId}
                templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
              />
            }
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Hợp đồng</p>
                <ul className="mt-1 divide-y divide-border/60">
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
              {savedDocs.some((d) => d.group === 'Phụ lục') && (
                <div>
                  <p className="text-xs text-muted-foreground">Tệp phụ lục</p>
                  <ul className="mt-1 divide-y divide-border/60">
                    {savedDocs
                      .filter((d) => d.group === 'Phụ lục')
                      .map((d) => (
                        <DocRow key={d.id} d={d} />
                      ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Biên bản bàn giao tài sản</p>
                  <StartHandoverButtons leaseId={lease.id} />
                </div>
                <ul className="mt-1 divide-y divide-border/60">
                  {handoverFiles.map(({ h, files }) => {
                    const savedPdf = files.find((f) => f.contentType === 'application/pdf')
                    const title = h.kind === 'check_in' ? 'Biên bản check-in' : 'Biên bản check-out'
                    const href = savedPdf
                      ? `/api/files/${savedPdf.id}?inline=1`
                      : `/api/documents/preview?docType=${h.kind === 'check_in' ? 'handover_check_in' : 'handover_check_out'}&id=${h.id}`
                    return (
                      <li key={h.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/handovers/${h.id}`}
                            className="text-[13px] font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
                          >
                            {title}
                          </Link>
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            {formatDateVN(h.date)} · {h.status === 'done' ? 'Đã hoàn tất' : 'Nháp'}
                          </p>
                        </div>
                        <PdfViewButton
                          href={href}
                          title={title}
                          className="text-[13px] font-medium text-primary hover:underline hover:underline-offset-2"
                        >
                          Xem PDF
                        </PdfViewButton>
                      </li>
                    )
                  })}
                  {handoverFiles.length === 0 && (
                    <li className="py-2 text-sm text-muted-foreground">
                      Chưa có biên bản nào. Bấm Check-in hoặc Check-out để tạo.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </Panel>

          <Panel title="Phụ lục" count={addendaList.length || undefined}>
            <AddendaList
              items={addendaList.map((a) => ({
                id: a.id,
                type: a.type,
                effectiveDate: a.effectiveDate,
                signStatus: a.signStatus,
                signedFileId: a.signedFileId,
              }))}
            />
          </Panel>

          <Panel title="Hoá đơn" count={contractInvoices.length || undefined}>
            {!billing ? (
              <p className="py-2 text-sm text-muted-foreground">Bạn không có quyền xem hoá đơn.</p>
            ) : (
              <InvoiceRows invoices={contractInvoices} />
            )}
          </Panel>

          <Panel title="Sổ cọc" count={lease.depositEntries.length ? `${lease.depositEntries.length} dòng` : undefined}>
            <DepositLedger entries={lease.depositEntries} canEdit={false} leaseId={lease.id} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
