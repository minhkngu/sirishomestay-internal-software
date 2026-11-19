import { describe, it, expect, beforeEach } from 'vitest'
import { facilities } from '@/db'
import { createTenant } from '@/server/tenants/service'
import { updateSettings } from '@/server/settings/service'
import { getExpiringVisas } from '@/server/dashboard/service'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(facilityIds),
    isAdmin: perms.includes('settings'),
  }
}
const TODAY = '2026-11-16'

describe('getExpiringVisas', () => {
  let db: DB
  let fa: string
  let fb: string
  let admin: AccessContext
  let n = 0
  const add = (visaExpiry: string | null, over: Record<string, unknown> = {}) => {
    n++
    return createTenant(db, admin, {
      kind: 'foreign',
      homeFacilityId: fa,
      fullName: `Khách ${visaExpiry}`,
      phone: `+1415555${String(n).padStart(4, '0')}`,
      passportNumber: `P${n}`,
      visaExpiry,
      ...over,
    })
  }
  beforeEach(async () => {
    db = await createTestDb()
    n = 0
    fa = (await db.insert(facilities).values({ code: 'A', name: 'Cơ sở A' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'B', name: 'Cơ sở B' }).returning())[0].id
    admin = ctxOf(['settings'])
  })

  it('gồm hôm nay, đã hết hạn và đúng ngày thứ 30; loại ngày thứ 31; sắp xếp tăng dần', async () => {
    await add('2026-12-17')
    await add('2026-12-16')
    await add('2026-11-16')
    await add('2026-11-10')
    const r = await getExpiringVisas(db, admin, TODAY)
    expect(r.map((x) => [x.visaExpiry, x.daysLeft])).toEqual([
      ['2026-11-10', -6],
      ['2026-11-16', 0],
      ['2026-12-16', 30],
    ])
    expect(r[0]).toMatchObject({ facilityName: 'Cơ sở A', name: 'Khách 2026-11-10' })
  })

  it('bỏ qua khách không có visa hoặc không phải khách nước ngoài', async () => {
    await add(null)
    await createTenant(db, admin, {
      kind: 'vietnamese',
      homeFacilityId: fa,
      fullName: 'VN',
      phone: '0901234567',
      idNumber: '012345678901',
    })
    expect(await getExpiringVisas(db, admin, TODAY)).toEqual([])
  })

  it('người không có tenants_contracts → []', async () => {
    await add('2026-11-16')
    expect(await getExpiringVisas(db, ctxOf(['billing'], [fa]), TODAY)).toEqual([])
  })

  it('người chỉ cơ sở A không thấy khách cơ sở B', async () => {
    await add('2026-11-16')
    await add('2026-11-17', { homeFacilityId: fb })
    const r = await getExpiringVisas(db, ctxOf(['tenants_contracts'], [fa]), TODAY)
    expect(r.map((x) => x.visaExpiry)).toEqual(['2026-11-16'])
  })

  it('đổi ngưỡng thành 60 ngày thì 2027-01-10 xuất hiện', async () => {
    await add('2027-01-10')
    expect(await getExpiringVisas(db, admin, TODAY)).toEqual([])
    await updateSettings(db, admin, { visaWarningDays: 60 })
    expect((await getExpiringVisas(db, admin, TODAY)).map((x) => x.visaExpiry)).toEqual(['2027-01-10'])
  })

  it('mặc định "hôm nay" tính theo giờ Việt Nam', async () => {
    // 2026-11-15T23:30Z = 06:30 ngày 2026-11-16 giờ VN
    const r = await getExpiringVisas(db, admin, undefined, new Date('2026-11-15T23:30:00Z'))
    expect(r).toEqual([])
    await add('2026-11-16')
    expect((await getExpiringVisas(db, admin, undefined, new Date('2026-11-15T23:30:00Z')))[0].daysLeft).toBe(0)
  })
})

describe('getDashboard', () => {
  it('gom nhắc việc theo quyền và cơ sở; số liệu phòng và công nợ quá hạn', async () => {
    const { rooms, tenants, leases, invoices, invoiceLines, payments, incidents } = await import('@/db')
    const { getDashboard } = await import('@/server/dashboard/service')
    const db = await createTestDb()
    const [fa, fb] = await db
      .insert(facilities)
      .values([
        { code: 'A', name: 'A' },
        { code: 'B', name: 'B' },
      ])
      .returning()
    const [ra, rb] = await db
      .insert(rooms)
      .values([
        { facilityId: fa.id, code: '1' },
        { facilityId: fa.id, code: '2' },
      ])
      .returning()
    const [t] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: fa.id,
        fullName: 'K',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    const [l] = await db
      .insert(leases)
      .values({
        code: 'HD',
        roomId: ra.id,
        tenantId: t.id,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        monthlyRent: 100,
        depositAmount: 0,
      })
      .returning()
    const [inv] = await db
      .insert(invoices)
      .values({
        code: 'A-HD-1',
        leaseId: l.id,
        facilityId: fa.id,
        kind: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        issueDate: '2026-10-01',
        dueDate: '2026-11-05',
        status: 'approved',
      })
      .returning()
    await db
      .insert(invoiceLines)
      .values({ invoiceId: inv.id, type: 'rent', description: 'r', quantity: 1, unitPrice: 100, amount: 100 })
    await db
      .insert(payments)
      .values({ invoiceId: inv.id, paidOn: '2026-11-06', amount: 30, method: 'cash', receivedBy: crypto.randomUUID() })
    await db.insert(incidents).values({ facilityId: fb.id, title: 'x', reportedBy: crypto.randomUUID() })
    void rb
    const admin = await getDashboard(db, ctxOf(['settings']), TODAY)
    expect(admin.stats).toMatchObject({ occupied: 1, vacant: 1, overdueDebt: 70 })
    expect(admin.reminders.map((r) => r.kind)).toEqual(
      expect.arrayContaining(['overdue_invoices', 'open_incidents', 'invoices_not_created']),
    )
    const tech = await getDashboard(db, ctxOf(['incidents'], [fa.id]), TODAY)
    expect(tech.reminders).toEqual([])
  })
})
