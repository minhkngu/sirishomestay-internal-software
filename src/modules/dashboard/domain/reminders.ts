import { can, type AccessContext } from '@/domain/access'
import { addDays, formatDateVN } from '@/domain/dates'
import { INCIDENT_STATUS_LABELS } from '@/domain/incident-labels'

export type Severity = 'danger' | 'warning' | 'info'
export type ReminderKind =
  | 'overdue_invoices'
  | 'visa_expiring'
  | 'contracts_ending'
  | 'unsigned'
  | 'meters_missing'
  | 'invoices_not_created'
  | 'open_incidents'
  | 'pending_deposits'
  | 'photos_expiring'
export type ReminderItem = { label: string; sub: string; href: string; severity: Severity }
export type Reminder = { kind: ReminderKind; title: string; count: number; href: string; items: ReminderItem[] }

/** Dữ liệu thô đã gom theo cơ sở; hàm thuần lọc theo quyền/cơ sở và dựng thẻ nhắc việc. */
export type Snapshot = {
  invoices: {
    id: string
    code: string
    facilityId: string
    dueDate: string | null
    total: number
    paid: number
    tenantName: string
  }[]
  visas: { tenantId: string; name: string; facilityId: string; visaExpiry: string }[]
  leases: {
    id: string
    code: string
    facilityId: string
    roomCode: string
    tenantName: string
    endDate: string
    signStatus: string
    followedUp: boolean
  }[]
  metersMissing: { roomId: string; roomCode: string; facilityId: string }[]
  facilities: { id: string; name: string; expectedInvoiceDay: number; leasesWithoutInvoice: number }[]
  incidents: { id: string; title: string; facilityId: string; priority: string; status: string }[]
  pendingDeposits: { entryId: string; leaseId: string | null; label: string; facilityId: string; amount: number }[]
  photos: { facilityId: string; deleteAfter: string; name: string }[]
}
export type ReminderSettings = { visaWarningDays: number; contractWarningDays: number }
export const MAX_ITEMS = 8

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
/** Ngày kết thúc hợp đồng là sáng khách dọn đi (ở hết ngày liền trước): đến ngày đó là khẩn, quá ngày đó là quá hạn. */
const departureNote = (endDate: string, today: string) => {
  const left = daysBetween(today, endDate)
  return left > 0
    ? `dọn đi sáng ${formatDateVN(endDate)}`
    : left === 0
      ? 'dọn đi sáng nay'
      : `quá hạn ${-left} ngày (dọn đi sáng ${formatDateVN(endDate)})`
}

