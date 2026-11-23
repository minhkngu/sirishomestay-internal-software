'use client'
import { BareSelect } from './contract-form-ui'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { selectLeaseInvoiceTemplateAction } from '@/server/invoice-templates/actions'

export function LeaseInvoiceTemplate({
  leaseId,
  selectedTemplateId,
  templates,
}: {
  leaseId: string
  selectedTemplateId: string | null
  templates: { id: string; name: string; isDefault: boolean }[]
}) {
  const [selected, setSelected] = useState(selectedTemplateId ?? '')
  const [pending, start] = useTransition()
  return (
    <div className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Mẫu hóa đơn</span>
      <BareSelect
        ariaLabel="Mẫu hóa đơn của hợp đồng"
        value={selected}
        disabled={pending}
        onValueChange={(next) => {
          start(async () => {
            const r = await selectLeaseInvoiceTemplateAction(leaseId, next || null)
            if (r.ok) setSelected(next)
            else toast.error(r.error)
          })
        }}
        options={[
          { value: '', label: 'Theo mặc định hệ thống' },
          ...templates.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? ' (mặc định)' : ''}` })),
        ]}
        className="w-auto min-w-56"
      />
    </div>
  )
}
