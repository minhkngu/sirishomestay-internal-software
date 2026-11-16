import { sql } from 'drizzle-orm'
import { boolean, check, date, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { rooms } from './facilities'
import { feeTypes } from './fees'
import { tenants } from './tenants'

export const depositContracts = pgTable(
  'deposit_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id').notNull().references(() => rooms.id),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    depositAmount: integer('deposit_amount').notNull(),
    agreedRent: integer('agreed_rent').notNull(),
    expectedMoveIn: date('expected_move_in', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('pending'), // pending | converted | cancelled
    cancelOutcome: text('cancel_outcome'), // forfeit | refund
    signStatus: text('sign_status').notNull().default('draft'), // draft | exported | signed
    signedFileId: uuid('signed_file_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('deposit_contracts_one_pending_per_room').on(t.roomId).where(sql`${t.status} = 'pending'`)],
)

export const leases = pgTable(
  'leases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    roomId: uuid('room_id').notNull().references(() => rooms.id),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    monthlyRent: integer('monthly_rent').notNull(),
    legacyCode: text('legacy_code').unique(),
    billingCycleMonths: integer('billing_cycle_months').notNull().default(1),
    billWaterByMeter: boolean('bill_water_by_meter').notNull().default(true),
    depositAmount: integer('deposit_amount').notNull(),
    dueRule: jsonb('due_rule'),
    proration: text('proration'),
    fromDepositContractId: uuid('from_deposit_contract_id').references(() => depositContracts.id),
    status: text('status').notNull().default('active'), // active | ended
    signStatus: text('sign_status').notNull().default('draft'),
    signedFileId: uuid('signed_file_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('leases_one_active_per_room').on(t.roomId).where(sql`${t.status} = 'active'`), check('leases_billing_cycle_range', sql`${t.billingCycleMonths} between 1 and 12`)],
)

export const leaseOccupants = pgTable(
  'lease_occupants',
  {
    leaseId: uuid('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  },
  (t) => [primaryKey({ columns: [t.leaseId, t.tenantId] })],
)

export const leaseFees = pgTable('lease_fees', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  feeTypeId: uuid('fee_type_id').notNull().references(() => feeTypes.id),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: integer('unit_price').notNull(),
})

export const depositEntries = pgTable('deposit_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').references(() => leases.id),
  depositContractId: uuid('deposit_contract_id').references(() => depositContracts.id),
  date: date('date', { mode: 'string' }).notNull(),
  type: text('type').notNull(), // collect | topup | deduct | refund | forfeit
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('pending'), // pending | done
  method: text('method'),
  note: text('note').notNull().default(''),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
