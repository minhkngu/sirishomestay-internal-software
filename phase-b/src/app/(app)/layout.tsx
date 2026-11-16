import { AppNav, type NavItem } from '@/components/app-nav'
import { can } from '@/lib/access'
import { getAccessContext } from '@/lib/session'
import { logout } from '../(auth)/login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAccessContext()
  const items: NavItem[] = [
    { href: '/', label: 'Nhắc việc' },
    { href: '/facilities', label: 'Cơ sở & phòng' },
  ]
  if (can(ctx, 'tenants_contracts')) items.push({ href: '/tenants', label: 'Khách thuê' })
  if (ctx.isAdmin) {
    items.push({ href: '/users', label: 'Người dùng' })
    items.push({ href: '/import', label: 'Nhập dữ liệu' })
    items.push({ href: '/settings', label: 'Cài đặt' })
  }
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav items={items} userName={ctx.fullName} logoutAction={logout} />
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
