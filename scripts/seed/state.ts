import { eq } from 'drizzle-orm'
import { facilities, rooms, userProfiles, feeTypes } from '@/db'
import type { SeedCtx } from './types'

/** Khôi phục các khoá được những module sau sử dụng khi module trước đã tồn tại. */
export async function loadSeedState({ db, state }: SeedCtx) {
  const facs = await db.select().from(facilities).where(eq(facilities.isDemo, true))
  const codes = new Map(facs.map((f) => [f.id, f.code]))
  state.facilityIds = Object.fromEntries(facs.map((f) => [f.code, f.id]))
  state.roomIds = Object.fromEntries(
    (await db.select().from(rooms).where(eq(rooms.isDemo, true)))
      .filter((r) => codes.has(r.facilityId))
      .map((r) => [`${codes.get(r.facilityId)}:${r.code}`, r.id]),
  )
  state.userIds = Object.fromEntries(
    (await db.select().from(userProfiles)).filter((u) => u.isDemo).map((u) => [u.email, u.id]),
  )
  state.feeTypeIds = Object.fromEntries(
    (await db.select().from(feeTypes)).filter((f) => f.isDemo).map((f) => [f.name, f.id]),
  )
}
