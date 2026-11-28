import { describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { renderInvoicePdf, renderReceiptPdf } from '@/modules/documents/server/pdf'
import type { InvoicePdfData } from '@/modules/documents/server/pdf/types'
import { convertPdfToPng } from '@/modules/documents/server/convert'
import { defaultInvoiceTemplate } from '@/modules/documents/domain/invoice-template'
import { createCanvas } from '@napi-rs/canvas'

const invoice: InvoicePdfData = {
  kind: 'monthly',
  code: 'TD-HD-202612-0001',
  issueDate: '2026-12-01',
  periodStart: '2026-12-01',
  periodEnd: '2026-12-31',
  dueDate: '2026-12-05',
  facility: { name: 'Siris Thảo Điền', address: 'Thành phố Hồ Chí Minh' },
  room: '301',
  tenant: { name: 'Nguyễn Thị Thu', phone: '0123456789' },
  lines: [{ description: 'Tiền phòng', quantity: 1, unitLabel: 'tháng', unitPrice: 9380000, amount: 9380000 }],
  total: 9380000,
  paid: 0,
  bank: { bankBin: '970436', bankName: 'Vietcombank', accountNumber: '0123456789', accountName: 'NGUYEN VAN A' },
}
async function textOf(pdf: Uint8Array) {
  const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise
  const content = await (await doc.getPage(1)).getTextContent()
  return content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
}
describe('PDF hoá đơn và phiếu thu', () => {
  it('nội dung, thứ tự và các phần ẩn theo mẫu hóa đơn', async () => {
    const config = {
      ...defaultInvoiceTemplate,
      brand: 'THUONG HIEU MOI',
      title: 'PHIEU THU TIEN',
      footer: 'CAM ON QUY KHACH',
      sections: [
        'header',
        'charges',
        'total',
        'customer',
        'payment',
        'footer',
      ] as typeof defaultInvoiceTemplate.sections,
      hidden: ['payment'] as typeof defaultInvoiceTemplate.hidden,
    }
    const text = await textOf(await renderInvoicePdf(invoice, config))
    expect(text).toContain('THUONG HIEU MOI')
    expect(text).toContain('PHIEU THU TIEN')
    expect(text).toContain('CAM ON QUY KHACH')
    expect(text).not.toContain('Quét để chuyển khoản')
    expect(text.indexOf('Tiền phòng')).toBeLessThan(text.indexOf('Khách thuê'))
  })
  it('đưa logo PNG vào bản PDF', async () => {
    const canvas = createCanvas(4, 4)
    canvas.getContext('2d').fillRect(0, 0, 4, 4)
    const logo = `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`
    const pdf = await renderInvoicePdf({ ...invoice, bank: null }, { ...defaultInvoiceTemplate, logo })
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe('%PDF')
    expect(await textOf(pdf)).toContain('SIRIS')
    const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise
    expect((await (await doc.getPage(1)).getOperatorList()).fnArray).toContain(OPS.paintImageXObject)
  })
  it('mẫu mặc định giữ số trang trên mọi trang hóa đơn dài', async () => {
    const lines = Array.from({ length: 100 }, (_, index) => ({
      ...invoice.lines[0],
      description: `Khoản ${index + 1}`,
    }))
    const pdf = await getDocument({
      data: new Uint8Array(await renderInvoicePdf({ ...invoice, lines })),
      useSystemFonts: true,
    }).promise
    expect(pdf.numPages).toBeGreaterThan(1)
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent()
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
      expect(text).toContain(`${pageNumber}/${pdf.numPages}`)
      expect(text).toContain('Siris Thảo Điền')
    }
  })
  it('hoá đơn tháng giữ dấu, tiêu đề, tổng, số bằng chữ và thanh toán', async () => {
    const text = await textOf(await renderInvoicePdf(invoice))
    for (const value of [
      'Hoá đơn tháng 12/2026',
      '9.380.000',
      'Chín triệu ba trăm tám mươi nghìn đồng',
      'Quét để chuyển khoản',
      'TD-HD-202612-0001',
      'Nguyễn Thị Thu',
    ])
      expect(text).toContain(value)
  })
  it('trả một phần: QR dùng số còn lại', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL')
    try {
      await renderInvoicePdf({ ...invoice, paid: 4000000 })
      expect(spy.mock.calls[0][0]).toContain('54075380000')
    } finally {
      spy.mockRestore()
    }
  })
  it('trả đủ không có QR', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL')
    try {
      expect(await textOf(await renderInvoicePdf({ ...invoice, paid: invoice.total }))).toContain('Đã thanh toán')
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
  it('không có tài khoản vẫn xuất PDF', async () => {
    const text = await textOf(await renderInvoicePdf({ ...invoice, bank: null }))
    expect(text).toContain('Hoá đơn tháng 12/2026')
    expect(text).not.toContain('Quét để chuyển khoản')
  })
  it('thanh lý dương đầy đủ nội dung và có QR', async () => {
    const text = await textOf(await renderInvoicePdf({ ...invoice, kind: 'termination' }))
    for (const value of ['Hoá đơn thanh lý', 'Tiền phòng', '9.380.000', 'Quét để chuyển khoản', 'Vietcombank'])
      expect(text).toContain(value)
  })
  it('thanh lý âm có khoản hoàn và thông tin tài khoản, không QR', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL')
    try {
      const text = await textOf(await renderInvoicePdf({ ...invoice, kind: 'termination', total: -1200000 }))
      for (const value of ['Hoá đơn thanh lý', 'Tiền phòng', '1.200.000', 'Số tiền hoàn cho khách:', 'Vietcombank'])
        expect(text).toContain(value)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
  it('tên Nhật Hàn không làm hỏng PDF', async () =>
    expect(
      new TextDecoder().decode(
        (await renderInvoicePdf({ ...invoice, tenant: { name: '田中 由紀 / 김민지', phone: null } })).slice(0, 4),
      ),
    ).toBe('%PDF'))
  it('phiếu thu có mã phiếu, số tiền và hình thức', async () => {
    const text = await textOf(
      await renderReceiptPdf({
        code: 'PT-01',
        invoiceCode: invoice.code,
        paidOn: invoice.issueDate,
        amount: 123000,
        method: 'Tiền mặt',
        receivedBy: 'Nguyễn An',
        facility: invoice.facility,
        room: invoice.room,
        tenant: invoice.tenant,
      }),
    )
    for (const value of ['PT-01', '123.000', 'Tiền mặt']) expect(text).toContain(value)
  })
  it('PDF đổi được sang PNG', async () => {
    const pdf = await renderInvoicePdf(invoice)
    expect((await convertPdfToPng(new Blob([new Uint8Array(pdf)]))).type).toBe('image/png')
  })
})
