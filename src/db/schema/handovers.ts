import type { HandoverKind, HandoverStatus } from '@/domain/statuses'
import { boolean, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { assets } from './assets'
import { leases } from './contracts'
import { rooms } from './facilities'

export const handovers = pgTable('handovers', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id')
    .notNull()
    .references(() => leases.id),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id),
  kind: text('kind').$type<HandoverKind>().notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  status: text('status').$type<HandoverStatus>().notNull().default('draft'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const handoverItems = pgTable('handover_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  handoverId: uuid('handover_id')
    .notNull()
    .references(() => handovers.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id),
  condition: text('condition').notNull().default('Tốt'),
  note: text('note').notNull().default(''),
  damaged: boolean('damaged').notNull().default(false),
  missing: boolean('missing').notNull().default(false),
  penalty: integer('penalty').notNull().default(0),
  isDemo: boolean('is_demo').notNull().default(false),
})
