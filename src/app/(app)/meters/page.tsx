import { PageHeader } from '@/components/list/page-header'
import { RequirePermission } from '@/components/require-permission'
import { db } from '@/db/client'
import { todayVN } from '@/domain/dates'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { listReadingHistory, listReadingSheet } from '@/server/meters/service'
import { listMeterTypes } from '@/server/meter-types/service'
import { ReadingHistory } from '@/features/meters/components/reading-history'
import { AddMeterButton } from '@/features/meters/components/add-meter-dialog'
import { CloseReadingsButton } from '@/features/meters/components/close-readings-button'
import { MeterFilters } from '@/features/meters/components/meter-filters'
import { readingMeterTypes, sortMeterTypes } from '@/features/meters/meter-types'

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
  return [...new Map(rows.map((row) => [row.roomId, { value: row.roomId, label: row.roomCode }])).values()].sort(
    (a, b) => a.label.localeCompare(b.label, 'vi', { numeric: true }),
  )
}

export default async function MetersPage({
  searchParams,
}: {
  searchParams: Promise<{
    facility?: string
    period?: string
    room?: string
    meter?: string
    year?: string
    month?: string
  }>
}) {
  return (
    <RequirePermission perm="meters">
      <Meters searchParams={searchParams} />
    </RequirePermission>
  )
}

async function Meters({
  searchParams,
}: {
  searchParams: Promise<{
    facility?: string
    period?: string
    room?: string
    meter?: string
    year?: string
    month?: string
  }>
}) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  const facs = await listFacilities(db, ctx)
  const today = todayVN()
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : today.slice(0, 7)
  const facilityId = facs.find((f) => f.id === sp.facility)?.id ?? facs[0]?.id
  // Một danh sách duy nhất: các đồng hồ đã chốt trong tháng được chọn; bảng điền số mở từ nút Chốt chỉ số
  const [sheet, historyRows, meterTypes] = await Promise.all([
    facilityId ? listReadingSheet(db, ctx, facilityId, period) : Promise.resolve(null),
    facilityId ? listReadingHistory(db, ctx, facilityId, '2000-01', '2100-12') : Promise.resolve(null),
    listMeterTypes(db),
  ])

  const readingRows = sheet?.rows ?? []
  const historyAll = historyRows ?? []
  const roomOptions = uniqueRooms(historyAll)
  const roomId = roomOptions.some((room) => room.value === sp.room) ? sp.room! : ''

  // Bộ lọc luôn liệt kê mọi loại đồng hồ trong Cài đặt, thêm các tên loại đang có ở dữ liệu nhưng chưa khai báo
  const typeNames = sortMeterTypes([
    ...meterTypes.map((t) => t.name),
    ...historyAll.map((row) => row.meterName),
    ...readingMeterTypes(readingRows),
  ])
  const meter = typeNames.includes(sp.meter ?? '') ? sp.meter! : ''
  const meterOptions = [
    { value: '', label: 'Tất cả loại đồng hồ' },
    ...typeNames.map((type) => ({ value: type, label: type })),
  ]
  const unitByType = Object.fromEntries(meterTypes.map((t) => [t.name, t.unit]))

  // Năm → Tháng: chưa chọn gì (mặc định) hiện 15 lần chốt mới nhất; 'all' hiện hết; chọn năm thì chọn thêm tháng. Có phân trang khi không phải mặc định
  const year = sp.year === 'all' || /^\d{4}$/.test(sp.year ?? '') ? sp.year! : ''
  const month = /^\d{4}$/.test(year) && /^(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? sp.month! : ''
  const years = [...new Set(historyAll.map((row) => row.period.slice(0, 4)))].sort().reverse()
  const yearOptions = [{ value: 'all', label: 'Tất cả' }, ...years.map((y) => ({ value: y, label: `Năm ${y}` }))]
  const filtered = historyAll.filter(
    (row) =>
      (!roomId || row.roomId === roomId) &&
      (!meter || row.meterName === meter) &&
      (!/^\d{4}$/.test(year) || row.period.startsWith(year)) &&
      (!month || row.period.slice(5) === month),
  )
  const shown = year === '' ? filtered.slice(0, 15) : filtered

  const periodOptions = periodChoices(today)
  if (!periodOptions.some((option) => option.value === period))
    periodOptions.unshift({ value: period, label: periodLabel(period) })

  const addMeterRooms = uniqueRooms(readingRows).map((room) => ({ id: room.value, code: room.label }))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chỉ số"
        action={
          facilityId ? (
            <div className="flex items-center gap-2">
              <AddMeterButton
                rooms={addMeterRooms}
                types={meterTypes.filter((t) => !t.isSystem).map((t) => ({ name: t.name, unit: t.unit }))}
              />
              <CloseReadingsButton
                facilities={facs.map((f) => ({ value: f.id, label: f.name }))}
                defaultFacilityId={facilityId}
                meterOptions={meterOptions}
                periodOptions={periodOptions}
                defaultPeriod={period}
                today={today}
                unitByType={unitByType}
              />
            </div>
          ) : undefined
        }
      />
      <p className="-mt-2 text-sm text-muted-foreground">
        Các lần chốt gần đây; lọc theo năm, tháng hoặc xem tất cả. Bấm Chốt chỉ số để điền số cho đồng hồ chưa chốt.
      </p>

      {facs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">
          Chưa có cơ sở nào.
        </div>
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
            showPeriod={false}
            yearOptions={yearOptions}
            year={year}
            month={month}
          />
          {historyRows ? (
            <ReadingHistory
              facilityName={facs.find((f) => f.id === facilityId)?.name ?? ''}
              rows={shown}
              paged={year !== ''}
              total={filtered.length}
            />
          ) : (
            <EmptyData />
          )}
        </>
      )}
    </div>
  )
}

function EmptyData() {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">
      Cơ sở này chưa có dữ liệu chỉ số.
    </div>
  )
}
