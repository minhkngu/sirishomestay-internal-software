import { describe, expect, it } from 'vitest'
import {
  facilities,
  invoices,
  leaseFeeMeters,
  leaseFeeSnapshots,
  leases,
  meterReadings,
  meters,
  rooms,
  tenants,
} from '@/db'
import { resetContractAndMeterData } from '../../scripts/reset-contract-data'
import { createTestDb } from '../helpers/db'

describe('dọn dữ liệu hợp đồng và đồng hồ', () => {
  it('xoá hợp đồng, hoá đơn, đồng hồ, chỉ số; giữ phòng và khách; mỗi phòng có đủ hai đồng hồ mặc định', async () => {
    const db = await createTestDb()
    const [facility] = await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning()
    const [r1, r2] = await db
      .insert(rooms)
      .values([
        { facilityId: facility.id, code: '101' },
        { facilityId: facility.id, code: '102' },
      ])
      .returning()
    const [tenant] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facility.id,
        fullName: 'Khách',
        phone: '+84901234567',
        idNumber: '012345678901',
      })
      .returning()
    const [lease] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId: r1.id,
        tenantId: tenant.id,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        monthlyRent: 1,
        depositAmount: 1,
      })
      .returning()
    const [fee] = await db
      .insert(leaseFeeSnapshots)
      .values({ leaseId: lease.id, name: 'Điện', unit: 'kWh', quantitySource: 'meter', unitPrice: 3500 })
      .returning()
    const [meter] = await db
      .insert(meters)
      .values({ roomId: r1.id, utility: 'electric', installedOn: '2026-01-01', startReading: 0 })
      .returning()
    await db.insert(leaseFeeMeters).values({ leaseFeeId: fee.id, meterId: meter.id })
    await db.insert(meterReadings).values({ meterId: meter.id, period: '2026-10', readOn: '2026-10-31', value: 100 })
    await db.insert(invoices).values({
      code: 'I1',
      leaseId: lease.id,
      facilityId: facility.id,
      kind: 'monthly',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      issueDate: '2026-10-01',
      dueDate: '2026-10-10',
    } as never)

    const result = await resetContractAndMeterData(db)

    expect(result).toEqual({ rooms: 2 })
    expect(await db.select().from(leases)).toHaveLength(0)
    expect(await db.select().from(invoices)).toHaveLength(0)
    expect(await db.select().from(leaseFeeSnapshots)).toHaveLength(0)
    expect(await db.select().from(meterReadings)).toHaveLength(0)
    expect(await db.select().from(tenants)).toHaveLength(1)
    const after = await db.select().from(meters)
    expect(after).toHaveLength(4)
    for (const room of [r1, r2]) {
      const mine = after.filter((m) => m.roomId === room.id)
      expect(mine.map((m) => m.utility).sort()).toEqual(['electric', 'water'])
      expect(mine.every((m) => m.startReading === 0 && m.removedOn === null)).toBe(true)
    }
  })
})
