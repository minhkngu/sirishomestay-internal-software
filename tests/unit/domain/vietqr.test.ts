import { describe, expect, it } from 'vitest'
import { buildVietQrPayload, crc16ccitt, resolveBankAccount, toQrAddInfo } from '@/domain/vietqr'

const a = { bankBin: '970436', bankName: 'Vietcombank', accountNumber: '123456', accountName: 'A' }
const b = { bankBin: '970418', bankName: 'BIDV', accountNumber: '654321', accountName: 'B' }
describe('VietQR', () => {
  it('tính CRC chuẩn', () => expect(crc16ccitt('123456789')).toBe('29B1'))
  it('dựng chuỗi VietQR có số tiền và nội dung', () => {
    const p = buildVietQrPayload({
      bankBin: '970436',
      accountNumber: '0123456789',
      amount: 9_380_000,
      addInfo: 'TD-HD-202612-0001',
    })
    expect(p.startsWith('000201010212')).toBe(true)
    expect(p).toContain('38540010A00000072701240006970436011001234567890208QRIBFTTA')
    expect(p).toContain('5303704540793800005802VN')
    expect(p).toContain('62210817TD-HD-202612-0001')
    expect(p.slice(-8, -4)).toBe('6304')
    expect(p.slice(-4)).toBe(crc16ccitt(p.slice(0, -4)))
  })
  it('bỏ dấu và cắt nội dung ở 25 ký tự', () =>
    expect(toQrAddInfo('Phòng 301 – tháng 12/2026 Thảo Điền')).toBe('PHONG 301  THANG 122026 T'))
  it.each([0, -1, 1.5, NaN])('từ chối số tiền không nguyên dương %s', (amount) => {
    expect(() => buildVietQrPayload({ bankBin: '970436', accountNumber: '1', amount, addInfo: 'X' })).toThrow()
  })
  it('ưu tiên tài khoản riêng và dùng tài khoản chung khi chưa có', () => {
    expect(resolveBankAccount(a, b)).toBe(a)
    expect(resolveBankAccount(null, b)).toBe(b)
    expect(resolveBankAccount(null, null)).toBeNull()
  })
})