export function buildReminders(s: Snapshot, ctx: AccessContext, today: string, settings: ReminderSettings): Reminder[] {
  const out: Reminder[] = []
  const add = (kind: ReminderKind, title: string, href: string, items: ReminderItem[]) => {
    if (items.length) out.push({ kind, title, count: items.length, href, items: items.slice(0, MAX_ITEMS) })
  }
  const facilityName = (id: string) => s.facilities.find((f) => f.id === id)?.name ?? ''
  const ok = (perm: Parameters<typeof can>[1], facilityId: string) => can(ctx, perm, facilityId)

  add(
    'overdue_invoices',
    'Hoá đơn quá hạn',
    '/invoices?view=overdue',
    s.invoices
      .filter((i) => ok('billing', i.facilityId) && i.dueDate && i.dueDate < today && i.total > i.paid)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .map((i) => ({
        label: `${i.code} · ${i.tenantName}`,
        sub: `Còn ${(i.total - i.paid).toLocaleString('vi-VN')} · hạn ${formatDateVN(i.dueDate)}`,
        href: `/invoices/${i.id}`,
        severity: 'danger' as const,
      })),
  )
  add(
    'visa_expiring',
    'Visa sắp hết hạn',
    '/tenants?kind=foreign',
    s.visas
      .filter((v) => ok('tenants_contracts', v.facilityId) && v.visaExpiry <= addDays(today, settings.visaWarningDays))
      .sort((a, b) => a.visaExpiry.localeCompare(b.visaExpiry))
      .map((v) => ({
        label: v.name,
        sub: `${facilityName(v.facilityId)} · ${formatDateVN(v.visaExpiry)}`,
        href: `/tenants/${v.tenantId}`,
        severity: daysBetween(today, v.visaExpiry) <= 0 ? ('danger' as const) : ('warning' as const),
      })),
  )
  add(
    'contracts_ending',
    'Hợp đồng sắp hết hạn',
    '/contracts?view=expiring',
    s.leases
      .filter(
        (l) =>
          ok('tenants_contracts', l.facilityId) &&
          !l.followedUp &&
          l.endDate <= addDays(today, settings.contractWarningDays),
      )
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map((l) => ({
        label: `${l.code} · phòng ${l.roomCode}`,
        sub: `${l.tenantName} · ${departureNote(l.endDate, today)}`,
        href: `/contracts/${l.id}`,
        severity: l.endDate <= today ? ('danger' as const) : ('warning' as const),
      })),
  )
  add(
    'unsigned',
    'Hợp đồng chưa ký',
    '/contracts?view=unsigned',
    s.leases
      .filter((l) => ok('tenants_contracts', l.facilityId) && l.signStatus !== 'signed')
      .map((l) => ({
        label: `${l.code} · phòng ${l.roomCode}`,
        sub: l.tenantName,
        href: `/contracts/${l.id}`,
        severity: 'info' as const,
      })),
  )
  add(
    'meters_missing',
    'Chưa ghi điện nước',
    '/meters',
    s.metersMissing
      .filter((m) => ok('meters', m.facilityId))
      .map((m) => ({
        label: `Phòng ${m.roomCode}`,
        sub: facilityName(m.facilityId),
        href: '/meters',
        severity: 'warning' as const,
      })),
  )
  add(
    'invoices_not_created',
    'Chưa tạo hoá đơn tháng',
    '/invoices/generate',
    s.facilities
      .filter(
        (f) => ok('billing', f.id) && f.leasesWithoutInvoice > 0 && Number(today.slice(8)) >= f.expectedInvoiceDay,
      )
      .map((f) => ({
        label: f.name,
        sub: `${f.leasesWithoutInvoice} hợp đồng chưa có hoá đơn tháng ${today.slice(5, 7)}`,
        href: '/invoices/generate',
        severity: 'warning' as const,
      })),
  )
  add(
    'open_incidents',
    'Sự cố đang mở',
    '/incidents',
    s.incidents
      .filter((i) => ok('incidents', i.facilityId) && (i.status === 'new' || i.status === 'in_progress'))
      .sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high'))
      .map((i) => ({
        label: i.title,
        sub: `${facilityName(i.facilityId)} · ${i.status === 'new' ? INCIDENT_STATUS_LABELS.new : INCIDENT_STATUS_LABELS.in_progress}`,
        href: `/incidents/${i.id}`,
        severity: i.priority === 'high' ? ('danger' as const) : ('info' as const),
      })),
  )
  add(
    'pending_deposits',
    'Cọc chờ thu',
    '/contracts?view=deposits',
    s.pendingDeposits
      .filter((d) => ok('billing', d.facilityId))
      .map((d) => ({
        label: d.label,
        sub: `${d.amount.toLocaleString('vi-VN')} đ`,
        href: d.leaseId ? `/contracts/${d.leaseId}` : '/contracts?view=deposits',
        severity: 'info' as const,
      })),
  )
  add(
    'photos_expiring',
    'Ảnh sắp bị xoá',
    '/settings',
    ctx.isAdmin
      ? s.photos
          .filter((p) => p.deleteAfter >= today && p.deleteAfter <= addDays(today, 7))
          .map((p) => ({
            label: p.name || 'Ảnh',
            sub: `${facilityName(p.facilityId)} · xoá ${formatDateVN(p.deleteAfter)}`,
            href: '/settings',
            severity: 'warning' as const,
          }))
      : [],
  )
  return out
}
