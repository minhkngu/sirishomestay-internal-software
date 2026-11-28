import { describe, expect, it } from 'vitest'
import type { invoiceLines } from '@/db'
import { pdfLine } from '@/modules/leasing/server/invoices/service'

const line = (meta: unknown): typeof invoiceLines.$inferSelect =>
  ({
    type: 'fee',
    description: 'Điện',
    quantity: 50,
    unitPrice: 3500,
    amount: 175000,
    meta,
  }) as typeof invoiceLines.$inferSelect

describe('dòng hoá đơn in PDF: chỉ số điện nước', () => {
  it('nhiều đồng hồ (segments): in từng đoạn', () => {
    const l = pdfLine(
      line({
        unit: 'kWh',
        segments: [
          { start: 100, end: 120 },
          { start: 0, end: 30 },
        ],
      }),
    )
    expect(l.description).toBe('Điện (100 đến 120; 0 đến 30)')
    expect(l.unitLabel).toBe('kWh')
  })
  it('dòng kỳ ký hợp đồng hoặc đã sửa (opening, closing): in số đầu, số cuối', () => {
    expect(pdfLine(line({ unit: 'kWh', opening: 100, closing: 150 })).description).toBe('Điện (100 đến 150)')
  })
  it('không có chỉ số thì giữ nguyên tên khoản', () => {
    expect(pdfLine(line({ unit: 'người' })).description).toBe('Điện')
  })
})
