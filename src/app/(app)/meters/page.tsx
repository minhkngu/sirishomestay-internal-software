import Form from 'next/form'
import Link from 'next/link'
import { PageHeader } from '@/components/list/page-header'
import { RefreshButton } from '@/components/list/refresh-button'
import { RequirePermission } from '@/components/require-permission'
import { db } from '@/db/client'
import { daysInMonth, todayVN } from '@/domain/dates'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { listMeterOverview, listReadingSheet } from '@/server/meters/service'
import { MeterList } from '@/features/meters/components/meter-list'
import { ReadingGrid } from '@/features/meters/components/reading-grid'

export default async function MetersPage({ searchParams }: { searchParams: Promise<{ facility?: string; period?: string; tab?: string }> }) {
  return <RequirePermission perm="meters"><Meters searchParams={searchParams} /></RequirePermission>
}

async function Meters({ searchParams }: { searchParams: Promise<{ facility?: string; period?: string; tab?: string }> }) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx)
  const today = todayVN()
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : today.slice(0, 7)
  const facilityId = facs.find((f) => f.id === sp.facility)?.id ?? facs[0]?.id
  const tab = sp.tab === 'meters' ? 'meters' : 'readings'
  const sheet = tab === 'readings' && facilityId ? await listReadingSheet(db, ctx, facilityId, period) : null
  const overview = tab === 'meters' && facilityId ? await listMeterOverview(db, ctx, facilityId) : []
  const end = `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
  const readOn = today.startsWith(period) ? today : end
  return (
    <div className="space-y-5">
      <PageHeader title="Chỉ số" action={<RefreshButton />} />
      <nav aria-label="Mục chỉ số" className="flex gap-2 text-sm">
        {([['readings', 'Ghi chỉ số'], ['meters', 'Đồng hồ']] as const).map(([key, label]) => (
          <Link key={key} href={`/meters?tab=${key}${facilityId ? `&facility=${facilityId}` : ''}${key === 'readings' ? `&period=${period}` : ''}`} aria-current={tab === key ? 'page' : undefined}
            className={`rounded-xl border px-3 py-1.5 ${tab === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80 bg-card text-foreground'}`}>{label}</Link>
        ))}
      </nav>
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
        <Form action="/meters" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="tab" value={tab} />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Chọn cơ sở:</span>
            <select
              name="facility"
              defaultValue={facilityId}
              aria-label="Cơ sở"
              className="h-9 rounded-xl border border-border/80 bg-card px-3 text-xs text-foreground shadow-2xs outline-none focus:border-ring"
            >
              {facs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          {tab === 'readings' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Kỳ ghi:</span>
            <input
              type="month"
              name="period"
              defaultValue={period}
              aria-label="Kỳ"
              className="h-9 rounded-xl border border-border/80 bg-card px-3 text-xs text-foreground shadow-2xs outline-none focus:border-ring"
            />
          </div>
          )}
          <button
            className="h-9 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-[var(--primary-strong)] active:scale-95"
            type="submit"
          >
            {tab === 'readings' ? 'Xem bảng ghi' : 'Xem đồng hồ'}
          </button>
        </Form>
      </div>
      {tab === 'meters' ? (
        facilityId ? <MeterList rows={overview} /> : <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">Chưa có cơ sở nào.</div>
      ) : sheet ? (
        <ReadingGrid
          key={`${facilityId}-${period}`}
          rows={sheet.rows}
          period={period}
          readOn={readOn}
          progress={sheet.progress}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">
          Chưa có cơ sở nào.
        </div>
      )}
    </div>
  )
}
