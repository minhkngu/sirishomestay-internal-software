import {
  AlertTriangle, BellRing, Boxes, Building2, ClipboardList, DoorOpen, FileText, FileUp, Gauge, History, Receipt, Settings, Users, UserCog, Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/domain/access'

export type NavItem = { href: string; label: string; icon: LucideIcon; requires?: Permission }

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Nhắc việc', icon: BellRing },
  { href: '/facilities', label: 'Cơ sở', icon: Building2 },
  { href: '/rooms', label: 'Phòng', icon: DoorOpen },
  { href: '/tenants', label: 'Khách thuê', icon: Users, requires: 'tenants_contracts' },
  { href: '/contracts', label: 'Hợp đồng', icon: FileText, requires: 'tenants_contracts' },
  { href: '/meters', label: 'Chỉ số', icon: Gauge, requires: 'meters' },
  { href: '/invoices', label: 'Hoá đơn', icon: Receipt, requires: 'billing' },
  { href: '/cashbook', label: 'Thu chi', icon: Wallet, requires: 'billing' },
  { href: '/assets', label: 'Tài sản', icon: Boxes, requires: 'assets' },
  { href: '/incidents', label: 'Sự cố', icon: AlertTriangle, requires: 'incidents' },
  { href: '/users', label: 'Người dùng', icon: UserCog, requires: 'settings' },
  { href: '/templates', label: 'Mẫu giấy tờ', icon: ClipboardList, requires: 'settings' },
  { href: '/import', label: 'Nhập dữ liệu', icon: FileUp, requires: 'settings' },
  { href: '/settings', label: 'Cài đặt', icon: Settings, requires: 'settings' },
  { href: '/audit', label: 'Nhật ký', icon: History, requires: 'settings' },
]
