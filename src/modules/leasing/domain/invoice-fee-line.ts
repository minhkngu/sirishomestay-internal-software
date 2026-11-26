import { resolveFeePrice } from './fee-price'

/** Dòng phí ngoài hợp đồng thêm vào hoá đơn từ một loại phí trong Cài đặt: giá theo toà; số lượng 1, riêng phí theo số người ở lấy số người ở của hợp đồng. */
export function feeLineFromType(
  fee: {
    id: string
    name: string
    unit: string
    defaultPrice: number
    prices: Record<string, number>
    quantityFrom?: string
  },
  facilityId: string,
  occupantsCount?: number,
) {
  return {
    type: 'one_off',
    description: fee.name,
    quantity: fee.quantityFrom === 'occupants' && occupantsCount ? occupantsCount : 1,
    unitPrice: resolveFeePrice(fee.defaultPrice, fee.prices, facilityId),
    meta: { feeTypeId: fee.id },
  }
}
