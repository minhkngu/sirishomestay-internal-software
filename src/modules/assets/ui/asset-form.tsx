'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ASSET_CONDITION, ASSET_CONDITIONS } from '@/domain/asset-labels'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { createAssetAction } from '../server/assets/actions'
import type { TreeFacility } from './location-types'

export function AssetForm({ facilities }: { facilities: TreeFacility[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" className="h-9 shrink-0" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Thêm tài sản
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <AssetDialogForm facilities={facilities} onClose={() => setOpen(false)} />}
      </Dialog>
    </>
  )
}

function AssetDialogForm({ facilities, onClose }: { facilities: TreeFacility[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [v, setV] = useState({
    code: '',
    name: '',
    category: '',
    value: '',
    condition: ASSET_CONDITION.good as string,
    facilityId: facilities[0]?.id ?? '',
    where: `warehouse:${facilities[0]?.id ?? ''}`,
  })
  const [error, setError] = useState<string | null>(null)
  const fac = facilities.find((f) => f.id === v.facilityId)

  function submit() {
    setError(null)
    start(async () => {
      const [kind, id] = v.where.split(':')
      const r = await createAssetAction({
        code: v.code,
        name: v.name,
        category: v.category,
        value: Number(v.value) || 0,
        condition: v.condition,
        facilityId: v.facilityId,
        location: { kind, id },
      })
      if (!r.ok) {
        setError(r.fieldErrors?.code ?? r.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Thêm tài sản</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="asset-code">Mã tài sản</Label>
          <Input
            id="asset-code"
            aria-label="Mã tài sản"
            value={v.code}
            onChange={(e) => setV({ ...v, code: e.target.value })}
            placeholder="BT-GI-105"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="asset-name">Tên tài sản</Label>
          <Input
            id="asset-name"
            aria-label="Tên tài sản"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder="Giường"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="asset-category">Loại</Label>
          <Input
            id="asset-category"
            aria-label="Loại"
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value })}
            placeholder="Nội thất"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="asset-value">Giá trị</Label>
          <MoneyInput
            id="asset-value"
            aria-label="Giá trị"
            placeholder="4.500.000"
            value={v.value}
            onValueChange={(value) => setV({ ...v, value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="asset-condition">Tình trạng</Label>
          <select
            id="asset-condition"
            value={v.condition}
            onChange={(e) => setV({ ...v, condition: e.target.value })}
            className="h-9 w-full rounded-xl border border-border/80 bg-card px-2.5 text-sm outline-none focus:border-primary"
          >
            {ASSET_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="asset-facility">Cơ sở</Label>
          <select
            id="asset-facility"
            aria-label="Cơ sở"
            value={v.facilityId}
            onChange={(e) => setV({ ...v, facilityId: e.target.value, where: `warehouse:${e.target.value}` })}
            className="h-9 w-full rounded-xl border border-border/80 bg-card px-2.5 text-sm outline-none focus:border-primary"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="asset-location">Vị trí</Label>
          <select
            id="asset-location"
            aria-label="Vị trí"
            value={v.where}
            onChange={(e) => setV({ ...v, where: e.target.value })}
            className="h-9 w-full rounded-xl border border-border/80 bg-card px-2.5 text-sm outline-none focus:border-primary"
          >
            <option value={`warehouse:${v.facilityId}`}>Kho</option>
            <option value={`common:${v.facilityId}`}>Khu chung</option>
            {fac?.rooms.map((r) => (
              <option key={r.id} value={`room:${r.id}`}>
                Phòng {r.code}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button disabled={pending || !v.code.trim() || !v.name.trim()} onClick={submit}>
          Lưu
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
