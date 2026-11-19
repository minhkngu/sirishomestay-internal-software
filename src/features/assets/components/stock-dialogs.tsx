'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createStockAction, stockMoveAction } from '@/server/stock/actions'
import type { Location } from '@/server/assets/service'
import type { TreeFacility } from './location-types'
import type { StockRow } from './stock-table'

const toLocation = (value: string): Location => {
  const [kind, id] = value.split(':')
  return { kind: kind as Location['kind'], id }
}

export function AddStockItemDialog({
  facilities,
  open,
  onOpenChange,
}: {
  facilities: TreeFacility[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <AddStockItemBody facilities={facilities} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function AddStockItemBody({ facilities, onClose }: { facilities: TreeFacility[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [facilityId, setFacility] = useState(facilities[0]?.id ?? '')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => start(async () => {
    setError(null)
    const result = await createStockAction({ facilityId, name, unit, category })
    if (!result.ok) { setError(result.error); return }
    onClose()
    router.refresh()
  })

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Thêm vật tư</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="stock-facility">Cơ sở</Label>
          <select id="stock-facility" value={facilityId} onChange={(e) => setFacility(e.target.value)} className="h-9 w-full rounded-xl border border-border/80 bg-card px-2.5 text-sm outline-none focus:border-primary">
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="stock-name">Tên vật tư</Label>
          <Input id="stock-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bóng đèn LED" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="stock-unit">Đơn vị</Label>
            <Input id="stock-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cái" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="stock-category">Loại</Label>
            <Input id="stock-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Vật tư" />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Huỷ</Button>
        <Button disabled={pending || !facilityId || !name.trim() || !unit.trim()} onClick={submit}>Lưu vật tư</Button>
      </DialogFooter>
    </DialogContent>
  )
}

const MODES = [
  { value: 'receive', label: 'Nhập kho' },
  { value: 'move', label: 'Chuyển' },
  { value: 'consume', label: 'Xuất dùng' },
] as const

export function StockMoveDialog({
  rows,
  facilities,
  open,
  onOpenChange,
}: {
  rows: StockRow[]
  facilities: TreeFacility[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <StockMoveBody rows={rows} facilities={facilities} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function StockMoveBody({ rows, facilities, onClose }: { rows: StockRow[]; facilities: TreeFacility[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<'receive' | 'move' | 'consume'>('receive')
  const [itemId, setItemId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const items = Array.from(new Map(rows.map((r) => [r.itemId, r])).values())
  const selected = items.find((r) => r.itemId === itemId)
  const facility = facilities.find((f) => f.id === selected?.facilityId)
  const locations = facility
    ? [
        { value: `warehouse:${facility.id}`, label: 'Kho' },
        { value: `common:${facility.id}`, label: 'Khu chung' },
        ...facility.rooms.map((r) => ({ value: `room:${r.id}`, label: `Phòng ${r.code}` })),
      ]
    : []

  const validQuantity = Number.isSafeInteger(Number(quantity)) && Number(quantity) > 0
  const canSubmit = Boolean(itemId) && validQuantity && (mode === 'receive' || Boolean(from)) && (mode === 'consume' || Boolean(to))

  const submit = () => {
    if (!selected || !facility) return
    start(async () => {
      setError(null)
      const fallback = { kind: 'warehouse' as const, id: facility.id }
      const result = await stockMoveAction(mode, itemId, from ? toLocation(from) : fallback, to ? toLocation(to) : fallback, Number(quantity), reason)
      if (!result.ok) { setError(result.error); return }
      onClose()
      router.refresh()
    })
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Cập nhật kho</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Thao tác kho">
          {MODES.map((m) => (
            <button key={m.value} type="button" onClick={() => { setMode(m.value); setFrom(''); setTo('') }}
              className={cn('h-8 rounded-lg text-xs font-medium transition-colors', mode === m.value ? 'border border-border/80 bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="stock-item">Vật tư</Label>
          <select id="stock-item" value={itemId} onChange={(e) => { setItemId(e.target.value); setFrom(''); setTo('') }} className="h-9 w-full rounded-xl border border-border/80 bg-card px-2.5 text-sm outline-none focus:border-primary">
            <option value="">— chọn vật tư —</option>
            {items.map((r) => <option key={r.itemId} value={r.itemId}>{r.name} — {facilities.find((f) => f.id === r.facilityId)?.name}</option>)}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {mode !== 'receive' && (
            <div className="grid gap-1.5">
              <Label htmlFor="stock-from">Từ vị trí</Label>
              <select id="stock-from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full rounded-xl border border-border/80 bg-card px-2.5 text-sm outline-none focus:border-primary">
                <option value="">— chọn nguồn —</option>
                {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          )}
          {mode !== 'consume' && (
            <div className="grid gap-1.5">
              <Label htmlFor="stock-to">Đến vị trí</Label>
              <select id="stock-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full rounded-xl border border-border/80 bg-card px-2.5 text-sm outline-none focus:border-primary">
                <option value="">— chọn đích —</option>
                {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="stock-qty">Số lượng</Label>
            <Input id="stock-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="tabular-nums" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="stock-reason">Lý do</Label>
            <Input id="stock-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lắp cho khách mới…" />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Huỷ</Button>
        <Button disabled={pending || !canSubmit} onClick={submit}>Lưu thay đổi</Button>
      </DialogFooter>
    </DialogContent>
  )
}
