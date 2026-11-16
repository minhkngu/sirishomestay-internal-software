import { boolean, date, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { rooms } from './facilities'

export const meters = pgTable('meters', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id),
  utility: text('utility').notNull(), // electric | water
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
    readOn: date('read_on', { mode: 'string' }).notNull(),
    value: integer('value').notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('meter_readings_meter_period_unique').on(t.meterId, t.period)],
)
