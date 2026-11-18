import { expect, it } from 'vitest'
import { matchesContractView, matchesInvoiceView, matchesPeriod, matchesTenantQuery } from '@/domain/list-filters'

it('tìm khách có dấu, số điện thoại nhiều dạng', () => {
  expect(matchesTenantQuery('nguyen van an 0901234567', 'Nguyễn  Văn')).toBe(true)
  expect(matchesTenantQuery('nguyen van an 0901234567', '0901 234 567')).toBe(true)
  expect(matchesTenantQuery('nguyen van an 0901234567', '+84901234567')).toBe(true)
  expect(matchesTenantQuery('nguyen van an +84901234567 0901234567', '+84901234567')).toBe(true)
  expect(matchesTenantQuery('nguyen van an', '')).toBe(true)
  expect(matchesTenantQuery(null, 'an')).toBe(false)
  expect(matchesTenantQuery('nguyen van an', 'binh')).toBe(false)
})
it('lọc hợp đồng theo view', () => {
  const t = '2026-11-18'
  expect(matchesContractView('expiring', { status: 'active', signStatus: 'signed', endDate: '2026-12-18' }, t, 30)).toBe(true)
  expect(matchesContractView('expiring', { status: 'active', signStatus: 'signed', endDate: '2026-12-19' }, t, 30)).toBe(false)
  expect(matchesContractView('unsigned', { status: 'ended', signStatus: 'exported', endDate: '2025-01-01' }, t, 30)).toBe(true)
  expect(matchesContractView('active', { status: 'ended', signStatus: 'signed', endDate: '2025-01-01' }, t, 30)).toBe(false)
  expect(matchesContractView('ended', { status: 'ended', signStatus: 'signed', endDate: '2025-01-01' }, t, 30)).toBe(true)
})
it('lọc hoá đơn theo trạng thái và kỳ', () => {
  expect(matchesInvoiceView('partial', 'unpaid')).toBe(true)
  expect(matchesInvoiceView('overdue', 'unpaid')).toBe(false)
  expect(matchesInvoiceView('paid', 'all')).toBe(true)
  expect(matchesPeriod('2026-10-01', '2026-10')).toBe(true)
  expect(matchesPeriod('2026-10-01', null)).toBe(true)
  expect(matchesPeriod('2026-09-01', '2026-10')).toBe(false)
})
