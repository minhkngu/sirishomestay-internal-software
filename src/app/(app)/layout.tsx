import { AppShell } from '@/components/app-shell/app-shell'
import { NAV_ITEMS } from '@/components/app-shell/nav'
import { db } from '@/db/client'
import { can } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { logout } from '../login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAccessContext()
  const facilities = await listFacilities(db, ctx)
  const hrefs = NAV_ITEMS.filter((i) => !i.requires || can(ctx, i.requires)).map((i) => i.href)
  return (
    <AppShell hrefs={hrefs} facilities={facilities.map((f) => ({ id: f.id, name: f.name }))} userName={ctx.fullName}
      demo={process.env.NEXT_PUBLIC_DEMO_MODE === '1'} logoutAction={logout}>
      {children}
    </AppShell>
  )
}
