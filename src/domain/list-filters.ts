import { addDays } from './dates'
import { normalizePhone } from './phone'
import { removeDiacritics } from './text'

/** Khớp tìm khách như `searchTenants` ở server; `searchText` đã bỏ dấu, chữ thường. */
export function matchesTenantQuery(searchText: string | null, q: string): boolean {
  const query = removeDiacritics(q).toLowerCase().replace(/\s+/g, ' ').trim()
  if (!query) return true
  if (!searchText) return false
  const text = searchText.toLowerCase()
  const candidates = [query]
  const phone = normalizePhone(query)
  if (phone) {
    candidates.push(phone)
    const m = /^\+84(\d{9,10})$/.exec(phone)
    if (m) candidates.push('0' + m[1])
  }
  return candidates.some((c) => text.includes(c))
}

export type ContractView = 'active' | 'expiring' | 'unsigned' | 'ended'

export function matchesContractView(
  view: ContractView,
  lease: { status: string; signStatus: string; endDate: string },
  today: string,
  warningDays: number,
): boolean {
  switch (view) {
    case 'active':
      return lease.status === 'active'
    case 'expiring':
      return lease.status === 'active' && lease.endDate <= addDays(today, warningDays)
    case 'unsigned':
      return lease.signStatus !== 'signed'
    case 'ended':
      return lease.status === 'ended'
  }
}

export type InvoiceView = 'all' | 'draft' | 'unpaid' | 'overdue'

export function matchesInvoiceView(state: string, view: InvoiceView): boolean {
  return view === 'all' || (view === 'unpaid' ? state === 'unpaid' || state === 'partial' : state === view)
}

export function matchesPeriod(periodStart: string, period: string | null): boolean {
  return !period || periodStart.startsWith(period)
}
