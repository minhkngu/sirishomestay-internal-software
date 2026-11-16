'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createAssetAction } from '@/server/assets/actions'
import type { TreeFacility } from './location-tree'

export function AssetForm({ facilities }: { facilities: TreeFacility[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [v, setV] = useState({ code: '', name: '', category: '', value: '', condition: 'Tốt', facilityId: facilities[0]?.id ?? '', where: `warehouse:${facilities[0]?.id ?? ''}` })
  const [error, setError] = useState<string | null>(null)
  const fac = facilities.find((f) => f.id === v.facilityId)

  if (!open) return <Button onClick={() => setOpen(true)}>Thêm tài sản</Button>
  return (
    <div className="grid max-w-xl gap-2 rounded-md border p-3 sm:grid-cols-2">
      <Input aria-label="Mã tài sản" placeholder="Mã tài sản" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
      <Input aria-label="Tên tài sản" placeholder="Tên tài sản" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Input aria-label="Loại" placeholder="Loại (điện lạnh, nội thất…)" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
      <Input aria-label="Giá trị" placeholder="Giá trị (VND)" inputMode="numeric" value={v.value} onChange={(e) => setV({ ...v, value: e.target.value })} />
      <select aria-label="Cơ sở" value={v.facilityId} onChange={(e) => setV({ ...v, facilityId: e.target.value, where: `warehouse:${e.target.value}` })} className="h-8 rounded-lg border px-2 text-sm">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <select aria-label="Vị trí" value={v.where} onChange={(e) => setV({ ...v, where: e.target.value })} className="h-8 rounded-lg border px-2 text-sm">
        <option value={`warehouse:${v.facilityId}`}>Kho</option><option value={`common:${v.facilityId}`}>Khu chung</option>
        {fac?.rooms.map((r) => <option key={r.id} value={`room:${r.id}`}>Phòng {r.code}</option>)}
      </select>
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button disabled={pending} onClick={() => start(async () => {
          setError(null)
          const [kind, id] = v.where.split(':')
          const r = await createAssetAction({ code: v.code, name: v.name, category: v.category, value: Number(v.value) || 0, condition: v.condition, facilityId: v.facilityId, location: { kind, id } })
          if (!r.ok) setError(r.fieldErrors?.code ?? r.error); else { setOpen(false); router.refresh() }
        })}>Lưu</Button>
        <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
      </div>
    </div>
  )
}
