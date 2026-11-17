'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatVND } from '@/domain/money'
import { previewAddendumAction } from '@/server/addenda/actions'

type Preview = { adjustments: { description: string; amount: number; target: string; invoiceCode: string | null }[]; depositEntry: { type: string; amount: number } | null; invoice: { code: string; lines: { description: string; amount: number }[]; total: number } | null }
type Result = { ok: true; data: unknown } | { ok: false; error: string }
export type MeterOption = { meterId: string; roomId: string; utility: 'electric' | 'water'; serial: string | null }

/** Khung dùng chung của các wizard phụ lục: nhập → "Xem trước tiền" → lưu. Đổi dữ liệu nhập thì phải xem trước lại. */
export function AddendumShell({ label, kind, leaseId, input, create, children }: { label: string; kind: 'occupants' | 'extension' | 'transfer' | 'termination'; leaseId: string; input: unknown; create: (leaseId: string, input: unknown) => Promise<Result>; children: ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null)
  const key = JSON.stringify(input)
  const fresh = preview?.key === key ? preview.data : null
  const doPreview = () => start(async () => { const r = await previewAddendumAction(kind, leaseId, input); if (!r.ok) toast.error(r.error); else setPreview({ key, data: r.data as Preview }) })
  const save = () => start(async () => { const r = await create(leaseId, input); if (!r.ok) toast.error(r.error); else { toast.success('Đã lưu phụ lục'); setOpen(false); setPreview(null); router.refresh() } })
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{label}</Button>
  return (
    <section className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
      <h3 className="font-medium">{label}</h3>
      <div className="grid gap-2 text-sm">{children}</div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={doPreview}>Xem trước tiền</Button>
        <Button size="sm" disabled={pending || !fresh} onClick={save}>Lưu phụ lục</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
      </div>
      {fresh && (
        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
          {fresh.adjustments.map((a, i) => <p key={i}>{a.description}: <b>{formatVND(a.amount)}</b> ({a.target === 'current' ? `ghi vào hoá đơn ${a.invoiceCode}` : `cộng vào hoá đơn kỳ sau`})</p>)}
          {fresh.depositEntry && <p>Sổ cọc: {fresh.depositEntry.type === 'topup' ? 'thu thêm' : 'hoàn'} {formatVND(fresh.depositEntry.amount)} (chờ xử lý)</p>}
          {fresh.invoice && <><p className="font-medium">Hoá đơn thanh lý (nháp)</p>{fresh.invoice.lines.map((l, i) => <p key={i}>{l.description}: {formatVND(l.amount)}</p>)}<p className="font-medium">{fresh.invoice.total >= 0 ? 'Khách phải trả' : 'Hoàn cho khách'}: {formatVND(Math.abs(fresh.invoice.total))}</p></>}
          {!fresh.adjustments.length && !fresh.depositEntry && !fresh.invoice && <p className="text-muted-foreground">Không phát sinh khoản tiền nào</p>}
        </div>
      )}
    </section>
  )
}
export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="grid gap-1">{label}{children}</label>
export const inputCls = 'h-8 rounded border px-2'
export const TargetSelect = ({ value, onChange }: { value: string; onChange: (v: 'next' | 'current') => void }) => (
  <Field label="Điều chỉnh tiền kỳ đang tính"><select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as 'next')}><option value="next">Cộng vào hoá đơn kỳ sau</option><option value="current">Ghi thẳng vào hoá đơn đã duyệt</option></select></Field>
)
export function ReadingInputs({ meters, values, onChange, title }: { meters: MeterOption[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void; title: string }) {
  if (!meters.length) return null
  return <div className="grid gap-1"><span className="font-medium">{title}</span>{meters.map((m) => (
    <label key={m.meterId} className="flex items-center gap-2">{m.utility === 'electric' ? 'Điện' : 'Nước'} {m.serial ?? ''}<input type="number" className={`${inputCls} w-32`} value={values[m.meterId] ?? ''} onChange={(e) => onChange({ ...values, [m.meterId]: e.target.value })} /></label>))}</div>
}
export const toReadings = (values: Record<string, string>) => Object.entries(values).filter(([, v]) => v !== '').map(([meterId, v]) => ({ meterId, value: Number(v) }))
