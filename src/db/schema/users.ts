import { sql } from 'drizzle-orm'
import { boolean, check, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { facilities } from './facilities'

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey(), // = id người dùng Supabase Auth
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userFacilities = pgTable(
  'user_facilities',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.facilityId] })],
)

export const userPermissions = pgTable(
  'user_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.permission] }),
    check(
      'user_permissions_permission_check',
      sql`${t.permission} in ('tenants_contracts','delete_contracts','billing','meters','assets','incidents','settings')`,
    ),
  ],
)
