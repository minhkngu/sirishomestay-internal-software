'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFacilityAction, updateFacilityAction } from '@/server/facilities/actions'
import { BankAccountFields, emptyBankAccount } from '@/components/bank-account/bank-account-fields'
import type { BankAccount } from '@/domain/types'

export function NewFacilityButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [v, setV] = useState({ code: '', name: '', address: '' })
  const [err, setErr] = useState<string | null>(null)
  const [fe, setFe] = useState<Record<string, string>>({})

  const close = () => { setOpen(false); setErr(null); setFe({}); setV({ code: '', name: '', address: '' }) }
  return (
    <>
    <Button onClick={() => setOpen(true)}>Thêm cơ sở</Button>
    <FormDialog open={open} onOpenChange={(o) => { if (!o) close() }} title="Thêm cơ sở" size="sm">
    <div className="space-y-3">
      {(['code', 'name', 'address'] as const).map((k) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`f-${k}`}>{{ code: 'Mã cơ sở', name: 'Tên cơ sở', address: 'Địa chỉ' }[k]}</Label>
          <Input id={`f-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          {fe[k] && <p className="text-sm text-destructive">{fe[k]}</p>}
        </div>
      ))}
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          setErr(null); setFe({})
          const r = await createFacilityAction(v)
          if (!r.ok) { setErr(r.error); setFe(r.fieldErrors ?? {}); return }
          close(); router.refresh()
        })}>Lưu</Button>
        <Button variant="outline" onClick={close}>Huỷ</Button>
      </div>
    </div>
    </FormDialog>
    </>
  )
}

export function FacilityBankAccount({ id, account }: { id: string; account: BankAccount | null }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(account !== null)
  const [value, setValue] = useState(account ?? emptyBankAccount)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  return <section className="max-w-md space-y-3 rounded-md border bg-card p-4">
    <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Dùng tài khoản riêng</label>
    {enabled && <BankAccountFields value={value} onChange={setValue} prefix="facility-bank" />}
    {message && <p role="status" className="text-sm">{message}</p>}
    <Button disabled={pending} onClick={() => start(async () => {
      const result = await updateFacilityAction(id, { bankAccount: enabled ? value : null })
      setMessage(result.ok ? 'Đã lưu tài khoản' : result.error)
      if (result.ok) router.refresh()
    })}>Lưu tài khoản</Button>
  </section>
}
