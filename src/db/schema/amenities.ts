import { boolean, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { rooms } from './facilities'

/** Danh mục tiện ích của phòng (quản lý ở Cài đặt). Không xoá cứng: chỉ ngừng dùng. */
export const amenities = pgTable('amenities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const roomAmenities = pgTable(
  'room_amenities',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    amenityId: uuid('amenity_id')
      .notNull()
      .references(() => amenities.id),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.amenityId] })],
)
