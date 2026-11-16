import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { assets } from './assets'
import { facilities, rooms } from './facilities'

export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id').notNull().references(() => facilities.id),
  roomId: uuid('room_id').references(() => rooms.id), assetId: uuid('asset_id').references(() => assets.id),
  title: text('title').notNull(), description: text('description').notNull().default(''),
  priority: text('priority').notNull().default('normal'), // low | normal | high
  status: text('status').notNull().default('new'), // new | in_progress | done | cancelled
  reportedBy: uuid('reported_by').notNull(), assigneeId: uuid('assignee_id'),
  cost: integer('cost'), chargeToTenant: boolean('charge_to_tenant').notNull().default(false), chargedOneOffId: uuid('charged_one_off_id'),
  isDemo: boolean('is_demo').notNull().default(false), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('incidents_facility_idx').on(t.facilityId), index('incidents_asset_idx').on(t.assetId)])
