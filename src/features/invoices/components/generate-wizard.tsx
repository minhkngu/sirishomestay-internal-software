'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { createDraftsAction, previewBatchAction } from '@/modules/leasing/actions'

type Line = { type: string; description: string; amount: number }
type Row = {
  leaseId: string
  lines: Line[]
  warnings: string[]
  prepaidUntil: string | null
  period: { start: string; end: string } | null
}
export function GenerateWizard({
  facilities,
  leaseLabels,
  defaultPeriod,
}: {
  facilities: { id: string; name: string }[]
  leaseLabels: Record<string, string>
  defaultPeriod: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? '')
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState<Row[] | null>(null)
  const preview = () =>
    start(async () => {
      const r = await previewBatchAction({ facilityId, period })
      if (!r.ok) toast.error(r.error)
      else setRows(r.data as Row[])
    })
  const create = () =>
    start(async () => {
      const r = await createDraftsAction({ facilityId, period })
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(`Đã tạo ${r.data.ids.length} hoá đơn nháp`)
        router.push('/invoices?view=draft')
      }
    })
  const due = rows?.filter((x) => x.period) ?? [],
    prepaid = rows?.filter((x) => !x.period && x.prepaidUntil) ?? []
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Cơ sở
          <select
            value={facilityId}
            onChange={(e) => {
              setFacilityId(e.target.value)
              setRows(null)
            }}
            className="block h-8 rounded-lg border px-2"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Kỳ (tháng)
          <input
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value)
              setRows(null)
            }}
            className="block h-8 rounded-lg border px-2"
          />
        </label>
        <Button disabled={pending || !facilityId || !period} onClick={preview}>
          Xem trước
        </Button>
      </div>
      {rows && (
        <div className="space-y-3">
          {due.map((r) => (
            <div key={r.leaseId} className="rounded-md border bg-card p-3 text-sm">
              <div className="font-medium">
                {leaseLabels[r.leaseId] ?? r.leaseId} · {formatDateVN(r.period!.start)} – {formatDateVN(r.period!.end)}{' '}
                · {formatVND(r.lines.reduce((n, l) => n + l.amount, 0))}
              </div>
              {r.warnings.map((w) => (
                <p key={w} className="text-amber-700">
                  ⚠ {w}
                </p>
              ))}
            </div>
          ))}
          {prepaid.length > 0 && (
            <div className="rounded-md border bg-card p-3 text-sm text-muted-foreground">
              {prepaid.map((r) => (
                <p key={r.leaseId}>
                  {leaseLabels[r.leaseId]}: Đã trả trước tới {formatDateVN(r.prepaidUntil)}
                </p>
              ))}
            </div>
          )}
          {due.length === 0 && (
            <p className="text-sm text-muted-foreground">Không có hợp đồng nào cần lập hoá đơn kỳ này</p>
          )}
          <Button disabled={pending || due.length === 0} onClick={create}>
            Tạo {due.length} hoá đơn nháp
          </Button>
        </div>
      )}
    </div>
  )
}
