import { describe, it, expect } from 'vitest'
import { buildMonthlyInvoice } from '@/modules/leasing/domain/invoice-builder'
import type { ContractFee, Lease, Meter, MeterReading } from '@/domain/types'

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'L1',
  code: 'TD-HĐ-2026-0002',
  roomId: 'R1',
  startDate: '2026-11-15',
  endDate: '2027-11-14',
  monthlyRent: 9_000_000,
  billingCycleMonths: 1,
  depositAmount: 9_000_000,
  fees: [],
  occupantIds: ['t1'],
  ...over,
})
const electricFee: ContractFee = {
  feeTypeId: null,
  leaseFeeId: 'e1',
  name: 'Điện',
  unit: 'kWh',
  quantitySource: 'meter',
  billing: 'per_occurrence',
  quantityFrom: 'manual',
  unitPrice: 3500,
} as ContractFee
const meterE: Meter = { id: 'me', roomId: 'R1', utility: 'electric', installedOn: '2026-11-15', startReading: 0 }

describe('buildMonthlyInvoice: kỳ ký hợp đồng', () => {
  const handover: MeterReading[] = [
    { meterId: 'me', period: '2026-11', readOn: '2026-11-15', value: 1250, kind: 'handover' },
  ]
  const base = {
    facilityId: 'TD',
    period: '2026-11',
    proration: 'days_30' as const,
    meters: [meterE],
    feeMeterLinks: [{ leaseFeeId: 'e1', meterId: 'me' }],
    oneOffs: [],
    pending: [],
    addenda: [],
  }

  it('dòng điện nước kỳ ký có quantity 0, số đầu và số cuối đều là số bàn giao', () => {
    const r = buildMonthlyInvoice({ ...base, lease: lease({ fees: [electricFee] }), readings: handover })
    const line = r.lines.find((x) => x.meta?.leaseFeeId === 'e1')!
    expect(line.quantity).toBe(0)
    expect(line.meta).toMatchObject({ opening: 1250, closing: 1250 })
  })
})
