'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatPhoneDisplay, normalizePhone } from '@/domain/phone'
import { createTenantAction, updateTenantAction } from '@/server/tenants/actions'

type Kind = 'foreign' | 'vietnamese' | 'company'
type Field = { key: string; label: string; type?: 'date' | 'text' }

const KIND_LABELS: Record<Kind, string> = { foreign: 'Khách nước ngoài', vietnamese: 'Khách Việt Nam', company: 'Công ty' }
const FIELDS: Record<Kind, Field[]> = {
  foreign: [
    { key: 'fullName', label: 'Họ tên' }, { key: 'nationality', label: 'Quốc tịch' }, { key: 'passportNumber', label: 'Số passport' },
    { key: 'passportExpiry', label: 'Hết hạn passport', type: 'date' }, { key: 'visaType', label: 'Loại visa' },
    { key: 'visaExpiry', label: 'Hết hạn visa', type: 'date' }, { key: 'dateOfBirth', label: 'Ngày sinh', type: 'date' },
    { key: 'phone', label: 'Số điện thoại' }, { key: 'email', label: 'Email' },
  ],
  vietnamese: [
    { key: 'fullName', label: 'Họ tên' }, { key: 'idNumber', label: 'Số CCCD' }, { key: 'idIssueDate', label: 'Ngày cấp', type: 'date' },
    { key: 'idIssuePlace', label: 'Nơi cấp' }, { key: 'dateOfBirth', label: 'Ngày sinh', type: 'date' },
    { key: 'permanentAddress', label: 'Địa chỉ thường trú' }, { key: 'phone', label: 'Số điện thoại' }, { key: 'email', label: 'Email' },
  ],
  company: [
    { key: 'companyName', label: 'Tên công ty' }, { key: 'taxCode', label: 'Mã số thuế' }, { key: 'companyAddress', label: 'Địa chỉ' },
    { key: 'representative', label: 'Người đại diện' }, { key: 'contactPerson', label: 'Người liên hệ' },
    { key: 'phone', label: 'Số điện thoại (tuỳ chọn)' }, { key: 'email', label: 'Email' },
  ],
}

type Props = {
  facilities: { id: string; name: string }[]
  tenant?: { id: string; kind: Kind; homeFacilityId: string; note: string } & Record<string, string | null>
}

export function TenantForm({ facilities, tenant }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<Kind>(tenant?.kind ?? 'foreign')
  const [homeFacilityId, setHome] = useState(tenant?.homeFacilityId ?? facilities[0]?.id ?? '')
  const [note, setNote] = useState(tenant?.note ?? '')
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    if (tenant) for (const [k, val] of Object.entries(tenant)) if (typeof val === 'string') v[k] = val
    return v
  })
  const [error, setError] = useState<string | null>(null)
  const [fe, setFe] = useState<Record<string, string>>({})

  function submit() {
    setError(null); setFe({})
    start(async () => {
      const payload = { kind, homeFacilityId, note, ...Object.fromEntries(FIELDS[kind].map((f) => [f.key, values[f.key] ?? ''])) }
      const r = tenant ? await updateTenantAction(tenant.id, payload) : await createTenantAction(payload)
      if (!r.ok) { setError(r.error); setFe(r.fieldErrors ?? {}); return }
      router.push(`/tenants/${r.data.id}`)
      router.refresh()
    })
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap gap-2" role="tablist">
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            className={cn('min-w-36 flex-1 rounded-lg border px-4 py-3 text-base font-medium', kind === k && 'bg-[var(--primary-strong)] text-primary-foreground')}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="home">Cơ sở quản lý</Label>
        <select id="home" value={homeFacilityId} onChange={(e) => setHome(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
          {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {fe.homeFacilityId && <p className="text-sm text-destructive">{fe.homeFacilityId}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[kind].map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`t-${f.key}`}>{f.label}</Label>
            <Input id={`t-${f.key}`} type={f.type ?? 'text'} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            {f.key === 'phone' && values.phone && !fe.phone && (
              <p className="text-xs text-muted-foreground">{normalizePhone(values.phone) ? `Sẽ lưu: ${formatPhoneDisplay(normalizePhone(values.phone))}` : 'Số điện thoại chưa hợp lệ'}</p>
            )}
            {fe[f.key] && <p className="text-sm text-destructive">{fe[f.key]}</p>}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="t-note">Ghi chú</Label>
        <Input id="t-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={pending}>{tenant ? 'Lưu' : 'Tạo khách'}</Button>
    </div>
  )
}
