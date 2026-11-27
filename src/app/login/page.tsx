import { db } from '@/db/client'
import { publicEnv } from '@/lib/env'
import { listDemoAccounts } from '@/modules/users'
import { PERMISSION_LABELS } from '@/domain/access'
import { Building2 } from 'lucide-react'
import { LoginForm } from './login-form'
import { DemoQuickLogin } from './demo-quick-login'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const demo = publicEnv.demoMode
  const accounts = demo ? await listDemoAccounts(db) : []
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <p className="text-[13px] font-medium text-primary">Siris Residences</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Không gian làm việc Siris</h1>
          <p className="mt-1 text-sm text-muted-foreground">Đăng nhập để quản lý các toà nhà và công việc hằng ngày.</p>
        </div>

        <LoginForm />

        {demo && accounts.length > 0 && (
          <DemoQuickLogin
            accounts={accounts.map((a) => ({
              email: a.email,
              name: a.fullName,
              summary: a.permissions.map((p) => PERMISSION_LABELS[p]).join(', '),
            }))}
          />
        )}
      </div>
    </main>
  )
}
