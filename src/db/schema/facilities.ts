// Kiểu dữ liệu dùng chung, không tạo phụ thuộc lúc chạy.
import type { BankAccount } from '@/domain/types'
import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const facilities = pgTable('facilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  note: text('note').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  expectedInvoiceDay: integer('expected_invoice_day').notNull().default(5),
  bankAccount: jsonb('bank_account').$type<BankAccount | null>(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id),
    code: text('code').notNull(),
    floor: text('floor'),
    roomType: text('room_type'),
    areaM2: numeric('area_m2'),
    listPrice: integer('list_price'),
    capacity: integer('capacity'),
    beds: integer('beds'),
    note: text('note').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('rooms_facility_code_unique').on(t.facilityId, t.code)],
)
