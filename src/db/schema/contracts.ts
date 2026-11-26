import type {
  CancelOutcome,
  DepositContractStatus,
  DepositEntryStatus,
  DepositEntryType,
  LeaseStatus,
  SignStatus,
} from '@/domain/statuses'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { rooms } from './facilities'
import { feeTypes } from './fees'
import { tenants } from './tenants'
import { docTemplates, invoiceTemplates } from './templates'

export type AgreedFee = {
  feeTypeId: string | null
  name: string
  unit: string
  quantitySource: 'occupants' | 'room' | 'meter' | 'period_input'
  unitPrice: number
  quantity: number
  legacyFixed?: boolean
}

export const depositContracts = pgTable(
  'deposit_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    depositAmount: integer('deposit_amount').notNull(),
    agreedDeposit: integer('agreed_deposit'),
    agreedRent: integer('agreed_rent').notNull(),
    agreedFees: jsonb('agreed_fees').$type<AgreedFee[]>(),
    expectedMoveIn: date('expected_move_in', { mode: 'string' }).notNull(),
    status: text('status').$type<DepositContractStatus>().notNull().default('pending'),
    cancelOutcome: text('cancel_outcome').$type<CancelOutcome>(),
    signStatus: text('sign_status').$type<SignStatus>().notNull().default('draft'),
    signedFileId: uuid('signed_file_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('deposit_contracts_one_pending_per_room')
      .on(t.roomId)
      .where(sql`${t.status} = 'pending'`),
  ],
)

export const leases = pgTable(
  'leases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    monthlyRent: integer('monthly_rent').notNull(),
    legacyCode: text('legacy_code').unique(),
    billingCycleMonths: integer('billing_cycle_months').notNull().default(1),
    depositAmount: integer('deposit_amount').notNull(),
    note: text('note').notNull().default(''),
    contractTemplateId: uuid('contract_template_id').references(() => docTemplates.id),
    invoiceTemplateId: uuid('invoice_template_id').references(() => invoiceTemplates.id),
    dueRule: jsonb('due_rule'),
    proration: text('proration'),
    fromDepositContractId: uuid('from_deposit_contract_id').references(() => depositContracts.id),
    status: text('status').$type<LeaseStatus>().notNull().default('active'),
    signStatus: text('sign_status').$type<SignStatus>().notNull().default('draft'),
    signedFileId: uuid('signed_file_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('leases_one_active_per_room')
      .on(t.roomId)
      .where(sql`${t.status} = 'active'`),
    check('leases_billing_cycle_range', sql`${t.billingCycleMonths} between 1 and 12`),
  ],
)

export const leaseOccupants = pgTable(
  'lease_occupants',
  {
    leaseId: uuid('lease_id')
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
  },
  (t) => [primaryKey({ columns: [t.leaseId, t.tenantId] })],
)

export const leaseFeeSnapshots = pgTable('lease_fee_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id')
    .notNull()
    .references(() => leases.id, { onDelete: 'cascade' }),
  feeTypeId: uuid('fee_type_id').references(() => feeTypes.id),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  quantitySource: text('quantity_source').notNull(),
  quantity: integer('quantity').notNull().default(1),
  billing: text('billing').notNull().default('monthly_fixed'),
  unitPrice: integer('unit_price').notNull(),
}).enableRLS()

export const depositEntries = pgTable('deposit_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').references(() => leases.id),
  depositContractId: uuid('deposit_contract_id').references(() => depositContracts.id),
  date: date('date', { mode: 'string' }).notNull(),
  type: text('type').$type<DepositEntryType>().notNull(),
  amount: integer('amount').notNull(),
  status: text('status').$type<DepositEntryStatus>().notNull().default('pending'),
  method: text('method'),
  note: text('note').notNull().default(''),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contractVersions = pgTable(
  'contract_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id').notNull(),
    kind: text('kind').notNull(),
    operation: text('operation').notNull(),
    sequence: integer('sequence').notNull(),
    actorId: uuid('actor_id').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('contract_versions_kind_contract_sequence_idx').on(t.kind, t.contractId, t.sequence)],
).enableRLS()
