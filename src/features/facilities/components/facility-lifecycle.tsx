'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { deleteFacilityAction, setFacilityActiveAction } from '@/server/facilities/actions'

/** Ngừng/dùng lại và xoá cơ sở (kèm các phòng bên trong). Xoá hẳn kèm toàn bộ dữ liệu đi kèm. */
export function FacilityLifecycle({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState<'stop' | 'delete' | null>(null)
  const toggle = () => start(async () => {
    setErr(null)
    const r = await setFacilityActiveAction(id, !isActive)
    if (!r.ok) { setErr(r.error); return }
    router.refresh()
  })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => (isActive ? setAsk('stop') : toggle())}>{isActive ? 'Ngừng sử dụng' : 'Dùng lại cơ sở'}</Button>
        <Button variant="destructive" size="sm" disabled={pending} onClick={() => setAsk('delete')}>Xoá cơ sở</Button>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <ConfirmDialog open={ask === 'stop'} onOpenChange={(o) => !o && setAsk(null)} title={`Ngừng sử dụng ${name}?`}
        description="Cơ sở sẽ ẩn khỏi các danh sách chọn." confirmLabel="Ngừng sử dụng" onConfirm={toggle} />
      <ConfirmDialog open={ask === 'delete'} onOpenChange={(o) => !o && setAsk(null)} title={`Xoá hẳn ${name}?`} destructive
        description="Xoá luôn các phòng, hợp đồng, công tơ, hoá đơn... của cơ sở này (khách thuê được giữ lại). Không thể hoàn tác." confirmLabel="Xoá cơ sở" onConfirm={() => start(async () => {
          setErr(null)
          const r = await deleteFacilityAction(id)
          if (!r.ok) { setErr(r.error); return }
          router.push('/facilities')
        })} />
    </div>
  )
}
