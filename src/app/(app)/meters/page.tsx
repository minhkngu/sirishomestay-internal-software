import { PageHeader } from '@/components/list/page-header'
import { RequirePermission } from '@/components/require-permission'
import { db } from '@/db/client'
import { daysInMonth, todayVN } from '@/domain/dates'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { listReadingSheet } from '@/server/meters/service'
import { ReadingGrid } from '@/features/meters/components/reading-grid'

export default async function MetersPage({ searchParams }: { searchParams: Promise<{ facility?: string; period?: string }> }) {
  return <RequirePermission perm="meters"><Meters searchParams={searchParams} /></RequirePermission>
}

async function Meters({ searchParams }: { searchParams: Promise<{ facility?: string; period?: string }> }) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx)
  const today = todayVN()
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : today.slice(0, 7)
  const facilityId = facs.find((f) => f.id === sp.facility)?.id ?? facs[0]?.id
  const sheet = facilityId ? await listReadingSheet(db, ctx, facilityId, period) : null
  const end = `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
  const readOn = today.startsWith(period) ? today : end
  return (
    <div className="space-y-5">
      <PageHeader title="Ghi chỉ số đồng hồ" />
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
        <form method="get" className="flex flex-wrap items-center gap-3">
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
          <button
            className="h-9 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-[var(--primary-strong)] active:scale-95"
            type="submit"
          >
            Xem bảng ghi
          </button>
        </form>
      </div>
      {sheet ? (
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
