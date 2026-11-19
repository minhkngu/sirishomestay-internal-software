import type { SignStatus } from '@/domain/statuses'
import { bigint, boolean, date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { leases } from './contracts'
import { rooms } from './facilities'
import { tenants } from './tenants'

export const addenda = pgTable(
  'addenda',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leaseId: uuid('lease_id')
      .notNull()
      .references(() => leases.id),
    type: text('type').notNull(), // extension | transfer | termination | occupants
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    newEndDate: date('new_end_date', { mode: 'string' }),
    oldRoomId: uuid('old_room_id').references(() => rooms.id),
    newRoomId: uuid('new_room_id').references(() => rooms.id),
    newMonthlyRent: bigint('new_monthly_rent', { mode: 'number' }),
    newDepositAmount: bigint('new_deposit_amount', { mode: 'number' }),
    oldTenantId: uuid('old_tenant_id').references(() => tenants.id),
    newTenantId: uuid('new_tenant_id').references(() => tenants.id),
    newFees: jsonb('new_fees'),
    newOccupantIds: jsonb('new_occupant_ids'),
    oldOccupantIds: jsonb('old_occupant_ids'),
    depositForfeit: jsonb('deposit_forfeit'),
    adjustmentTarget: text('adjustment_target').notNull().default('next'),
    signStatus: text('sign_status').$type<SignStatus>().notNull().default('draft'),
    signedFileId: uuid('signed_file_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('addenda_lease_idx').on(t.leaseId)],
)
