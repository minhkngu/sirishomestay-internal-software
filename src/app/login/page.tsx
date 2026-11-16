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
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 p-4">
      {demo && <p className="rounded bg-amber-100 p-2 text-center text-xs font-medium text-amber-900">Môi trường thử — dữ liệu giả</p>}
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
