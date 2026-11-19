import { sql } from 'drizzle-orm'
import { boolean, check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { facilities } from './facilities'

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  isDemo: boolean('is_demo').notNull().default(false),
})
export const stockItems = pgTable('stock_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id')
    .notNull()
    .references(() => facilities.id),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  category: text('category').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
})
export const stockLevels = pgTable(
  'stock_levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => stockItems.id),
    locationKind: text('location_kind').notNull(),
    locationId: uuid('location_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('stock_levels_location_unique').on(t.itemId, t.locationKind, t.locationId),
    check('stock_levels_nonnegative', sql`${t.quantity} >= 0`),
  ],
)
export const stockMoves = pgTable(
  'stock_moves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => stockItems.id),
    fromKind: text('from_kind'),
    fromId: uuid('from_id'),
    toKind: text('to_kind'),
    toId: uuid('to_id'),
    quantity: integer('quantity').notNull(),
    movedBy: uuid('moved_by'),
    reason: text('reason').notNull().default(''),
    movedAt: timestamp('moved_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [check('stock_moves_positive', sql`${t.quantity} > 0`)],
)
