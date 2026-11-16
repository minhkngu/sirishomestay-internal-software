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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ghi chỉ số điện nước</h1>
      <form method="get" className="flex flex-wrap gap-2">
        <select name="facility" defaultValue={facilityId} aria-label="Cơ sở" className="h-9 rounded-lg border px-2 text-sm">{facs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <input type="month" name="period" defaultValue={period} aria-label="Kỳ" className="h-9 rounded-lg border px-2 text-sm" />
        <button className="h-9 rounded-lg border px-3 text-sm" type="submit">Xem</button>
      </form>
      {sheet ? <ReadingGrid key={`${facilityId}-${period}`} rows={sheet.rows} period={period} readOn={readOn} progress={sheet.progress} /> : <p className="text-muted-foreground">Chưa có cơ sở nào.</p>}
    </div>
  )
}
