'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createIncidentAction } from '../../server/incidents/actions'

export function IncidentForm({
  roomId,
  assetId,
  facilityId,
  assignees,
}: {
  roomId?: string
  assetId?: string
  facilityId?: string
  assignees: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid max-w-md gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        setError(null)
        start(async () => {
          const r = await createIncidentAction({
            roomId,
            assetId,
            facilityId,
            title: String(f.get('title')),
            description: String(f.get('description') ?? ''),
            priority: String(f.get('priority')),
            assigneeId: f.get('assigneeId') ? String(f.get('assigneeId')) : null,
          })
          if (!r.ok) {
            setError(r.error)
            return
          }
          toast.success('Đã báo sự cố — thêm ảnh ở trang chi tiết')
          router.push(`/incidents/${r.data.id}`)
        })
      }}
    >
      <label className="grid gap-1">
        Tiêu đề
        <input name="title" required className="h-10 rounded-lg border px-2" />
      </label>
      <label className="grid gap-1">
        Mô tả
        <textarea name="description" rows={3} className="rounded-lg border bg-card p-2" />
      </label>
      <label className="grid gap-1">
        Mức độ
        <select name="priority" defaultValue="normal" className="h-10 rounded-lg border px-2">
          <option value="low">Thấp</option>
          <option value="normal">Bình thường</option>
          <option value="high">Cao</option>
        </select>
      </label>
      <label className="grid gap-1">
        Người xử lý
        <select name="assigneeId" className="h-10 rounded-lg border px-2">
          <option value="">— Chưa giao —</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        Báo sự cố
      </Button>
    </form>
  )
}
