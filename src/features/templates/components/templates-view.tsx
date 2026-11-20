'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { InvoiceTemplatesManager } from './invoice-templates-manager'
import { TemplatesManager } from './templates-manager'

type InvoiceTemplate = { id: string; name: string; isDefault: boolean; isSystem: boolean; hasBody: boolean; style: 'formal' | 'modern'; body: string | null; preview: string | null }
type WordTemplate = { id: string; docType: string; name: string; hasFile: boolean; hasBody: boolean; isDefault: boolean; style: 'formal' | 'modern'; body: string | null }

const TABS = [
  { id: 'invoice', label: 'Mẫu hóa đơn' },
  { id: 'word', label: 'Hợp đồng và biên bản' },
] as const

export function TemplatesView({ invoiceTemplates, wordTemplates }: { invoiceTemplates: InvoiceTemplate[]; wordTemplates: WordTemplate[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('invoice')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Mẫu giấy tờ</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quản lý mẫu hóa đơn PDF, và mẫu hợp đồng, phụ lục, biên bản soạn ngay trong app (xuất PDF và Word).</p>
      </div>

      <div className="flex gap-6 border-b border-border/70" role="tablist" aria-label="Mẫu giấy tờ">
        {TABS.map((t) => {
          const active = tab === t.id
          const count = t.id === 'invoice' ? invoiceTemplates.length : wordTemplates.length
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px flex items-baseline gap-2 border-b-2 px-0.5 pb-2.5 text-sm transition-colors',
                active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </button>
          )
        })}
      </div>

      {tab === 'invoice' ? <InvoiceTemplatesManager templates={invoiceTemplates} /> : <TemplatesManager templates={wordTemplates} />}
    </div>
  )
}
