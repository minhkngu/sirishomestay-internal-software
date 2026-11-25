'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/domain/room-status'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'
import { hasTenant } from '../domain/room-occupancy'
import {
  deleteRoomsBulkAction,
  setRoomsActiveBulkAction,
  updateRoomsBulkAction,
} from '../server/rooms/actions'
import type { CellRoom } from './room-cell'
import { RoomQuickActions } from './room-quick-actions'

export type ManageTableRoom = CellRoom & {
  facilityId?: string
  floor: string | null
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))

const BULK_FIELDS = [
  ['floor', 'Tầng'],
  ['roomType', 'Loại phòng'],
  ['areaM2', 'Diện tích (m²)'],
  ['beds', 'Số giường'],
  ['listPrice', 'Giá niêm yết (VND)'],
  ['capacity', 'Sức chứa'],
] as const

const emptyBulkForm = {
  floor: '',
  roomType: '',
  areaM2: '',
  beds: '',
  listPrice: '',
  capacity: '',
}

function statusChipClass(status: RoomStatus, isActive: boolean) {
  if (!isActive) return 'border-dashed border-border bg-muted/40 text-muted-foreground'
  if (status === 'deposited') return 'border-sky-200 bg-sky-50 text-sky-800'
  if (status === 'ending_soon') return 'border-amber-300 bg-amber-50 text-amber-800'
  if (hasTenant(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return 'border-border bg-muted/60 text-muted-foreground'
}

export function RoomManageTable({
  rooms,
  facilityNames,
}: {
  rooms: ManageTableRoom[]
  facilityNames?: Record<string, string>
}) {
  const router = useRouter()
  const [checked, setChecked] = useState<string[]>([])
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkAsk, setBulkAsk] = useState<'stop' | 'delete' | null>(null)
  const [bulkForm, setBulkForm] = useState(emptyBulkForm)
  const [bulkErr, setBulkErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const showFacility = Boolean(facilityNames)
  const manageableIds = useMemo(() => rooms.filter((r) => Boolean(r.manage)).map((r) => r.id), [rooms])
  const hasActions = manageableIds.length > 0

  const selectedIds = useMemo(() => {
    const idSet = new Set(manageableIds)
    return checked.filter((id) => idSet.has(id))
  }, [checked, manageableIds])

  const allSelected = manageableIds.length > 0 && manageableIds.every((id) => selectedIds.includes(id))
  const someSelected = selectedIds.length > 0 && !allSelected

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected
  }, [someSelected])

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const toggleAll = () =>
    setChecked(allSelected ? [] : manageableIds)

  const runBulk = (
    fn: () => Promise<{ ok: boolean; error?: string; data?: { count: number } }>,
    successMsg: (count: number) => string,
  ) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error ?? 'Không thực hiện được')
        return
      }
      toast.success(successMsg(r.data?.count ?? selectedIds.length))
      setChecked([])
      router.refresh()
    })

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border/70 bg-muted/40 text-muted-foreground">
            <tr>
              {hasActions && (
                <th className="w-10 p-3">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Chọn tất cả phòng"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="size-4 accent-primary"
                  />
                </th>
              )}
              <th className="p-3 font-medium whitespace-nowrap">{showFacility ? 'Phòng / Toà' : 'Phòng'}</th>
              <th className="p-3 font-medium whitespace-nowrap">Tầng</th>
              <th className="p-3 font-medium whitespace-nowrap">Loại phòng</th>
              <th className="p-3 font-medium whitespace-nowrap">Thông số</th>
              <th className="p-3 text-right font-medium whitespace-nowrap">Giá niêm yết</th>
              <th className="p-3 font-medium whitespace-nowrap">Trạng thái</th>
              {hasActions && <th className="p-3 text-right font-medium whitespace-nowrap">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rooms.map((r) => {
              const isActive = r.isActive ?? true
              const isChecked = selectedIds.includes(r.id)
              const specs = [
                r.manage?.areaM2 ? `${r.manage.areaM2} m²` : null,
                r.manage?.beds != null ? `${r.manage.beds} giường` : null,
                r.manage?.capacity != null ? `${r.manage.capacity} người` : null,
              ].filter(Boolean)
              return (
                <tr
                  key={r.id}
                  className={cn(
                    'transition-colors hover:bg-muted/30',
                    isChecked && 'bg-primary/5',
                    !isActive && 'opacity-70',
                  )}
                >
                  {hasActions && (
                    <td className="p-3">
                      {r.manage && (
                        <input
                          type="checkbox"
                          aria-label={`Chọn phòng ${r.code}`}
                          checked={isChecked}
                          onChange={() => toggle(r.id)}
                          className="size-4 accent-primary"
                        />
                      )}
                    </td>
                  )}
                  <td className="p-3 whitespace-nowrap">
                    <Link
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                      href={`/rooms/${r.id}`}
                    >
                      {r.code}
                    </Link>
                    {showFacility && r.facilityId && facilityNames?.[r.facilityId] && (
                      <span className="ml-1.5 text-muted-foreground">· {facilityNames[r.facilityId]}</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{r.floor ? `Tầng ${r.floor}` : '—'}</td>
                  <td className="p-3 text-foreground whitespace-nowrap">{r.manage?.roomType || '—'}</td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {specs.length ? specs.join(' · ') : '—'}
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums text-foreground whitespace-nowrap">
                    {r.manage?.listPrice != null ? formatVND(r.manage.listPrice) : '—'}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap',
                          statusChipClass(r.status, isActive),
                        )}
                      >
                        {!isActive ? 'Ngừng sử dụng' : ROOM_STATUS_LABELS[r.status]}
                      </span>
                      {r.tenantName && <span className="max-w-44 truncate text-foreground">{r.tenantName}</span>}
                    </div>
                  </td>
                  {hasActions && (
                    <td className="p-3 whitespace-nowrap">
                      {r.manage && (
                        <RoomQuickActions
                          id={r.id}
                          code={r.code}
                          isActive={isActive}
                          manage={r.manage}
                          presentation="row"
                        />
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={hasActions ? 8 : 6} className="p-8 text-center text-xs text-muted-foreground">
                  Không có phòng nào phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasActions && selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs shadow-lg">
          <span className="font-medium text-foreground whitespace-nowrap">Đã chọn {selectedIds.length} phòng</span>
          <Button variant="ghost" size="xs" disabled={pending} onClick={() => setChecked([])}>
            Bỏ chọn
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() => {
              setBulkForm(emptyBulkForm)
              setBulkErr(null)
              setBulkEditOpen(true)
            }}
          >
            Sửa hàng loạt
          </Button>
          <Button variant="outline" size="xs" disabled={pending} onClick={() => setBulkAsk('stop')}>
            Ngừng dùng
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() =>
              runBulk(
                () => setRoomsActiveBulkAction(selectedIds, true),
                (n) => `Đã kích hoạt lại ${n} phòng`,
              )
            }
          >
            Dùng lại
          </Button>
          <Button variant="destructive" size="xs" disabled={pending} onClick={() => setBulkAsk('delete')}>
            Xoá
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={bulkAsk === 'stop'}
        onOpenChange={(o) => !o && setBulkAsk(null)}
        title={`Ngừng sử dụng ${selectedIds.length} phòng đã chọn?`}
        description="Các phòng đang có hợp đồng thuê hiệu lực sẽ không thể ngừng sử dụng."
        confirmLabel="Ngừng sử dụng"
        onConfirm={() =>
          runBulk(
            () => setRoomsActiveBulkAction(selectedIds, false),
            (n) => `Đã ngừng sử dụng ${n} phòng`,
          )
        }
      />

      <ConfirmDialog
        open={bulkAsk === 'delete'}
        onOpenChange={(o) => !o && setBulkAsk(null)}
        title={`Xoá hẳn ${selectedIds.length} phòng đã chọn?`}
        destructive
        description="Xoá luôn toàn bộ hợp đồng, công tơ, hoá đơn... của các phòng này. Không thể hoàn tác."
        confirmLabel="Xoá các phòng"
        onConfirm={() =>
          runBulk(
            () => deleteRoomsBulkAction(selectedIds),
            (n) => `Đã xoá ${n} phòng`,
          )
        }
      />

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa hàng loạt ({selectedIds.length} phòng)</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Chỉ các ô có nhập giá trị mới được áp dụng cho các phòng đã chọn; ô để trống sẽ giữ nguyên.
          </p>
          <div className="space-y-3">
            {BULK_FIELDS.map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`rb-${k}`}>{label}</Label>
                {k === 'listPrice' ? (
                  <MoneyInput
                    id={`rb-${k}`}
                    value={bulkForm[k]}
                    onValueChange={(value) => setBulkForm({ ...bulkForm, [k]: value })}
                  />
                ) : (
                  <Input
                    id={`rb-${k}`}
                    value={bulkForm[k]}
                    onChange={(e) => setBulkForm({ ...bulkForm, [k]: e.target.value })}
                  />
                )}
              </div>
            ))}
            {bulkErr && (
              <p role="alert" className="text-sm text-destructive">
                {bulkErr}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setBulkErr(null)
                  const r = await updateRoomsBulkAction({
                    ids: selectedIds,
                    ...(bulkForm.floor.trim() !== '' && { floor: bulkForm.floor.trim() }),
                    ...(bulkForm.roomType.trim() !== '' && { roomType: bulkForm.roomType.trim() }),
                    ...(bulkForm.areaM2.trim() !== '' && { areaM2: num(bulkForm.areaM2) }),
                    ...(bulkForm.beds.trim() !== '' && { beds: num(bulkForm.beds) }),
                    ...(bulkForm.listPrice.trim() !== '' && { listPrice: num(bulkForm.listPrice) }),
                    ...(bulkForm.capacity.trim() !== '' && { capacity: num(bulkForm.capacity) }),
                  })
                  if (!r.ok) {
                    setBulkErr(r.error)
                    return
                  }
                  toast.success(`Đã cập nhật ${r.data?.count ?? selectedIds.length} phòng`)
                  setBulkEditOpen(false)
                  setChecked([])
                  router.refresh()
                })
              }
            >
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
