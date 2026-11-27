'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { MonthField } from '@/components/month-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { createDraftsAction, previewBatchAction } from '../../server/invoices/actions'

type Line = { type: string; description: string; amount: number }
type Row = {
  leaseId: string
  lines: Line[]
  warnings: string[]
  prepaidUntil: string | null
  period: { start: string; end: string } | null
}

/** Tạo hoá đơn nháp hàng loạt cho một toà theo tháng: chọn, xem trước, tạo. Nằm trong popup hoặc trang đầy đủ. */
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
  const [error, setError] = useState('')
  const facilityItems = facilities.map((f) => ({ value: f.id, label: f.name }))
  const preview = () =>
    start(async () => {
      const r = await previewBatchAction({ facilityId, period })
      if (!r.ok) {
        setError(r.error)
        setRows(null)
      } else {
        setError('')
        setRows(r.data as Row[])
      }
    })
  const create = () =>
    start(async () => {
      const r = await createDraftsAction({ facilityId, period })
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success(`Đã tạo ${r.data.ids.length} hoá đơn nháp`)
      router.push('/invoices?view=draft')
    })
  const due = rows?.filter((x) => x.period) ?? [],
    prepaid = rows?.filter((x) => !x.period && x.prepaidUntil) ?? []
  return (
    <div className="space-y-4 pb-1">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Toà</Label>
          <Select
            value={facilityId || null}
            onValueChange={(v) => {
              if (v) {
                setFacilityId(String(v))
                setRows(null)
                setError('')
              }
            }}
            items={facilityItems}
          >
            <SelectTrigger aria-label="Toà" className="h-9 w-full">
              <SelectValue placeholder="Chọn toà" />
            </SelectTrigger>
            <SelectContent>
              {facilityItems.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="generate-period">Tháng</Label>
          <MonthField
            id="generate-period"
            ariaLabel="Tháng"
            value={period}
            onValueChange={(next) => {
              setPeriod(next)
              setRows(null)
              setError('')
            }}
            clearable={false}
            align="start"
            placeholder="Chọn tháng"
            className="w-full"
          />
        </div>
      </div>
      <Button type="button" variant="outline" disabled={pending || !facilityId || !period} onClick={preview}>
        Xem trước
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {rows && (
        <div className="space-y-2.5 text-sm">
          {due.map((r) => (
            <div key={r.leaseId} className="space-y-1 rounded-xl border border-border/70 p-3.5">
              <div className="font-medium">{leaseLabels[r.leaseId] ?? r.leaseId}</div>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span>
                  {formatDateVN(r.period!.start)} – {formatDateVN(r.period!.end)}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatVND(r.lines.reduce((n, l) => n + l.amount, 0))}
                </span>
              </div>
              {r.warnings.map((w) => (
                <p key={w} className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          ))}
          {prepaid.length > 0 && (
            <div className="rounded-xl border border-border/70 p-3.5 text-muted-foreground">
              {prepaid.map((r) => (
                <p key={r.leaseId}>
                  {leaseLabels[r.leaseId]}: đã trả trước tới {formatDateVN(r.prepaidUntil)}
                </p>
              ))}
            </div>
          )}
          {due.length === 0 && <p className="text-muted-foreground">Không có hợp đồng nào cần lập hoá đơn kỳ này</p>}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="button" disabled={pending || due.length === 0} onClick={create}>
          Tạo {due.length || ''} hoá đơn nháp
        </Button>
      </div>
    </div>
  )
}
