'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatVND } from '@/domain/money'
import { removeDiacritics } from '@/domain/text'
import { MoveDialog } from './move-dialog'
import { LocationTree, type Selected, type TreeFacility } from './location-tree'

export type AssetRow = { id: string; code: string; name: string; category: string; value: number; condition: string; status: string; locationKind: string; locationId: string; facilityId: string }

const STATUS: Record<string, string> = { in_use: 'Đang dùng', broken: 'Hỏng', disposed: 'Đã thanh lý' }

export function AssetTable({ assets, facilities }: { assets: AssetRow[]; facilities: TreeFacility[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Selected>({ kind: 'all' })
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [moving, setMoving] = useState(false)

  const roomCode = useMemo(() => new Map(facilities.flatMap((f) => f.rooms.map((r) => [r.id, `Phòng ${r.code}`] as const))), [facilities])
  const facName = useMemo(() => new Map(facilities.map((f) => [f.id, f.name])), [facilities])
  const where = (a: AssetRow) => (a.locationKind === 'room' ? roomCode.get(a.locationId) : `${a.locationKind === 'warehouse' ? 'Kho' : 'Khu chung'} ${facName.get(a.locationId) ?? ''}`)

  const shown = assets.filter((a) => {
    if (sel.kind === 'facility' && a.facilityId !== sel.id) return false
    if ((sel.kind === 'warehouse' || sel.kind === 'common' || sel.kind === 'room') && (a.locationKind !== sel.kind || a.locationId !== sel.id)) return false
    if (q.trim()) return removeDiacritics(`${a.code} ${a.name} ${a.category}`).toLowerCase().includes(removeDiacritics(q).toLowerCase().trim())
    return true
  })
  const chosen = assets.filter((a) => checked.includes(a.id))
  const oneFacility = new Set(chosen.map((a) => a.facilityId)).size === 1
  const toggle = (id: string) => setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id])

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <aside className="rounded-md border bg-card p-2 md:max-h-[70vh] md:overflow-auto"><LocationTree facilities={facilities} value={sel} onChange={setSel} /></aside>
      <div className="min-w-0 space-y-3">
        <input aria-label="Tìm tài sản" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, loại…" className="h-8 w-full max-w-sm rounded-lg border px-2 text-sm" />
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2 w-8" /><th className="p-2">Mã</th><th className="p-2">Tên</th><th className="p-2">Loại</th><th className="p-2">Vị trí</th>{facilities.length > 1 && <th className="p-2">Toà</th>}<th className="p-2">Tình trạng</th><th className="p-2">Giá trị</th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2"><input type="checkbox" aria-label={`Chọn ${a.code}`} checked={checked.includes(a.id)} onChange={() => toggle(a.id)} /></td>
                  <td className="p-2"><Link className="underline" href={`/assets/${a.id}`}>{a.code}</Link></td><td className="p-2">{a.name}</td><td className="p-2">{a.category}</td>
                  <td className="p-2">{where(a)}</td>{facilities.length > 1 && <td className="p-2">{facName.get(a.facilityId)}</td>}<td className="p-2">{a.status === 'in_use' ? a.condition : STATUS[a.status]}</td><td className="p-2">{formatVND(a.value)}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={facilities.length > 1 ? 8 : 7} className="p-4 text-center text-muted-foreground">Không có tài sản nào</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {checked.length > 0 && !moving && (
        <div className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-xl border bg-background p-3 shadow-lg md:left-auto md:right-6 md:w-96">
          <span className="text-sm">Đã chọn {checked.length}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setChecked([])}>Bỏ chọn</Button>
            <Button size="sm" disabled={!oneFacility} title={oneFacility ? '' : 'Chỉ chuyển được các món cùng cơ sở'} onClick={() => setMoving(true)}>Chuyển {checked.length} tài sản</Button></div>
        </div>
      )}
      {moving && oneFacility && (
        <MoveDialog facility={facilities.find((f) => f.id === chosen[0].facilityId)!} count={checked.length} assetIds={checked}
          onCancel={() => setMoving(false)} onDone={() => { setMoving(false); setChecked([]); router.refresh() }} />
      )}
    </div>
  )
}
