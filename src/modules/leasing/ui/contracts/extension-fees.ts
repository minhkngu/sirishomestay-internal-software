import { addDays } from '@/domain/dates'
import type { FeeData } from './contract-edit-actions'

/** Một dòng phí trong popup Gia hạn. Số lượng không sửa ở đây (theo nguồn của phí), chỉ sửa đơn giá, bỏ, thêm. */
export type ExtensionFeeRow = {
  key: string
  leaseFeeId: string | null
  feeTypeId: string | null
  name: string
  unit: string
  isMeter: boolean
  price: string
  /** Chỉ dòng phí đồng hồ mới thêm: đồng hồ và chỉ số ban đầu. */
  meterId: string
  initialReading: string
}

export type ExtensionFeeEdit = {
  leaseFeeId?: string
  feeTypeId?: string
  unitPrice: number
  existingMeterId?: string
  initialReading?: number
}

/** Ngày hiệu lực mặc định của phụ lục gia hạn: ngày liền sau ngày hết hạn cũ. */
export const defaultExtensionDate = (endDate: string): string => addDays(endDate, 1)

export function initialFeeRows(current: FeeData['current']): ExtensionFeeRow[] {
  return current.map((f, i) => ({
    key: f.leaseFeeId ?? `fee-${i}`,
    leaseFeeId: f.leaseFeeId,
    feeTypeId: f.feeTypeId,
    name: f.name,
    unit: f.unit,
    isMeter: f.quantitySource === 'meter',
    price: String(f.unitPrice),
    meterId: '',
    initialReading: '',
  }))
}

/** Danh sách phí gửi lên server: `undefined` khi không đổi gì so với ban đầu (giữ nguyên phí hiện tại). */
export function extensionFeesPayload(
  rows: ExtensionFeeRow[],
  initial: ExtensionFeeRow[],
): ExtensionFeeEdit[] | undefined {
  const unchanged =
    rows.length === initial.length &&
    rows.every((r) => r.leaseFeeId && initial.some((i) => i.leaseFeeId === r.leaseFeeId && i.price === r.price))
  if (unchanged) return undefined
  return rows.map((r) => ({
    ...(r.leaseFeeId ? { leaseFeeId: r.leaseFeeId } : {}),
    ...(!r.leaseFeeId && r.feeTypeId ? { feeTypeId: r.feeTypeId } : {}),
    unitPrice: Number(r.price),
    ...(!r.leaseFeeId && r.isMeter
      ? {
          existingMeterId: r.meterId || undefined,
          initialReading: r.initialReading === '' ? undefined : Number(r.initialReading),
        }
      : {}),
  }))
}
