import { resolveFeePrice } from './fee-price'

/** Dòng phí ngoài hợp đồng thêm vào hoá đơn từ một loại phí trong Cài đặt: số lượng 1, giá theo toà. */
export function feeLineFromType(
  fee: { id: string; name: string; unit: string; defaultPrice: number; prices: Record<string, number> },
  facilityId: string,
) {
  return {
    type: 'one_off',
    description: fee.name,
    quantity: 1,
    unitPrice: resolveFeePrice(fee.defaultPrice, fee.prices, facilityId),
    meta: { feeTypeId: fee.id },
  }
}
