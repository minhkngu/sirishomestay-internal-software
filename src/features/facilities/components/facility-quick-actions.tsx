'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteFacilityAction, setFacilityActiveAction, updateFacilityAction } from '@/server/facilities/actions'

type Facility = { id: string; code: string; name: string; address: string; isActive: boolean }

const FIELDS = [
  ['code', 'Mã cơ sở'],
  ['name', 'Tên cơ sở'],
  ['address', 'Địa chỉ'],
] as const

/** Sửa nhanh (popup), ngừng/dùng lại và xoá ngay trong danh sách, không cần vào chi tiết. */
export function FacilityQuickActions({ facility }: { facility: Facility }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState<'stop' | 'delete' | null>(null)
  const [fe, setFe] = useState<Record<string, string>>({})
  const [v, setV] = useState({ code: facility.code, name: facility.name, address: facility.address })

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setErr(null)
      const r = await fn()
      if (!r.ok) {
        setErr(r.error ?? 'Không thực hiện được')
        return
      }
      after?.()
      router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button
        variant="outline"
        size="xs"
        disabled={pending}
        onClick={() => {
          setV({ code: facility.code, name: facility.name, address: facility.address })
          setErr(null)
          setFe({})
          setOpen(true)
        }}
      >
        Sửa
      </Button>
      <Button
        variant="outline"
        size="xs"
        disabled={pending}
        onClick={() => (facility.isActive ? setAsk('stop') : run(() => setFacilityActiveAction(facility.id, true)))}
      >
        {facility.isActive ? 'Ngừng' : 'Dùng lại'}
      </Button>
      <Button variant="destructive" size="xs" disabled={pending} onClick={() => setAsk('delete')}>
        Xoá
      </Button>
      <ConfirmDialog
        open={ask === 'stop'}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Ngừng sử dụng ${facility.name}?`}
        description="Cơ sở sẽ ẩn khỏi các danh sách chọn."
        confirmLabel="Ngừng sử dụng"
        onConfirm={() => run(() => setFacilityActiveAction(facility.id, false))}
      />
      <ConfirmDialog
        open={ask === 'delete'}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Xoá hẳn ${facility.name}?`}
        destructive
        description="Xoá luôn các phòng, hợp đồng, công tơ, hoá đơn... của cơ sở này (khách thuê được giữ lại). Không thể hoàn tác."
        confirmLabel="Xoá cơ sở"
        onConfirm={() => run(() => deleteFacilityAction(facility.id))}
      />
      {err && !open && (
        <p role="alert" className="basis-full text-right text-xs text-destructive">
          {err}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa cơ sở</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {FIELDS.map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`fq-${facility.id}-${k}`}>{label}</Label>
                <Input
                  id={`fq-${facility.id}-${k}`}
                  value={v[k]}
                  onChange={(e) => setV({ ...v, [k]: e.target.value })}
                />
                {fe[k] && <p className="text-sm text-destructive">{fe[k]}</p>}
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
                  setFe({})
                  const r = await updateFacilityAction(facility.id, v)
                  if (!r.ok) {
                    setErr(r.error)
                    setFe(r.fieldErrors ?? {})
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
    </div>
  )
}
