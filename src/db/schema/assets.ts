import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { facilities } from './facilities'

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  value: integer('value').notNull().default(0),
  condition: text('condition').notNull().default('Tốt'),
  locationKind: text('location_kind').notNull(), // room | common | warehouse
  locationId: uuid('location_id').notNull(), // room: id phòng; common/warehouse: id cơ sở
  facilityId: uuid('facility_id').notNull().references(() => facilities.id),
  status: text('status').notNull().default('in_use'), // in_use | broken | disposed
  searchText: text('search_text').notNull().default(''),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const assetMoves = pgTable('asset_moves', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  fromKind: text('from_kind').notNull(),
  fromId: uuid('from_id').notNull(),
  toKind: text('to_kind').notNull(),
  toId: uuid('to_id').notNull(),
  movedAt: timestamp('moved_at', { withTimezone: true }).notNull().defaultNow(),
  movedBy: uuid('moved_by'),
  reason: text('reason').notNull().default(''),
  isDemo: boolean('is_demo').notNull().default(false),
})
