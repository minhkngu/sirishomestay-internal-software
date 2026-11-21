import { describe, expect, it } from 'vitest'
import type { AccessContext, Permission } from '@/domain/access'
import { buildReminders, type Snapshot } from '@/domain/reminders'

const ctx = (permissions: Permission[], facilityIds: string[]): AccessContext => ({ userId: 'u', email: 'a@x.com', fullName: 'A', permissions: new Set(permissions), facilityIds: new Set(facilityIds), isAdmin: permissions.includes('settings') })
const TODAY = '2026-11-16', S = { visaWarningDays: 30, contractWarningDays: 30 }
const empty: Snapshot = { invoices: [], visas: [], leases: [], metersMissing: [], facilities: [{ id: 'TD', name: 'Thảo Điền', expectedInvoiceDay: 5, leasesWithoutInvoice: 0 }, { id: 'BT', name: 'Bình Thạnh', expectedInvoiceDay: 5, leasesWithoutInvoice: 0 }], incidents: [], pendingDeposits: [], photos: [] }
const kinds = (r: ReturnType<typeof buildReminders>) => r.map(x => x.kind)
describe('buildReminders', () => {
  it('hoá đơn hạn 15/11 chưa thu là quá hạn, hạn 16/11 thì không', () => {
    const snap = { ...empty, invoices: [{ id: '1', code: 'A', facilityId: 'TD', dueDate: '2026-11-15', total: 100, paid: 0, tenantName: 'K' }, { id: '2', code: 'B', facilityId: 'TD', dueDate: '2026-11-16', total: 100, paid: 0, tenantName: 'K' }, { id: '3', code: 'C', facilityId: 'TD', dueDate: '2026-11-01', total: 100, paid: 100, tenantName: 'K' }] }
    const r = buildReminders(snap, ctx(['billing'], ['TD']), TODAY, S)
    expect(r[0]).toMatchObject({ kind: 'overdue_invoices', count: 1 }); expect(r[0].items[0].label).toContain('A')
  })
  it('người kỹ thuật chỉ thấy điện nước và sự cố của cơ sở mình', () => {
    const snap = { ...empty, metersMissing: [{ roomId: 'r1', roomCode: '101', facilityId: 'BT' }, { roomId: 'r2', roomCode: '201', facilityId: 'TD' }], incidents: [{ id: 'i1', title: 'x', facilityId: 'BT', priority: 'normal', status: 'new' }, { id: 'i2', title: 'y', facilityId: 'TD', priority: 'normal', status: 'new' }], invoices: [{ id: '1', code: 'A', facilityId: 'BT', dueDate: '2026-01-01', total: 1, paid: 0, tenantName: 'K' }] }
    const r = buildReminders(snap, ctx(['meters', 'assets', 'incidents'], ['BT']), TODAY, S)
    expect(kinds(r)).toEqual(['meters_missing', 'open_incidents']); expect(r.map(x => x.count)).toEqual([1, 1])
  })
  it('ngày kết thúc là sáng khách dọn đi: ngày đó đã khẩn, trước đó là cảnh báo kèm ngày dọn đi', () => {
    const l = { id: 'l', code: 'HD', facilityId: 'TD', roomCode: '1', tenantName: 'K', endDate: TODAY, signStatus: 'signed', followedUp: false }
    const item = (endDate: string) => buildReminders({ ...empty, leases: [{ ...l, endDate }] }, ctx(['tenants_contracts'], ['TD']), TODAY, S)[0].items[0]
    expect(item('2026-11-17')).toMatchObject({ severity: 'warning' }); expect(item('2026-11-17').sub).toContain('dọn đi sáng 17/11/2026')
    expect(item(TODAY)).toMatchObject({ severity: 'danger' }); expect(item(TODAY).sub).toContain('dọn đi sáng nay')
    expect(item('2026-11-14')).toMatchObject({ severity: 'danger' }); expect(item('2026-11-14').sub).toContain('quá hạn 2 ngày')
  })
  it('hợp đồng hết hạn trong 30 ngày có; đã có phụ lục thanh lý thì không', () => {
    const l = { id: 'l', code: 'HD', facilityId: 'TD', roomCode: '1', tenantName: 'K', endDate: '2026-12-10', signStatus: 'signed', followedUp: false }
    expect(kinds(buildReminders({ ...empty, leases: [l] }, ctx(['tenants_contracts'], ['TD']), TODAY, S))).toEqual(['contracts_ending'])
    expect(buildReminders({ ...empty, leases: [{ ...l, followedUp: true }] }, ctx(['tenants_contracts'], ['TD']), TODAY, S)).toEqual([])
    expect(buildReminders({ ...empty, leases: [{ ...l, endDate: '2027-01-01' }] }, ctx(['tenants_contracts'], ['TD']), TODAY, S)).toEqual([])
  })
  it('hoá đơn chưa tạo: chỉ báo khi đã qua ngày dự kiến', () => {
    const snap = { ...empty, facilities: [{ id: 'TD', name: 'Thảo Điền', expectedInvoiceDay: 20, leasesWithoutInvoice: 3 }] }
    expect(buildReminders(snap, ctx(['billing'], ['TD']), '2026-11-16', S)).toEqual([])
    expect(kinds(buildReminders(snap, ctx(['billing'], ['TD']), '2026-11-20', S))).toEqual(['invoices_not_created'])
  })
  it('ảnh sắp xoá: chỉ nhóm settings thấy, trong 7 ngày tới', () => {
    const snap = { ...empty, photos: [{ facilityId: 'TD', deleteAfter: '2026-11-22', name: 'a' }, { facilityId: 'TD', deleteAfter: '2026-11-24', name: 'b' }] }
    expect(buildReminders(snap, ctx(['tenants_contracts'], ['TD']), TODAY, S)).toEqual([])
    expect(buildReminders(snap, ctx(['settings'], []), TODAY, S)[0]).toMatchObject({ kind: 'photos_expiring', count: 1 })
  })
  it('chỉ hiện tối đa 8 dòng nhưng đếm đủ', () => {
    const visas = Array.from({ length: 12 }, (_, i) => ({ tenantId: String(i), name: `K${i}`, facilityId: 'TD', visaExpiry: '2026-11-20' }))
    expect(buildReminders({ ...empty, visas }, ctx(['tenants_contracts'], ['TD']), TODAY, S)[0]).toMatchObject({ count: 12, items: expect.any(Array) })
  })
})
