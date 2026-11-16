/** Kiểu đầu vào thuần cho lõi tính tiền — không phụ thuộc Drizzle/DB. Ngày là chuỗi yyyy-mm-dd, tiền là số nguyên VND. */
export type ISODate = string
export type Proration = 'days_30' | 'actual_days'
export type Utility = 'electric' | 'water'
export type DueRule = { kind: 'day_of_next_month'; day: number } | { kind: 'days_after_approval'; days: number }

export type ContractFee = {
  feeTypeId: string
  name: string
  unit: string
  billing: 'monthly_fixed' | 'per_occurrence'
  quantityFrom: 'manual' | 'occupants'
  quantity: number
  unitPrice: number
}

export type Lease = {
  id: string
  code: string
  roomId: string
  startDate: ISODate
  endDate: ISODate
  monthlyRent: number
  depositAmount: number
  fees: ContractFee[]
  occupantIds: string[]
  billingCycleMonths: number
  billWaterByMeter: boolean
  dueRule?: DueRule | null
  proration?: Proration | null
}

export type Addendum = {
  id: string
  leaseId: string
  type: 'extension' | 'transfer' | 'termination' | 'occupants'
  effectiveDate: ISODate
  newEndDate?: ISODate | null
  newRoomId?: string | null
  newMonthlyRent?: number | null
  newDepositAmount?: number | null
  newFees?: ContractFee[] | null
  newOccupantIds?: string[] | null
}

/** Điều khoản hiệu lực của hợp đồng tại một ngày (hợp đồng gốc + phụ lục). */
export type LeaseTerms = {
  billingCycleMonths: number
  billWaterByMeter: boolean
  roomId: string
  startDate: ISODate
  endDate: ISODate
  monthlyRent: number
  depositAmount: number
  fees: ContractFee[]
  occupantIds: string[]
}

export type Meter = {
  id: string
  roomId: string
  utility: Utility
  serial?: string | null
  installedOn: ISODate
  startReading: number
  removedOn?: ISODate | null
  finalReading?: number | null
}

export type MeterReading = { meterId: string; period: string; readOn: ISODate; value: number }
export type UtilityRate = { facilityId: string; utility: Utility; pricePerUnit: number; effectiveFrom: ISODate }

export type InvoiceLineType = 'rent' | 'fee' | 'electric' | 'water' | 'one_off' | 'penalty' | 'adjustment' | 'deposit' | 'deposit_offset' | 'refund'
export type InvoiceLineInput = {
  type: InvoiceLineType
  description: string
  quantity: number
  unitPrice: number
  amount: number
  meta?: Record<string, unknown>
}

export type Invoice = {
  id: string
  leaseId: string
  kind: 'monthly' | 'first' | 'termination' | 'manual'
  status: 'draft' | 'approved'
  periodStart: ISODate
  periodEnd: ISODate
  lines: InvoiceLineInput[]
}

export type OneOffCharge = {
  id: string
  leaseId: string
  kind: 'service' | 'penalty'
  description: string
  date: ISODate
  quantity: number
  unitPrice: number
  invoicedInId?: string | null
}

export type PendingAdjustment = {
  id: string
  leaseId: string
  description: string
  amount: number
  sourceKey: string
  invoicedInId?: string | null
}

export type DepositEntry = {
  id: string
  date: ISODate
  type: 'collect' | 'topup' | 'deduct' | 'refund' | 'forfeit'
  amount: number
  status: 'pending' | 'done'
  method?: string | null
  note?: string
}

export type ForfeitInput = { mode: 'all' | 'partial' | 'none'; amount?: number }
