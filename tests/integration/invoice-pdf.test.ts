import { describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { renderInvoicePdf, renderReceiptPdf } from '@/server/pdf'
import type { InvoicePdfData } from '@/server/pdf/types'
import { convertPdfToPng } from '@/server/convert'

const invoice: InvoicePdfData = {
  kind: 'monthly', code: 'TD-HD-202612-0001', issueDate: '2026-12-01', periodStart: '2026-12-01', periodEnd: '2026-12-31', dueDate: '2026-12-05',
  facility: { name: 'Siris Thảo Điền', address: 'Thành phố Hồ Chí Minh' }, room: '301', tenant: { name: 'Nguyễn Thị Thu', phone: '0123456789' },
  lines: [{ description: 'Tiền phòng', quantity: 1, unitLabel: 'tháng', unitPrice: 9380000, amount: 9380000 }], total: 9380000, paid: 0,
  bank: { bankBin: '970436', bankName: 'Vietcombank', accountNumber: '0123456789', accountName: 'NGUYEN VAN A' },
}
async function textOf(pdf: Uint8Array) {
  const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise
  const content = await (await doc.getPage(1)).getTextContent()
  return content.items.map((item) => 'str' in item ? item.str : '').join(' ')
}
describe('PDF hoá đơn và phiếu thu', () => {
  it('hoá đơn tháng giữ dấu, tiêu đề, tổng, số bằng chữ và thanh toán', async () => {
    const text = await textOf(await renderInvoicePdf(invoice))
    for (const value of ['Hoá đơn tháng 12/2026', '9.380.000', 'Chín triệu ba trăm tám mươi nghìn đồng', 'Quét mã để chuyển khoản', 'TD-HD-202612-0001', 'Nguyễn Thị Thu']) expect(text).toContain(value)
  })
  it('trả một phần: QR dùng số còn lại', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL')
    try { await renderInvoicePdf({ ...invoice, paid: 4000000 }); expect(spy.mock.calls[0][0]).toContain('54075380000') } finally { spy.mockRestore() }
  })
  it('trả đủ không có QR', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL')
    try { expect(await textOf(await renderInvoicePdf({ ...invoice, paid: invoice.total }))).toContain('Đã thanh toán'); expect(spy).not.toHaveBeenCalled() } finally { spy.mockRestore() }
  })
  it('không có tài khoản vẫn xuất PDF', async () => {
    const text = await textOf(await renderInvoicePdf({ ...invoice, bank: null }))
    expect(text).toContain('Hoá đơn tháng 12/2026'); expect(text).not.toContain('Quét mã để chuyển khoản')
  })
  it('thanh lý dương đầy đủ nội dung và có QR', async () => {
    const text = await textOf(await renderInvoicePdf({ ...invoice, kind: 'termination' }))
    for (const value of ['Hoá đơn thanh lý', 'Tiền phòng', '9.380.000', 'Quét mã để chuyển khoản', 'Vietcombank']) expect(text).toContain(value)
  })
  it('thanh lý âm có khoản hoàn và thông tin tài khoản, không QR', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL')
    try {
      const text = await textOf(await renderInvoicePdf({ ...invoice, kind: 'termination', total: -1200000 }))
      for (const value of ['Hoá đơn thanh lý', 'Tiền phòng', '1.200.000', 'Số tiền hoàn cho khách:', 'Vietcombank']) expect(text).toContain(value)
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
  it('tên Nhật Hàn không làm hỏng PDF', async () => expect(new TextDecoder().decode((await renderInvoicePdf({ ...invoice, tenant: { name: '田中 由紀 / 김민지', phone: null } })).slice(0, 4))).toBe('%PDF'))
  it('phiếu thu có mã phiếu, số tiền và hình thức', async () => {
    const text = await textOf(await renderReceiptPdf({ code: 'PT-01', invoiceCode: invoice.code, paidOn: invoice.issueDate, amount: 123000, method: 'Tiền mặt', receivedBy: 'Nguyễn An', facility: invoice.facility, room: invoice.room, tenant: invoice.tenant }))
    for (const value of ['PT-01', '123.000', 'Tiền mặt']) expect(text).toContain(value)
  })
  it('PDF đổi được sang PNG', async () => {
    const pdf = await renderInvoicePdf(invoice)
    expect((await convertPdfToPng(new Blob([new Uint8Array(pdf)]))).type).toBe('image/png')
  })
})
