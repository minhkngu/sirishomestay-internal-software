import Link from 'next/link'
import { PageHeader } from '@/components/list/page-header'
import { RequirePermission } from '@/components/require-permission'
import { db } from '@/db/client'
import { daysInMonth, todayVN } from '@/domain/dates'
import { cn } from '@/lib/utils'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { listMeterOverview, listMonthlyReadings, listReadingSheet } from '@/server/meters/service'
import { MeterList } from '@/features/meters/components/meter-list'
import { MonthlyTable } from '@/features/meters/components/monthly-table'
import { AddMeterButton } from '@/features/meters/components/add-meter-dialog'
import { ReadingGrid } from '@/features/meters/components/reading-grid'
import { MeterFilters } from '@/features/meters/components/meter-filters'
import { readingMeterTypes, sortMeterTypes } from '@/features/meters/meter-types'

type Tab = 'readings' | 'monthly' | 'meters'
const TABS: Array<[Tab, string]> = [
  ['readings', 'Ghi chỉ số'],
  ['monthly', 'Theo tháng'],
  ['meters', 'Đồng hồ'],
]

/** Kỳ ghi gần đây: 3 tháng tới và 24 tháng trước, mới nhất trước. */
function periodChoices(today: string): Array<{ value: string; label: string }> {
  const [year, month] = today.slice(0, 7).split('-').map(Number)
  return Array.from({ length: 28 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + 3 - index, 1))
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return { value, label: `Tháng ${date.getUTCMonth() + 1}/${date.getUTCFullYear()}` }
  })
}

const periodLabel = (period: string) => `Tháng ${Number(period.slice(5))}/${period.slice(0, 4)}`

function uniqueRooms(rows: Array<{ roomId: string; roomCode: string }>) {
  return [...new Map(rows.map((row) => [row.roomId, { value: row.roomId, label: row.roomCode }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'vi', { numeric: true }))
}

export default async function MetersPage({ searchParams }: { searchParams: Promise<{ facility?: string; period?: string; tab?: string; room?: string; meter?: string }> }) {
  return <RequirePermission perm="meters"><Meters searchParams={searchParams} /></RequirePermission>
}

async function Meters({ searchParams }: { searchParams: Promise<{ facility?: string; period?: string; tab?: string; room?: string; meter?: string }> }) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx)
  const today = todayVN()
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : today.slice(0, 7)
  const facilityId = facs.find((f) => f.id === sp.facility)?.id ?? facs[0]?.id
  const tab: Tab = sp.tab === 'meters' ? 'meters' : sp.tab === 'monthly' ? 'monthly' : 'readings'
  const sheet = tab === 'readings' && facilityId ? await listReadingSheet(db, ctx, facilityId, period) : null
  const monthly = tab === 'monthly' && facilityId ? await listMonthlyReadings(db, ctx, facilityId, period) : null
  const overview = tab === 'meters' && facilityId ? await listMeterOverview(db, ctx, facilityId) : []
  const end = `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
  const readOn = today.startsWith(period) ? today : end

  const readingRows = sheet?.rows ?? []
  const monthlyRows = monthly?.rows ?? []
  const roomOptions = tab === 'readings' ? uniqueRooms(readingRows) : tab === 'monthly' ? uniqueRooms(monthlyRows) : uniqueRooms(overview)
  const roomId = roomOptions.some((room) => room.value === sp.room) ? sp.room! : ''

  const scopedReadings = readingRows.filter((row) => !roomId || row.roomId === roomId)
  const scopedMonthly = monthlyRows.filter((row) => !roomId || row.roomId === roomId)
  const scopedOverview = overview.filter((row) => !roomId || row.roomId === roomId)

  const meterTypes = tab === 'readings' ? readingMeterTypes(scopedReadings)
    : tab === 'monthly' ? ['Điện', 'Nước']
    : sortMeterTypes(scopedOverview.map((row) => row.meterName))
  const meter = meterTypes.includes(sp.meter ?? '') ? sp.meter! : ''
  const meterOptions = [{ value: '', label: tab === 'monthly' ? 'Cả điện và nước' : 'Tất cả đồng hồ' }, ...meterTypes.map((type) => ({ value: type, label: type }))]

  const periodOptions = periodChoices(today)
  if (!periodOptions.some((option) => option.value === period)) periodOptions.unshift({ value: period, label: periodLabel(period) })

  const clearParams = new URLSearchParams({ tab })
  if (facilityId) clearParams.set('facility', facilityId)
  if (tab !== 'meters') clearParams.set('period', period)
  const clearFiltersHref = `/meters?${clearParams.toString()}`

  function tabHref(next: Tab) {
    const params = new URLSearchParams()
    if (facilityId) params.set('facility', facilityId)
    if (next !== 'meters') params.set('period', period)
    if (roomId) params.set('room', roomId)
    if (meter) params.set('meter', meter)
    return `/meters?tab=${next}${params.size ? `&${params.toString()}` : ''}`
  }

  const addMeterRooms = uniqueRooms(overview).map((room) => ({ id: room.value, code: room.label }))

  return (
    <div className="space-y-5">
      <PageHeader title="Chỉ số" action={tab === 'meters' && facilityId ? <AddMeterButton rooms={addMeterRooms} /> : undefined} />
      <p className="-mt-2 text-sm text-muted-foreground">Ghi chỉ số điện, nước và đồng hồ phụ; xem lại theo tháng và quản lý đồng hồ.</p>

      <nav aria-label="Mục chỉ số" className="flex items-center gap-0.5 overflow-x-auto border-b border-border/70">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-2 pb-2.5 pt-1.5 text-xs font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full sm:px-3 sm:text-[13px] sm:after:inset-x-3',
              tab === key ? 'text-foreground after:bg-primary' : 'text-muted-foreground after:bg-transparent hover:text-foreground',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {facs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">Chưa có cơ sở nào.</div>
      ) : (
        <>
          <MeterFilters
            facilities={facs.map((facility) => ({ value: facility.id, label: facility.name }))}
            facilityId={facilityId ?? ''}
            rooms={roomOptions}
            roomId={roomId}
            meters={meterOptions}
            meter={meter}
            periodOptions={periodOptions}
            period={period}
            showPeriod={tab !== 'meters'}
          />

          {tab === 'readings' ? (
            sheet ? <ReadingGrid key={`${facilityId}-${period}`} rows={scopedReadings} period={period} readOn={readOn} meterFilter={meter} roomFiltered={Boolean(roomId)} clearFiltersHref={roomId || meter ? clearFiltersHref : undefined} /> : <EmptyData />
          ) : tab === 'monthly' ? (
            monthly ? <MonthlyTable periods={monthly.periods} rows={scopedMonthly} utility={meter} /> : <EmptyData />
          ) : (
            <MeterList rows={meter ? scopedOverview.filter((row) => row.meterName === meter) : scopedOverview} />
          )}
        </>
      )}
    </div>
  )
}

function EmptyData() {
  return <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">Cơ sở này chưa có dữ liệu chỉ số.</div>
}
