import { and, eq, inArray } from 'drizzle-orm'
import { depositContracts, depositEntries, leaseOccupants, leases, tenants } from '@/db'
import type { DB } from '@/db/client'
import { can, type AccessContext } from '@/domain/access'
import { roomStatus, type RoomStatus } from '@/domain/room-status'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry, LeaseTerms } from '@/domain/types'
import { todayVN } from '@/domain/dates'
import { contractTermsAt } from '../../domain/contract-terms'
import { getSettings } from '@/modules/platform'
import { leaseData, loadAddenda } from '../invoices/service'
import { getRoom, listRooms, roomAmenitiesOf, type Room } from '@/modules/facilities'

export type RoomWithStatus = Room & {
  status: RoomStatus
  tenantName?: string | null
  leaseEndDate?: string | null
  monthlyRent?: number | null
  depositBalance?: number | null
}

/** Phòng của một cơ sở kèm trạng thái suy ra từ hợp đồng thuê đang hiệu lực và hợp đồng cọc đang chờ. */
export async function listRoomsWithStatus(
  db: DB,
  ctx: AccessContext,
  opts: {
    facilityId?: string
    facilityIds?: string[]
    q?: string
    floor?: string
    includeInactive?: boolean
    today?: string
  },
): Promise<RoomWithStatus[]> {
  const list = await listRooms(db, ctx, opts)
  if (list.length === 0) return []
  const ids = list.map((r) => r.id)
  const [active, pending, settings] = await Promise.all([
    db
      .select({
        id: leases.id,
        roomId: leases.roomId,
        endDate: leases.endDate,
        monthlyRent: leases.monthlyRent,
        fullName: tenants.fullName,
        companyName: tenants.companyName,
      })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(and(inArray(leases.roomId, ids), eq(leases.status, 'active'))),
    db
      .select({ roomId: depositContracts.roomId, expectedMoveIn: depositContracts.expectedMoveIn })
      .from(depositContracts)
      .where(and(inArray(depositContracts.roomId, ids), eq(depositContracts.status, 'pending'))),
    getSettings(db),
  ])
  const today = opts.today ?? todayVN()
  // Tiền cọc của mọi hợp đồng đang thuê lấy một lần, chỉ khi có phòng người gọi được xem tiền
  const moneyLeaseIds = active
    .filter((a) => {
      const facilityId = list.find((r) => r.id === a.roomId)!.facilityId
      return can(ctx, 'tenants_contracts', facilityId) || can(ctx, 'billing', facilityId)
    })
    .map((a) => a.id)
  const deposits = moneyLeaseIds.length
    ? await db
        .select({
          leaseId: depositEntries.leaseId,
          type: depositEntries.type,
          amount: depositEntries.amount,
          status: depositEntries.status,
        })
        .from(depositEntries)
        .where(inArray(depositEntries.leaseId, moneyLeaseIds))
    : []
  return list.map((r) => {
    const lease = active.find((a) => a.roomId === r.id)
    const showMoney = !!lease && (can(ctx, 'tenants_contracts', r.facilityId) || can(ctx, 'billing', r.facilityId))
    return {
      ...r,
      ...(showMoney
        ? {
            monthlyRent: lease.monthlyRent,
            depositBalance: depositBalance(deposits.filter((d) => d.leaseId === lease.id) as unknown as DepositEntry[]),
          }
        : {}),
      status: roomStatus(
        r,
        lease ?? null,
        pending.find((p) => p.roomId === r.id) ?? null,
        today,
        settings.contractWarningDays,
      ),
      ...(can(ctx, 'tenants_contracts', r.facilityId)
        ? { tenantName: lease ? (lease.fullName ?? lease.companyName) : null, leaseEndDate: lease?.endDate ?? null }
        : {}),
    }
  })
}

/** Chi tiết phòng chỉ chứa thông tin phù hợp với quyền của người gọi. Tiền thuộc về hợp đồng nên không có ở đây. */
export async function getRoomDetail(
  db: DB,
  ctx: AccessContext,
  id: string,
): Promise<{
  room: Room
  status: RoomStatus
  amenities: { id: string; name: string }[]
  lease?: {
    id: string
    code: string
    tenantName: string | null | undefined
    occupants: { id: string; name: string | null }[]
    endDate: string
    startDate: string
    terms: LeaseTerms
  }
}> {
  const room = await getRoom(db, ctx, id)
  const showLease = can(ctx, 'tenants_contracts', room.facilityId)
  // Các truy vấn không phụ thuộc nhau chạy song song để trang mở nhanh
  const [amenityList, [active], [pending], settings] = await Promise.all([
    roomAmenitiesOf(db, id),
    db
      .select()
      .from(leases)
      .where(and(eq(leases.roomId, id), eq(leases.status, 'active'))),
    db
      .select({ expectedMoveIn: depositContracts.expectedMoveIn })
      .from(depositContracts)
      .where(and(eq(depositContracts.roomId, id), eq(depositContracts.status, 'pending'))),
    getSettings(db),
  ])
  const status = roomStatus(room, active ?? null, pending ?? null, todayVN(), settings.contractWarningDays)
  if (!active || !showLease) return { room, status, amenities: amenityList }
  // Điều khoản hiện hành = hợp đồng gốc + phụ lục có hiệu lực tới hôm nay; lấy cùng lượt với người thuê và người ở
  const [[tenant], occupants, original, addendaList] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, active.tenantId)),
    db
      .select({ id: tenants.id, name: tenants.fullName })
      .from(leaseOccupants)
      .innerJoin(tenants, eq(tenants.id, leaseOccupants.tenantId))
      .where(eq(leaseOccupants.leaseId, active.id)),
    leaseData(db, active.id),
    loadAddenda(db, active.id),
  ])
  const today = todayVN()
  const terms = contractTermsAt(original, addendaList, today < active.startDate ? active.startDate : today)
  return {
    room,
    status,
    amenities: amenityList,
    lease: {
      id: active.id,
      code: active.code,
      tenantName: tenant?.fullName ?? tenant?.companyName,
      occupants,
      endDate: terms.endDate,
      startDate: active.startDate,
      terms,
    },
  }
}
