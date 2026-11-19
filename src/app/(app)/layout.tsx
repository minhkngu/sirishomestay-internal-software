import '@/modules/registrations'
import { AppShell } from '@/components/app-shell/app-shell'
import { NAV_ITEMS } from '@/components/app-shell/nav'
import { can } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { logout } from '../login/actions'

export default async function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const ctx = await getAccessContext()
  const hrefs = NAV_ITEMS.filter((i) => !i.requires || can(ctx, i.requires)).map((i) => i.href)
  return (
    <AppShell hrefs={hrefs} userName={ctx.fullName} logoutAction={logout}>
      {children}
      {modal}
    </AppShell>
  )
}
