import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { ForbiddenError } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { orNotFound } from '@/lib/or-not-found'
import { listFacilities } from '@/server/facilities/service'
import { getTenant } from '@/server/tenants/service'
import { listLeases } from '@/server/contracts/service'
import Link from 'next/link'
import { listFiles } from '@/server/files/service'
import { TenantDocuments } from '@/features/tenants/components/tenant-documents'
import { TenantForm } from '@/features/tenants/components/tenant-form'

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const tenant = await orNotFound(getTenant(db, ctx, id).catch((e) => { if (e instanceof ForbiddenError) notFound(); throw e }))
  const facs = await listFacilities(db, ctx)
  const docs = await listFiles(db, ctx, 'tenant_document', id)
  const contracts = await listLeases(db, ctx, { tenantId: id })
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{tenant.fullName ?? tenant.companyName}</h1>
      <TenantForm facilities={facs.map((f) => ({ id: f.id, name: f.name }))} tenant={tenant as never} />
      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="text-lg font-medium">Hợp đồng</h2>
          <div className="flex gap-3 text-sm"><Link className="underline" href={`/contracts/new?kind=deposit&tenant=${id}`}>Tạo hợp đồng cọc</Link><Link className="underline" href={`/contracts/new?tenant=${id}`}>Tạo hợp đồng thuê</Link></div></div>
        {contracts.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có hợp đồng.</p> : (
          <ul className="space-y-1 text-sm">{contracts.map((c) => <li key={c.id}><Link className="underline" href={`/contracts/${c.id}`}>{c.code}</Link> · phòng {c.roomCode} · {c.status === 'active' ? 'đang hiệu lực' : 'đã kết thúc'}</li>)}</ul>
        )}
      </section>
      <TenantDocuments tenantId={id} docs={docs.map((d) => ({ id: d.id, name: d.name }))} />
    </div>
  )
}
