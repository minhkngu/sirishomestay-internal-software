import { bigint, boolean, date, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { leases } from './contracts'
import { facilities } from './facilities'

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(), code: text('code').notNull().unique(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id), facilityId: uuid('facility_id').notNull().references(() => facilities.id),
  kind: text('kind').notNull(), periodStart: date('period_start', { mode: 'string' }).notNull(), periodEnd: date('period_end', { mode: 'string' }).notNull(),
  coefficient: numeric('coefficient', { mode: 'number' }), fullMonth: boolean('full_month').notNull().default(false), proration: text('proration'),
  issueDate: date('issue_date', { mode: 'string' }).notNull(), dueDate: date('due_date', { mode: 'string' }), status: text('status').notNull().default('draft'), source: text('source'), note: text('note').notNull().default(''),
  isDemo: boolean('is_demo').notNull().default(false), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('invoices_lease_idx').on(t.leaseId), index('invoices_facility_idx').on(t.facilityId)])
export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(), invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }), type: text('type').notNull(), description: text('description').notNull(),
  quantity: numeric('quantity', { mode: 'number' }).notNull(), unitPrice: bigint('unit_price', { mode: 'number' }).notNull(), amount: bigint('amount', { mode: 'number' }).notNull(), meta: jsonb('meta'),
  isDemo: boolean('is_demo').notNull().default(false), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('invoice_lines_invoice_idx').on(t.invoiceId)])
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(), invoiceId: uuid('invoice_id').notNull().references(() => invoices.id), paidOn: date('paid_on', { mode: 'string' }).notNull(), amount: bigint('amount', { mode: 'number' }).notNull(),
  method: text('method').notNull(), receivedBy: uuid('received_by').notNull(), note: text('note').notNull().default(''), isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('payments_invoice_idx').on(t.invoiceId)])
