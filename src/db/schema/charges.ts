import { boolean, date, bigint, numeric, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core'
import { leases } from './contracts'
import { feeTypes } from './fees'

export const oneOffCharges = pgTable('one_off_charges', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id),
  feeTypeId: uuid('fee_type_id').references(() => feeTypes.id),
  kind: text('kind').notNull(),
  description: text('description').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  quantity: numeric('quantity', { mode: 'number' }).notNull(),
  unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  invoiceId: uuid('invoice_id'),
  source: text('source'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('one_off_charges_lease_idx').on(t.leaseId)])

export const pendingAdjustments = pgTable('pending_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id),
  description: text('description').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  sourceKey: text('source_key').notNull().unique(),
  invoiceId: uuid('invoice_id'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('pending_adjustments_lease_idx').on(t.leaseId)])
