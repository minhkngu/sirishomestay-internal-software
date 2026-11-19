'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, PERMISSION_LABELS, type Permission } from '@/domain/access'
import { createUser, resetUserPassword, updateUser } from '@/server/users/actions'

type Props = {
  facilities: { id: string; name: string }[]
  user?: { id: string; email: string; fullName: string; isActive: boolean; facilityIds: string[]; permissions: Permission[] }
}

export function UserForm({ facilities, user }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [email, setEmail] = useState(user?.email ?? '')
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [facilityIds, setFacilityIds] = useState<string[]>(user?.facilityIds ?? [])
  const [permissions, setPermissions] = useState<Permission[]>(user?.permissions ?? [])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [password, setPassword] = useState<string | null>(null)

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  function submit() {
    setError(null); setFieldErrors({})
    start(async () => {
      if (user) {
        const r = await updateUser(user.id, { fullName, facilityIds, permissions, isActive })
        if (!r.ok) { setError(r.error); setFieldErrors(r.fieldErrors ?? {}); return }
        router.push('/users')
        router.refresh()
      } else {
        const r = await createUser({ email, fullName, facilityIds, permissions })
        if (!r.ok) { setError(r.error); setFieldErrors(r.fieldErrors ?? {}); return }
        setPassword(r.data.password)
      }
    })
  }

  function reset() {
    if (!user) return
    start(async () => {
      const r = await resetUserPassword(user.id)
      if (r.ok) setPassword(r.data.password)
      else setError(r.error)
    })
  }

  if (password) {
    return (
      <div className="max-w-md space-y-3 rounded-md border bg-card p-4">
        <p className="font-medium">Mật khẩu tạm (chỉ hiện một lần — hãy gửi cho nhân viên):</p>
        <code className="block rounded bg-muted p-2 text-lg">{password}</code>
        <Button onClick={() => { router.push('/users'); router.refresh() }}>Xong</Button>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} />
        {fieldErrors.email && <p className="text-sm text-destructive">{fieldErrors.email}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">Họ tên</Label>
        <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        {fieldErrors.fullName && <p className="text-sm text-destructive">{fieldErrors.fullName}</p>}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cơ sở được truy cập</legend>
        {facilities.map((f) => (
          <label key={f.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={facilityIds.includes(f.id)} onChange={() => setFacilityIds(toggle(facilityIds, f.id))} />
            {f.name}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Nhóm quyền</legend>
        {PERMISSIONS.map((p) => (
          <label key={p} className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={permissions.includes(p)} onChange={() => setPermissions(toggle(permissions, p))} />
            <span>
              {PERMISSION_LABELS[p]}
              <span className="block text-xs text-muted-foreground">{PERMISSION_DESCRIPTIONS[p]}</span>
              {p === 'settings' && permissions.includes('settings') && <span className="block text-xs text-primary">Thấy mọi cơ sở</span>}
            </span>
          </label>
        ))}
        {fieldErrors.permissions && <p className="text-sm text-destructive">{fieldErrors.permissions}</p>}
      </fieldset>
      {user && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={() => setIsActive(!isActive)} /> Tài khoản đang hoạt động
        </label>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>{user ? 'Lưu' : 'Tạo người dùng'}</Button>
        {user && <Button variant="outline" onClick={reset} disabled={pending}>Đặt lại mật khẩu</Button>}
      </div>
    </div>
  )
}
