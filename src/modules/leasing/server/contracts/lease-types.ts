import type { Lease } from './shared'
import type { InvoiceLineInput, Proration } from '@/domain/types'

export type LeaseFeeInput = {
  feeTypeId: string | null
  name: string
  unit: string
  quantitySource: 'occupants' | 'room' | 'meter' | 'period_input'
  unitPrice: number
  quantity?: number
  initialReading?: number
  existingMeterId?: string
}
export type LegacyFeeInput = { feeTypeId: string; quantity: number; unitPrice: number }
export type LeaseInput = {
  roomId: string
  tenantId: string
  occupantIds?: string[]
  startDate: string
  endDate: string
  monthlyRent: number
  depositAmount: number
  receivedDeposit?: number
  note?: string
  contractTemplateId?: string | null
  invoiceTemplateId?: string | null
  handover?: {
    expectedRoomAssetIds: string[]
    addAssetIds: string[]
    expectedAddedLocations?: Array<{ assetId: string; kind: string; id: string }>
    newAssets: Array<{ code: string; name: string; model: string; category: string; value: number; condition: string }>
    remove: Array<
      | { assetId: string; action: 'dispose' }
      | { assetId: string; action: 'move'; to: { kind: 'warehouse' | 'room'; id: string } }
    >
    conditions?: Array<{ assetCode: string; condition: string }>
  }
  feeModel?: 'legacy' | 'snapshot'
  fees?: LegacyFeeInput[] | LeaseFeeInput[]
  dueRule?: unknown
  proration?: Proration | null
  billingCycleMonths?: number
  billWaterByMeter?: boolean
}

export type LeaseCreated = {
  lease: Lease
  firstInvoiceLines: InvoiceLineInput[]
  warnings: string[]
  handoverItems: Array<{ assetCode: string; itemId: string }>
}

/** Mẫu để nguyên (undefined) thì giữ như cũ; null là về mặc định. */
export type LeaseEditInput = Pick<
  LeaseInput,
  | 'roomId'
  | 'tenantId'
  | 'startDate'
  | 'endDate'
  | 'monthlyRent'
  | 'depositAmount'
  | 'note'
  | 'contractTemplateId'
  | 'invoiceTemplateId'
> & {
  /** Danh sách phí dịch vụ sau khi sửa : dòng có leaseFeeId là phí cũ (đổi đơn giá), dòng không có là phí thêm từ loại phí đã cài. Bỏ trống thì giữ nguyên. */
  fees?: {
    leaseFeeId?: string
    feeTypeId?: string | null
    unitPrice: number
    /** Phí theo đồng hồ thêm mới: chỉ số ban đầu và đồng hồ có sẵn (bỏ trống thì tạo đồng hồ mới). */ initialReading?: number
    existingMeterId?: string
  }[]
}
