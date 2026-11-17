import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, FilePlus, FileText, Home, Plus, ShieldCheck, User } from 'lucide-react'
import { db } from '@/db/client'
import { ForbiddenError } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { orNotFound } from '@/lib/or-not-found'
import { listFacilities } from '@/server/facilities/service'
import { getTenant } from '@/server/tenants/service'
import { listLeases } from '@/server/contracts/service'
import { listFiles } from '@/server/files/service'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TenantDocuments } from '@/features/tenants/components/tenant-documents'
import { TenantForm } from '@/features/tenants/components/tenant-form'

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const tenant = await orNotFound(
    getTenant(db, ctx, id).catch((e) => {
      if (e instanceof ForbiddenError) notFound()
      throw e
    })
  )
  const facs = await listFacilities(db, ctx)
  const docs = await listFiles(db, ctx, 'tenant_document', id)
  const contracts = await listLeases(db, ctx, { tenantId: id })

  const displayName = tenant.fullName || tenant.companyName || 'Khách thuê'
  const isCompany = !!tenant.companyName

  return (
    <div className="max-w-5xl space-y-6">
      {/* Top navigation */}
      <div className="space-y-3">
        <Link
          href="/tenants"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          <span>Danh sách khách thuê</span>
        </Link>

        {/* Hero Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-base shadow-2xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">{displayName}</h1>
                <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {isCompany ? 'Doanh nghiệp' : 'Cá nhân'}
                </span>
                {tenant.nationality && (
                  <span className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {tenant.nationality}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {tenant.phone && <span>SĐT: <strong className="font-medium text-foreground">{tenant.phone}</strong></span>}
                {tenant.email && <span>Email: {tenant.email}</span>}
                {(tenant.idNumber || tenant.passportNumber) && <span>CCCD/Passport: {tenant.idNumber || tenant.passportNumber}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/contracts/new?kind=deposit&tenant=${id}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 rounded-xl')}
            >
              <FilePlus className="size-3.5 text-muted-foreground" />
              <span>Hợp đồng cọc</span>
            </Link>
            <Link
              href={`/contracts/new?tenant=${id}`}
              className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 rounded-xl shadow-2xs')}
            >
              <Plus className="size-3.5" />
              <span>Hợp đồng thuê mới</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Tenant Details Form */}
      <TenantForm facilities={facs.map((f) => ({ id: f.id, name: f.name }))} tenant={tenant as never} />

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
            <p className="mt-0.5 text-xs text-muted-foreground">Tạo hợp đồng cọc hoặc hợp đồng thuê đầu tiên cho khách hàng</p>
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
                        <Link
                          href={`/contracts/${c.id}`}
                          className="font-semibold text-sm text-foreground hover:text-primary transition-colors hover:underline underline-offset-2"
                        >
                          {c.code}
                        </Link>
                        <span className="rounded-full border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                          Phòng {c.roomCode}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
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
                          : 'border border-border/80 bg-muted/60 text-muted-foreground'
                      )}
                    >
                      {isActive ? 'Đang hiệu lực' : 'Đã kết thúc'}
                    </span>
                    <Link
                      href={`/contracts/${c.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <ArrowRight className="size-4" />
                    </Link>
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
