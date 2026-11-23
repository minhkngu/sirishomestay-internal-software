import { bigint, boolean, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { facilities, rooms } from './facilities'

/** Khoản chi của cơ sở: sửa chữa, điện nước, lương, khác. */
export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id').notNull().references(() => facilities.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  category: text('category').notNull(), // repair | utility | salary | other
  date: date('date', { mode: 'string' }).notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  method: text('method').notNull(), // cash | transfer | other
  payee: text('payee').notNull().default(''),
  note: text('note').notNull().default(''),
  createdBy: uuid('created_by').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('expenses_facility_idx').on(t.facilityId), index('expenses_date_idx').on(t.date)])
