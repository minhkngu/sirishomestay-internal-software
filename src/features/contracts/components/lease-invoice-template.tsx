'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { selectLeaseInvoiceTemplateAction } from '@/server/invoice-templates/actions'

export function LeaseInvoiceTemplate({ leaseId, selectedTemplateId, templates }: { leaseId: string; selectedTemplateId: string | null; templates: { id: string; name: string; isDefault: boolean }[] }) {
  const [selected, setSelected] = useState(selectedTemplateId ?? '')
  const [pending, start] = useTransition()
  return <label className="block rounded-xl border bg-card p-4 text-sm">Mẫu hóa đơn của hợp đồng <select aria-label="Mẫu hóa đơn của hợp đồng" className="ml-2 h-9 rounded border px-2" value={selected} disabled={pending} onChange={e => { const next = e.target.value; start(async () => { const r = await selectLeaseInvoiceTemplateAction(leaseId, next || null); if (r.ok) setSelected(next); else toast.error(r.error) }) }}><option value="">Theo mặc định hệ thống</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (mặc định)' : ''}</option>)}</select></label>
}
