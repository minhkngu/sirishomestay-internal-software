import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, FileText, Home } from 'lucide-react'
import { PopupLink } from '@/components/popup-link'
import { db } from '@/db/client'
import { ForbiddenError } from '@/domain/access'
import { formatDateVN } from '@/domain/dates'
import { formatPhoneDisplay } from '@/domain/phone'
import { TENANT_KIND_LABELS } from '@/domain/tenant-kind'
import { orNotFound } from '@/lib/or-not-found'
import { cn } from '@/lib/utils'
import { listLeases } from '@/modules/leasing'
import { getAccessContext, listFiles } from '@/modules/platform'
import { getTenant } from '@/modules/tenants'
import { TenantDeleteButton, TenantDocuments, TenantEditButton } from '@/modules/tenants/ui'

function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-xs font-medium text-foreground">{value || '—'}</dd>
    </div>
  )
}

export default async function TenantDetail({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const ctx = await getAccessContext()
  const tenant = await orNotFound(
    getTenant(db, ctx, id).catch((e) => {
      if (e instanceof ForbiddenError) notFound()
      throw e
    }),
  )
  const [docs, contracts] = await Promise.all([
    listFiles(db, ctx, 'tenant_document', id),
    listLeases(db, ctx, { tenantId: id }),
  ])

  const displayName = tenant.fullName || tenant.companyName || 'Khách thuê'

  return (
    <div className={cn('space-y-5', !embedded && 'max-w-5xl')}>
      <div className="space-y-3">
        {!embedded && (
          <Link
            href="/tenants"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Danh sách khách thuê</span>
          </Link>
        )}

        {/* Hero Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-base font-bold text-primary shadow-2xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">{displayName}</h1>
                <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {TENANT_KIND_LABELS[tenant.kind]}
                </span>
                {tenant.nationality && (
                  <span className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {tenant.nationality}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {tenant.phone && (
                  <span>
                    SĐT: <strong className="font-medium text-foreground">{formatPhoneDisplay(tenant.phone)}</strong>
                  </span>
                )}
                {tenant.email && <span>Email: {tenant.email}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TenantEditButton tenant={tenant as never} />
            <TenantDeleteButton id={id} name={displayName} />
          </div>
        </div>
      </div>

      {/* Read-only Info Card */}
      <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Thông tin chi tiết</h2>
        {tenant.kind === 'foreign' && (
          <dl className="grid gap-4 sm:grid-cols-3">
            <InfoItem label="Họ tên" value={tenant.fullName} />
            <InfoItem label="Quốc tịch" value={tenant.nationality} />
            <InfoItem label="Ngày sinh" value={tenant.dateOfBirth ? formatDateVN(tenant.dateOfBirth) : null} />
            <InfoItem label="Số passport" value={tenant.passportNumber} />
            <InfoItem
              label="Hết hạn passport"
              value={tenant.passportExpiry ? formatDateVN(tenant.passportExpiry) : null}
            />
            <InfoItem label="Loại visa" value={tenant.visaType} />
            <InfoItem label="Hết hạn visa" value={tenant.visaExpiry ? formatDateVN(tenant.visaExpiry) : null} />
            <InfoItem label="Số điện thoại" value={formatPhoneDisplay(tenant.phone)} />
            <InfoItem label="Email" value={tenant.email} />
          </dl>
        )}
        {tenant.kind === 'vietnamese' && (
          <dl className="grid gap-4 sm:grid-cols-3">
            <InfoItem label="Họ tên" value={tenant.fullName} />
            <InfoItem label="Số CCCD" value={tenant.idNumber} />
            <InfoItem label="Ngày cấp" value={tenant.idIssueDate ? formatDateVN(tenant.idIssueDate) : null} />
            <InfoItem label="Nơi cấp" value={tenant.idIssuePlace} />
            <InfoItem label="Ngày sinh" value={tenant.dateOfBirth ? formatDateVN(tenant.dateOfBirth) : null} />
            <InfoItem label="Số điện thoại" value={formatPhoneDisplay(tenant.phone)} />
            <InfoItem label="Email" value={tenant.email} />
            <div className="sm:col-span-2">
              <InfoItem label="Địa chỉ thường trú" value={tenant.permanentAddress} />
            </div>
          </dl>
        )}
        {tenant.kind === 'company' && (
          <dl className="grid gap-4 sm:grid-cols-3">
            <InfoItem label="Tên công ty" value={tenant.companyName} />
            <InfoItem label="Mã số thuế" value={tenant.taxCode} />
            <InfoItem label="Người đại diện" value={tenant.representative} />
            <InfoItem label="Người liên hệ" value={tenant.contactPerson} />
            <InfoItem label="Số điện thoại" value={formatPhoneDisplay(tenant.phone)} />
            <InfoItem label="Email" value={tenant.email} />
            <div className="sm:col-span-3">
              <InfoItem label="Địa chỉ" value={tenant.companyAddress} />
            </div>
          </dl>
        )}
        {tenant.note && (
          <div className="border-t border-border/60 pt-3">
            <InfoItem label="Ghi chú" value={tenant.note} />
          </div>
        )}
      </section>

      {/* Contracts Section */}
      <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Hợp đồng thuê</h2>
            <p className="text-xs text-muted-foreground">Các hợp đồng cọc và hợp đồng thuê phòng của khách hàng này</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/contracts/new?kind=deposit&tenant=${id}`}
              className="text-xs font-medium text-primary hover:underline underline-offset-2"
            >
              + Tạo hợp đồng cọc
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link
              href={`/contracts/new?tenant=${id}`}
              className="text-xs font-medium text-primary hover:underline underline-offset-2"
            >
              + Tạo hợp đồng thuê
            </Link>
          </div>
        </div>

        {contracts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 p-8 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium text-foreground">Chưa có hợp đồng nào</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tạo hợp đồng cọc hoặc hợp đồng thuê đầu tiên cho khách hàng
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {contracts.map((c) => {
              const isActive = c.status === 'active'
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Home className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <PopupLink
                          href={`/contracts/${c.id}`}
                          className="text-sm font-semibold text-foreground transition-colors hover:text-primary hover:underline underline-offset-2"
                        >
                          {c.code}
                        </PopupLink>
                        <span className="rounded-full border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                          Phòng {c.roomCode}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Mã hợp đồng: <span className="font-mono text-[11px]">{c.id.slice(0, 8)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                        isActive
                          ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700'
                          : 'border border-border/80 bg-muted/60 text-muted-foreground',
                      )}
                    >
                      {isActive ? 'Đang hiệu lực' : 'Đã kết thúc'}
                    </span>
                    <PopupLink
                      href={`/contracts/${c.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ArrowRight className="size-4" />
                    </PopupLink>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Documents */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
        <TenantDocuments tenantId={id} docs={docs.map((d) => ({ id: d.id, name: d.name }))} />
      </div>
    </div>
  )
}
