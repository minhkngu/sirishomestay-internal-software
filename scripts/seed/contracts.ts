import { eq } from 'drizzle-orm'
import { depositContracts, depositEntries, facilities, leaseFeeSnapshots, leaseOccupants, leases, rooms, tenants } from '@/db'
import { addDays } from '@/domain/dates'
import type { SeedModule } from './types'

/**
 * ~26 hợp đồng thuê đang chạy (3 cái hết hạn trong 30 ngày, 2 cái chưa ký) + 3 hợp đồng cọc chờ
 * (1 cái ở phòng đang có khách, 2 cái ở phòng trống).
 */
export const contractSeed: SeedModule = {
  name: 'contracts',
  async isSeeded({ db }) { return (await db.select({ id: leases.id }).from(leases).where(eq(leases.isDemo, true)).limit(1)).length > 0 },
  async run({ db, rng, today, state }) {
    const facs = await db.select().from(facilities).where(eq(facilities.isDemo, true))
    const codeOf = new Map(facs.map((f) => [f.id, f.code]))
    const occupied = new Set((await db.select().from(leases)).filter((l) => l.status === 'active').map((l) => l.roomId))
    const pending = new Set((await db.select().from(depositContracts)).filter((d) => d.status === 'pending').map((d) => d.roomId))
    const allRooms = (await db.select().from(rooms).where(eq(rooms.isDemo, true))).sort((a, b) => (codeOf.get(a.facilityId)! + a.code < codeOf.get(b.facilityId)! + b.code ? -1 : 1))
    const allTenants = await db.select().from(tenants).where(eq(tenants.isDemo, true))
    const people = allTenants.filter((t) => t.kind !== 'company')
    const companies = allTenants.filter((t) => t.kind === 'company')
    const feeIds = state.feeTypeIds as Record<string, string>
    const seq: Record<string, number> = {}

    const endOffsets = [12, 20, 27, ...Array.from({ length: 23 }, (_, i) => 60 + i * 17)]
    const leased = allRooms.filter((r) => !occupied.has(r.id)).slice(0, 26)
    const leaseIds: string[] = []
    for (let i = 0; i < leased.length; i++) {
      const room = leased[i]
      const isCompany = i % 9 === 8 && companies.length > 0
      const tenant = isCompany ? companies[Math.floor(i / 9) % companies.length] : people[i % people.length]
      const startDate = addDays(today, -(40 + i * 11))
      const endDate = addDays(today, endOffsets[i])
      const fcode = codeOf.get(room.facilityId)!
      const year = startDate.slice(0, 4)
      const key = `${fcode}-${year}`
      seq[key] = (seq[key] ?? 0) + 1
      const rent = room.listPrice ?? 10_000_000
      const [lease] = await db.insert(leases).values({
        id: rng.uuid(), code: `${fcode}-HĐ-${year}-${String(seq[key]).padStart(4, '0')}`, roomId: room.id, tenantId: tenant.id,
        startDate, endDate, monthlyRent: rent, depositAmount: rent, signStatus: i === 5 || i === 17 ? (i === 5 ? 'draft' : 'exported') : 'signed',
        status: 'active', isDemo: true,
      }).returning()
      const occupants = isCompany ? [people[(i + 3) % people.length], people[(i + 7) % people.length]] : [tenant, ...(i % 4 === 0 ? [people[(i + 5) % people.length]] : [])]
      const uniq = [...new Map(occupants.map((o) => [o.id, o])).values()]
      await db.insert(leaseOccupants).values(uniq.map((o) => ({ leaseId: lease.id, tenantId: o.id })))
      await db.insert(leaseFeeSnapshots).values([
        { leaseId: lease.id, feeTypeId: feeIds['Phí dịch vụ'], name: 'Phí dịch vụ', unit: 'người', quantitySource: 'occupants', quantity: 1, billing: 'monthly_fixed', unitPrice: 200_000 },
        ...(i % 3 === 0 ? [{ leaseId: lease.id, feeTypeId: feeIds['Gửi xe máy'], name: 'Gửi xe máy', unit: 'xe', quantitySource: 'legacy_fixed', quantity: 1, billing: 'monthly_fixed', unitPrice: 100_000 }] : []),
        ...(i % 2 === 0 ? [{ leaseId: lease.id, feeTypeId: feeIds['Internet'], name: 'Internet', unit: 'phòng', quantitySource: 'legacy_fixed', quantity: 1, billing: 'monthly_fixed', unitPrice: 150_000 }] : []),
      ])
      await db.insert(depositEntries).values({ leaseId: lease.id, date: startDate, type: 'collect', amount: rent, status: 'done', method: 'transfer', note: 'Thu cọc khi ký', isDemo: true })
      leaseIds.push(lease.id)
    }

    state.leaseIds = leaseIds

    // 3 hợp đồng cọc chờ: phòng đang có khách (có khách kế tiếp) + 2 phòng trống
    const availableDeposits = allRooms.filter((r) => !occupied.has(r.id) && !pending.has(r.id) && !leased.some((l) => l.id === r.id))
    const targets = [leased.find((r) => !pending.has(r.id))!, ...availableDeposits.slice(0, 2)]
    if (leased.length < 26 || targets.length < 3 || targets.some((r) => !r)) throw new Error('Không đủ phòng demo trống để nạp hợp đồng mẫu')
    const depIds: string[] = []
    for (let i = 0; i < targets.length; i++) {
      const room = targets[i]
      const tenant = people[(i + 20) % people.length]
      const [d] = await db.insert(depositContracts).values({
        id: rng.uuid(), roomId: room.id, tenantId: tenant.id, depositAmount: 3_000_000, agreedRent: room.listPrice ?? 10_000_000,
        expectedMoveIn: i === 0 ? addDays(today, 40) : addDays(today, 10 + i * 8), status: 'pending', isDemo: true,
      }).returning()
      await db.insert(depositEntries).values({ depositContractId: d.id, date: today, type: 'collect', amount: 3_000_000, status: 'done', method: 'cash', note: 'Cọc giữ chỗ', isDemo: true })
      depIds.push(d.id)
    }
    state.depositContractIds = depIds
  },
}
