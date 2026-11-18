import { sql } from 'drizzle-orm'
import { boolean, date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { rooms } from './facilities'
import { feeTypes } from './fees'
import { leaseFeeSnapshots } from './contracts'

export const meters = pgTable('meters', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id),
  utility: text('utility').notNull(),
  feeTypeId: uuid('fee_type_id').references(() => feeTypes.id), // electric | water
  serial: text('serial'),
  installedOn: date('installed_on', { mode: 'string' }).notNull(),
  startReading: integer('start_reading').notNull().default(0),
  removedOn: date('removed_on', { mode: 'string' }),
  finalReading: integer('final_reading'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const meterReadings = pgTable(
  'meter_readings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meterId: uuid('meter_id').notNull().references(() => meters.id, { onDelete: 'cascade' }),
    period: text('period').notNull(), // YYYY-MM
    // monthly: chỉ số ghi hằng tháng (duy nhất theo kỳ); handover: chỉ số chốt giữa tháng khi bàn giao/chuyển phòng (duy nhất theo ngày)
    kind: text('kind').notNull().default('monthly'),
    readOn: date('read_on', { mode: 'string' }).notNull(),
    value: integer('value').notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meter_readings_monthly_unique').on(t.meterId, t.period).where(sql`${t.kind} = 'monthly'`),
    uniqueIndex('meter_readings_handover_unique').on(t.meterId, t.readOn).where(sql`${t.kind} = 'handover'`),
  ],
)

export const leaseFeeMeters = pgTable('lease_fee_meters', {
  leaseFeeId: uuid('lease_fee_id').primaryKey().references(() => leaseFeeSnapshots.id, { onDelete: 'cascade' }),
  meterId: uuid('meter_id').notNull().references(() => meters.id),
}).enableRLS()
