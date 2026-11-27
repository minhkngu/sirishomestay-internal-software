'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createIncidentAction } from '../../server/incidents/actions'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Thấp' },
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Cao' },
]

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
  const [priority, setPriority] = useState('normal')
  const [assigneeId, setAssigneeId] = useState('')
  const assigneeOptions = [
    { value: '', label: '— Chưa giao —' },
    ...assignees.map((a) => ({ value: a.id, label: a.name })),
  ]
  return (
    <form
      className="grid max-w-lg gap-3.5 text-sm"
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
            priority,
            assigneeId: assigneeId || null,
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
      <div className="space-y-1.5">
        <Label htmlFor="inc-title" className="text-[13px] font-medium">
          Tiêu đề
        </Label>
        <Input id="inc-title" name="title" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inc-desc" className="text-[13px] font-medium">
          Mô tả
        </Label>
        <Textarea id="inc-desc" name="description" rows={3} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inc-priority" className="text-[13px] font-medium">
            Mức độ
          </Label>
          <Select value={priority} onValueChange={(v) => v && setPriority(String(v))} items={PRIORITY_OPTIONS}>
            <SelectTrigger id="inc-priority" aria-label="Mức độ" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inc-assignee" className="text-[13px] font-medium">
            Người xử lý
          </Label>
          <Select
            value={assigneeId}
            onValueChange={(v) => setAssigneeId(v == null ? '' : String(v))}
            items={assigneeOptions}
          >
            <SelectTrigger id="inc-assignee" aria-label="Người xử lý" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assigneeOptions.map((o) => (
                <SelectItem key={o.value || '__none__'} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={pending}>
          Báo sự cố
        </Button>
      </div>
    </form>
  )
}
