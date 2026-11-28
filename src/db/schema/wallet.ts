import { bigint, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { WalletEntryKind } from '@/domain/statuses'
import { leases } from './contracts'
import { facilities } from './facilities'
import { invoices, payments } from './invoices'
import { tenants } from './tenants'

/** Sổ ví khách theo người thuê (dùng ở mọi cơ sở; `facility_id` là cơ sở phát sinh): amount dương là cộng (thu vượt), âm là dùng. Số dư là tổng. */
export const tenantWalletEntries = pgTable(
  'tenant_wallet_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    kind: text('kind').$type<WalletEntryKind>().notNull(),
    leaseId: uuid('lease_id').references(() => leases.id, { onDelete: 'set null' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note').notNull().default(''),
    sourceKey: text('source_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tenant_wallet_entries_tenant_idx').on(t.tenantId)],
)
