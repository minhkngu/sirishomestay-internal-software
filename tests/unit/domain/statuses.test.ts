import { describe, expectTypeOf, it } from 'vitest'
import { addenda, assets, depositContracts, depositEntries, handovers, incidents, invoices, leases } from '@/db'
import type {
  AssetStatus,
  CancelOutcome,
  DepositContractStatus,
  DepositEntryStatus,
  DepositEntryType,
  HandoverKind,
  IncidentStatus,
  InvoiceStatus,
  LeaseStatus,
  SignStatus,
} from '@/domain/statuses'

describe('kiểu cột trạng thái', () => {
  it('cột trạng thái trong schema mang kiểu hợp', () => {
    expectTypeOf<typeof leases.$inferSelect.status>().toEqualTypeOf<LeaseStatus>()
    expectTypeOf<typeof leases.$inferSelect.signStatus>().toEqualTypeOf<SignStatus>()
    expectTypeOf<typeof depositContracts.$inferSelect.status>().toEqualTypeOf<DepositContractStatus>()
    expectTypeOf<typeof depositContracts.$inferSelect.signStatus>().toEqualTypeOf<SignStatus>()
    expectTypeOf<typeof depositContracts.$inferSelect.cancelOutcome>().toEqualTypeOf<CancelOutcome | null>()
    expectTypeOf<typeof depositEntries.$inferSelect.type>().toEqualTypeOf<DepositEntryType>()
    expectTypeOf<typeof depositEntries.$inferSelect.status>().toEqualTypeOf<DepositEntryStatus>()
    expectTypeOf<typeof addenda.$inferSelect.signStatus>().toEqualTypeOf<SignStatus>()
    expectTypeOf<typeof assets.$inferSelect.status>().toEqualTypeOf<AssetStatus>()
    expectTypeOf<typeof incidents.$inferSelect.status>().toEqualTypeOf<IncidentStatus>()
    expectTypeOf<typeof handovers.$inferSelect.kind>().toEqualTypeOf<HandoverKind>()
    expectTypeOf<typeof invoices.$inferSelect.status>().toEqualTypeOf<InvoiceStatus>()
  })
})
