'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { setIncidentStatusAction } from '@/server/incidents/actions'

export type BoardItem = { id: string; title: string; priority: string; status: string; place: string; assigneeName: string | null }
const COLS = [['new', 'Mới'], ['in_progress', 'Đang xử lý'], ['done', 'Xong']] as const
const NEXT: Record<string, ['in_progress' | 'done', string]> = { new: ['in_progress', 'Nhận xử lý'], in_progress: ['done', 'Hoàn tất'] }
const PRIORITY: Record<string, string> = { high: 'Cao', normal: '', low: 'Thấp' }
export function IncidentBoard({ items }: { items: BoardItem[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {COLS.map(([status, label]) => (
        <section key={status} className="space-y-2 rounded-lg border p-3">
          <h2 className="font-medium">{label} ({items.filter((i) => i.status === status).length})</h2>
          {items.filter((i) => i.status === status).map((i) => (
            <div key={i.id} className="space-y-1 rounded-md border p-2 text-sm">
              <Link className="font-medium underline" href={`/incidents/${i.id}`}>{i.title}</Link>
              <p className="text-muted-foreground">{i.place}{PRIORITY[i.priority] ? ` · Mức ${PRIORITY[i.priority]}` : ''}{i.assigneeName ? ` · ${i.assigneeName}` : ''}</p>
              {NEXT[i.status] && <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await setIncidentStatusAction(i.id, NEXT[i.status][0]); if (!r.ok) toast.error(r.error); else router.refresh() })}>{NEXT[i.status][1]}</Button>}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
