import { sql } from 'drizzle-orm'
import { rooms } from '@/db'
import type { DB } from '@/db/client'
import { todayVN } from '@/domain/dates'
import { createDefaultMeters } from '@/server/meters/service'

/** Mọi bảng dữ liệu hợp đồng và đồng hồ; TRUNCATE ... CASCADE xoá thêm các bảng phụ thuộc vào chúng. */
const TABLES = [
  'meter_readings', 'lease_fee_meters', 'meters', 'lease_fee_snapshots', 'invoice_lines', 'invoice_fee_quantities', 'payments', 'invoices',
  'pending_adjustments', 'one_off_charges', 'addenda', 'handover_items', 'handovers', 'deposit_entries', 'deposit_contracts', 'lease_occupants',
  'contract_versions', 'leases',
]

/**
 * Xoá dữ liệu hợp đồng, hoá đơn, đồng hồ và chỉ số cũ rồi tạo lại hai đồng hồ mặc định (điện, nước, chỉ số đầu 0) cho mọi phòng.
 * Giữ cơ sở, phòng, khách thuê, tài sản, cài đặt, loại phí, mẫu giấy tờ và người dùng. Không hoàn tác được.
 */
export async function resetContractAndMeterData(db: DB): Promise<{ rooms: number }> {
  await db.execute(sql.raw(`truncate ${TABLES.map((t) => `"${t}"`).join(', ')} restart identity cascade`))
  const roomIds = (await db.select({ id: rooms.id }).from(rooms)).map((r) => r.id)
  await createDefaultMeters(db, roomIds, todayVN())
  return { rooms: roomIds.length }
}
