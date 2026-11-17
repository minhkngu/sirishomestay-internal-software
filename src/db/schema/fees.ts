import { boolean, date, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { facilities } from './facilities'

export const feeUnits = pgTable('fee_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const feeTypes = pgTable('fee_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  unitId: uuid('unit_id').notNull().references(() => feeUnits.id),
  defaultPrice: integer('default_price').notNull().default(0),
  billing: text('billing').notNull().default('monthly_fixed'), // monthly_fixed | per_occurrence
  quantityFrom: text('quantity_from').notNull().default('manual'), // manual | occupants
  isActive: boolean('is_active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const utilityRates = pgTable(
  'utility_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id').notNull().references(() => facilities.id),
    utility: text('utility').notNull(), // electric | water
    pricePerUnit: integer('price_per_unit').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('utility_rates_facility_utility_from_unique').on(t.facilityId, t.utility, t.effectiveFrom)],
)

export const feeTypePrices = pgTable('fee_type_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  feeTypeId: uuid('fee_type_id').notNull().references(() => feeTypes.id, { onDelete: 'cascade' }),
  facilityId: uuid('facility_id').notNull().references(() => facilities.id, { onDelete: 'cascade' }),
  price: integer('price').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('fee_type_prices_fee_facility_unique').on(t.feeTypeId, t.facilityId)]).enableRLS()
