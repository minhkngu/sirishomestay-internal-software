type TransferableLine = { amount: number; unitPrice: number; quantity: number; meta: unknown }

const isTransfer = (l: TransferableLine) => (l.meta as { transfer?: unknown } | null)?.transfer === true

/**
 * Hoá đơn thanh lý chuyển phòng: dòng "Chuyển sang hợp đồng mới" (meta.transfer) luôn bằng −(tổng các dòng khác)
 * để hoá đơn về 0. Tổng các dòng khác bằng 0 thì bỏ dòng chuyển. Không có dòng chuyển thì giữ nguyên.
 */
export function rebalanceTransferLine<T extends TransferableLine>(lines: T[]): T[] {
  const out = lines.find(isTransfer)
  if (!out) return lines
  const others = lines.filter((l) => l !== out).reduce((n, l) => n + l.amount, 0)
  if (others === 0) return lines.filter((l) => l !== out)
  return lines.map((l) => (l === out ? { ...l, quantity: 1, unitPrice: -others, amount: -others } : l))
}
