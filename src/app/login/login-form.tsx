'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from './actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null)
  return (
    <Card>
      <CardHeader><CardTitle>Siris — Đăng nhập</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
