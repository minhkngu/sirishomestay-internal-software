'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFacilityAction } from '@/server/facilities/actions'

export function NewFacilityButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [v, setV] = useState({ code: '', name: '', address: '' })
  const [err, setErr] = useState<string | null>(null)
  const [fe, setFe] = useState<Record<string, string>>({})

  if (!open) return <Button onClick={() => setOpen(true)}>Thêm cơ sở</Button>
  return (
    <div className="w-full max-w-md space-y-3 rounded-md border p-4">
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
          setOpen(false); setV({ code: '', name: '', address: '' }); router.refresh()
        })}>Lưu</Button>
        <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
      </div>
    </div>
  )
}
