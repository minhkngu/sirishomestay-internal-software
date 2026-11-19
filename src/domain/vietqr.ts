import type { BankAccount } from './types'

export function crc16ccitt(input: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function toQrAddInfo(text: string): string {
  return text
    .replace(/[đĐ]/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, '')
    .slice(0, 25)
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error('Dữ liệu mã QR quá dài')
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

export function buildVietQrPayload(input: {
  bankBin: string
  accountNumber: string
  amount: number
  addInfo: string
}): string {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('Số tiền không hợp lệ')
  if (!/^\d{6}$/.test(input.bankBin) || !/^\d{1,19}$/.test(input.accountNumber))
    throw new Error('Tài khoản không hợp lệ')
  const account = tlv('00', input.bankBin) + tlv('01', input.accountNumber)
  const merchant = tlv('00', 'A000000727') + tlv('01', account) + tlv('02', 'QRIBFTTA')
  const payload =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchant) +
    tlv('53', '704') +
    tlv('54', String(input.amount)) +
    tlv('58', 'VN') +
    tlv('62', tlv('08', toQrAddInfo(input.addInfo))) +
    '6304'
  return payload + crc16ccitt(payload)
}

export function resolveBankAccount(
  facilityAccount: BankAccount | null,
  shared: BankAccount | null,
): BankAccount | null {
  return facilityAccount ?? shared
}
