'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { deleteRoomAction, setRoomActiveAction } from '@/server/rooms/actions'

/** Ngừng/dùng lại và xoá phòng. Xoá chỉ được khi phòng chưa phát sinh dữ liệu. */
export function RoomLifecycle({ id, code, isActive }: { id: string; code: string; isActive: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState<'stop' | 'delete' | null>(null)
  const toggle = () =>
    start(async () => {
      setErr(null)
      const r = await setRoomActiveAction(id, !isActive)
      if (!r.ok) {
        setErr(r.error)
        return
      }
      router.refresh()
    })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => (isActive ? setAsk('stop') : toggle())}>
          {isActive ? 'Ngừng sử dụng' : 'Dùng lại phòng'}
        </Button>
        <Button variant="destructive" size="sm" disabled={pending} onClick={() => setAsk('delete')}>
          Xoá phòng
        </Button>
      </div>
      {err && (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      )}
      <ConfirmDialog
        open={ask === 'stop'}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Ngừng sử dụng phòng ${code}?`}
        description="Phòng sẽ ẩn khỏi danh sách và không tạo hợp đồng mới được."
        confirmLabel="Ngừng sử dụng"
        onConfirm={toggle}
      />
      <ConfirmDialog
        open={ask === 'delete'}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Xoá hẳn phòng ${code}?`}
        destructive
        description="Xoá luôn hợp đồng, công tơ, hoá đơn... của phòng này. Không thể hoàn tác."
        confirmLabel="Xoá phòng"
        onConfirm={() =>
          start(async () => {
            setErr(null)
            const r = await deleteRoomAction(id)
            if (!r.ok) {
              setErr(r.error)
              return
            }
            router.push('/rooms')
          })
        }
      />
    </div>
  )
}
