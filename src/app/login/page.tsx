import { db } from '@/db/client'
import { listDemoAccounts } from '@/server/users/service'
import { PERMISSION_LABELS } from '@/domain/access'
import { Building2, Sparkles } from 'lucide-react'
import { LoginForm } from './login-form'
import { DemoQuickLogin } from './demo-quick-login'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === '1'
  const accounts = demo ? await listDemoAccounts(db) : []
  return (
    <main className="relative flex min-h-screen w-full flex-col justify-center items-center bg-gradient-to-b from-[#F4FAF6] via-background to-[#EDF5F1] px-4 py-12">
      {/* Decorative subtle ambient lights */}
      <div className="pointer-events-none absolute -top-40 -left-40 size-96 rounded-full bg-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 size-96 rounded-full bg-accent/30 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-6">
        {demo && (
          <div className="inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/90 px-3 py-1 text-center text-xs font-medium text-amber-900 shadow-2xs backdrop-blur-xs">
            <Sparkles className="size-3.5 text-amber-600 shrink-0" />
            <span>Môi trường thử — dữ liệu giả</span>
          </div>
        )}

        <div className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
            <Building2 className="size-6" />
          </div>
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">SIRIS RESIDENCES</p>
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
