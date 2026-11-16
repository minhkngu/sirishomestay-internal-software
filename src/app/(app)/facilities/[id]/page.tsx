import Link from 'next/link'
import { db } from '@/db/client'
import { orNotFound } from '@/lib/or-not-found'
import { formatVND } from '@/domain/money'
import { getAccessContext } from '@/server/session'
import { getFacility } from '@/server/facilities/service'
import { listRooms } from '@/server/rooms/service'
import { RoomPanels } from '@/features/rooms/components/room-panels'

export default async function FacilityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; floor?: string }> }) {
  const { id } = await params
  const { q, floor } = await searchParams
  const ctx = await getAccessContext()
  const facility = await orNotFound(getFacility(db, ctx, id))
  const rooms = await listRooms(db, ctx, { facilityId: id, q, floor })
  const allFloors = [...new Set((await listRooms(db, ctx, { facilityId: id })).map((r) => r.floor).filter(Boolean))] as string[]
  return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{facility.name} <span className="text-sm text-muted-foreground">({facility.code})</span></h1>
        <p className="text-sm text-muted-foreground">{facility.address}</p>
        {ctx.isAdmin && <RoomPanels facilityId={id} />}
        <form className="flex flex-wrap gap-2" method="get">
          <input name="q" defaultValue={q} placeholder="Tìm mã phòng" className="h-8 rounded-lg border px-2 text-sm" />
          <select name="floor" defaultValue={floor ?? ''} className="h-8 rounded-lg border px-2 text-sm">
            <option value="">Tất cả tầng</option>
            {allFloors.sort().map((f) => <option key={f} value={f}>Tầng {f}</option>)}
          </select>
          <button className="h-8 rounded-lg border px-3 text-sm" type="submit">Lọc</button>
        </form>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Phòng</th><th className="p-2">Tầng</th><th className="p-2">Loại</th><th className="p-2">Giá niêm yết</th><th className="p-2">Trạng thái</th></tr></thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2"><Link className="underline" href={`/rooms/${r.id}`}>{r.code}</Link></td>
                  <td className="p-2">{r.floor ?? ''}</td>
                  <td className="p-2">{r.roomType ?? ''}</td>
                  <td className="p-2">{r.listPrice != null ? formatVND(r.listPrice) : ''}</td>
                  <td className="p-2">Trống</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  )
}
