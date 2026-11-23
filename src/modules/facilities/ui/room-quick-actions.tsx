'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { deleteRoomAction, setRoomActiveAction, updateRoomAction } from '../server/rooms/actions'

export type RoomManage = {
  floor: string | null
  roomType: string | null
  areaM2: string | null
  beds: number | null
  listPrice: number | null
  capacity: number | null
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const FIELDS = [
  ['code', 'Mã phòng'],
  ['floor', 'Tầng'],
  ['roomType', 'Loại phòng'],
  ['areaM2', 'Diện tích (m²)'],
  ['beds', 'Số giường'],
  ['listPrice', 'Giá niêm yết (VND)'],
  ['capacity', 'Sức chứa'],
] as const

/** Menu ⋯ trên ô phòng: sửa nhanh (popup), ngừng/dùng lại, xoá. Tiện ích giữ nguyên khi sửa nhanh. */
export function RoomQuickActions({
  id,
  code,
  isActive,
  manage,
}: {
  id: string
  code: string
  isActive: boolean
  manage: RoomManage
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState<'stop' | 'delete' | null>(null)
  const initial = () => ({
    code,
    floor: manage.floor ?? '',
    roomType: manage.roomType ?? '',
    areaM2: manage.areaM2 ?? '',
    beds: manage.beds?.toString() ?? '',
    listPrice: manage.listPrice?.toString() ?? '',
    capacity: manage.capacity?.toString() ?? '',
  })
  const [v, setV] = useState(initial)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error ?? 'Không thực hiện được')
        return
      }
      router.refresh()
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Thao tác nhanh phòng ${code}`}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-md text-base leading-none text-current opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setV(initial())
              setErr(null)
              setOpen(true)
            }}
          >
            Sửa nhanh
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onClick={() => (isActive ? setAsk('stop') : run(() => setRoomActiveAction(id, true)))}
          >
            {isActive ? 'Ngừng sử dụng' : 'Dùng lại'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={pending} onClick={() => setAsk('delete')}>
            Xoá phòng
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={ask === 'stop'}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Ngừng sử dụng phòng ${code}?`}
        description="Phòng sẽ ẩn khỏi danh sách và không tạo hợp đồng mới được."
        confirmLabel="Ngừng sử dụng"
        onConfirm={() => run(() => setRoomActiveAction(id, false))}
      />
      <ConfirmDialog
        open={ask === 'delete'}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Xoá hẳn phòng ${code}?`}
        destructive
        description="Xoá luôn hợp đồng, công tơ, hoá đơn... của phòng này. Không thể hoàn tác."
        confirmLabel="Xoá phòng"
        onConfirm={() => run(() => deleteRoomAction(id))}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa phòng {code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {FIELDS.map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`rq-${id}-${k}`}>{label}</Label>
                {k === 'listPrice' ? (
                  <MoneyInput id={`rq-${id}-${k}`} value={v[k]} onValueChange={(value) => setV({ ...v, [k]: value })} />
                ) : (
                  <Input id={`rq-${id}-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                )}
              </div>
            ))}
            {err && (
              <p role="alert" className="text-sm text-destructive">
                {err}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setErr(null)
                  const r = await updateRoomAction(id, {
                    code: v.code,
                    floor: v.floor || null,
                    roomType: v.roomType || null,
                    areaM2: num(v.areaM2),
                    beds: num(v.beds),
                    listPrice: num(v.listPrice),
                    capacity: num(v.capacity),
                  })
                  if (!r.ok) {
                    setErr(r.fieldErrors?.code ?? r.error)
                    return
                  }
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
