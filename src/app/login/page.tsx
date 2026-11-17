import { db } from '@/db/client'
import { listDemoAccounts } from '@/server/users/service'
import { PERMISSION_LABELS } from '@/domain/access'
import { LoginForm } from './login-form'
import { DemoQuickLogin } from './demo-quick-login'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === '1'
  const accounts = demo ? await listDemoAccounts(db) : []
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-5 py-12">
      {demo && <p className="rounded bg-amber-100 p-2 text-center text-xs font-medium text-amber-900">Môi trường thử — dữ liệu giả</p>}
      <div><p className="text-sm font-semibold tracking-wide text-primary">SIRIS RESIDENCES</p><h1 className="mt-2 text-2xl font-semibold">Không gian làm việc Siris</h1><p className="mt-1 text-sm text-muted-foreground">Đăng nhập để quản lý các toà nhà và công việc hằng ngày.</p></div>
      <LoginForm />
      {demo && accounts.length > 0 && (
        <DemoQuickLogin accounts={accounts.map((a) => ({
          email: a.email, name: a.fullName,
          summary: a.permissions.map((p) => PERMISSION_LABELS[p]).join(', '),
        }))} />
      )}
    </main>
  )
}
