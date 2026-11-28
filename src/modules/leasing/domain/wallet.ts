import type { WalletEntryKind } from '@/domain/statuses'

/** Quy tắc thuần của ví khách (số tiền VND nguyên). */

/** Chia số tiền khách đưa: phần gạch hoá đơn (tối đa bằng nợ) và phần dư vào ví. */
export function splitReceipt(received: number, owed: number): { toInvoices: number; toWallet: number } {
  const toInvoices = Math.max(0, Math.min(received, owed))
  return { toInvoices, toWallet: Math.max(0, received - toInvoices) }
}

/** Số tiền ví được dùng: không vượt số dư ví, không vượt phần còn nợ, không âm. */
export function clampWalletUse(requested: number, balance: number, owed: number): number {
  return Math.max(0, Math.min(requested, balance, owed))
}

/** Một dòng lịch sử ví để hiển thị: số tiền dương là cộng vào ví, âm là dùng hoặc trả ra. */
export type WalletEntryView = {
  id: string
  date: string
  kind: WalletEntryKind
  amount: number
  facilityCode: string
  invoice?: { id: string; code: string }
  lease?: { id: string; code: string }
  note: string
}
