import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { invoiceTemplates } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { renderTemplate } from '@/domain/doc-template'
import { DEFAULT_INVOICE_TEMPLATES } from '@/domain/invoice-template-html'
import { sampleDataFor } from '@/domain/template-fields'
import { restoreDefaultInvoiceTemplates } from '@/server/invoice-templates/defaults'
import {
  createInvoiceTemplate,
  previewInvoiceTemplateById,
  previewInvoiceTemplateHtml,
  resolveInvoiceTemplate,
  setDefaultInvoiceTemplate,
  updateInvoiceTemplate,
} from '@/server/invoice-templates/service'
import { createTestDb } from '../helpers/db'

const admin: AccessContext = {
  userId: crypto.randomUUID(),
  email: 'a@x.com',
  fullName: 'A',
  isAdmin: true,
  facilityIds: new Set(),
  permissions: new Set(['settings']),
}
async function textOf(bytes: Uint8Array) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
  let out = ''
  for (let i = 1; i <= pdf.numPages; i++)
    out += (await (await pdf.getPage(i)).getTextContent()).items.map((x) => ('str' in x ? x.str : '')).join(' ')
  return out
}

describe('mẫu hoá đơn HTML', () => {
  let db: DB
  beforeEach(async () => {
    db = await createTestDb()
  })

  it.each(['formal', 'modern'] as const)('mẫu mặc định kiểu %s điền đủ dữ liệu mẫu, không thiếu chỗ điền', (style) => {
    const { warnings, doc } = renderTemplate(
      DEFAULT_INVOICE_TEMPLATES[style].html,
      sampleDataFor('invoice_termination'),
    )
    expect(warnings).toEqual([])
    expect(doc.some((b) => b.type === 'qr')).toBe(true)
  })

  it('khôi phục mẫu mặc định tạo hai mẫu còn thiếu, không ghi đè mẫu đã sửa, không đổi mẫu mặc định', async () => {
    const defaultBefore = (await db.select().from(invoiceTemplates)).filter((t) => t.isDefault).map((t) => t.id)
    expect(await restoreDefaultInvoiceTemplates(db, admin)).toBe(2)
    const [formal] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.name, 'Hoá đơn (Trang trọng)'))
    await db.update(invoiceTemplates).set({ body: '<p>Đã sửa</p>' }).where(eq(invoiceTemplates.id, formal.id))
    expect(await restoreDefaultInvoiceTemplates(db, admin)).toBe(0)
    const [after] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, formal.id))
    expect(after.body).toBe('<p>Đã sửa</p>')
    expect((await db.select().from(invoiceTemplates)).filter((t) => t.isDefault).map((t) => t.id)).toEqual(
      defaultBefore,
    )
  })

  it('tạo mẫu có nội dung, đặt mặc định thì hoá đơn dùng mẫu HTML; mẫu cũ không có nội dung vẫn dùng bố cục cũ', async () => {
    const legacy = await createInvoiceTemplate(db, admin, { name: 'Cũ', config: undefined })
    expect(legacy.body).toBeNull()
    const html = await createInvoiceTemplate(db, admin, { name: 'Mới', body: '<p>[ma_hoa_don]</p>', style: 'modern' })
    expect(html).toMatchObject({ body: '<p>[ma_hoa_don]</p>', style: 'modern' })
    await updateInvoiceTemplate(db, admin, html.id, { name: 'Mới', body: '<p>Sửa [ma_hoa_don]</p>', style: 'formal' })
    await setDefaultInvoiceTemplate(db, admin, html.id)
    const [row] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, html.id))
    expect(row).toMatchObject({ body: '<p>Sửa [ma_hoa_don]</p>', style: 'formal' })
  })

  it('từ chối nội dung rỗng và kiểu lạ', async () => {
    await expect(createInvoiceTemplate(db, admin, { name: 'X', body: '  ' })).rejects.toThrow('Nhập nội dung mẫu')
    await expect(
      createInvoiceTemplate(db, admin, { name: 'X', body: '<p>a</p>', style: 'lạ' as never }),
    ).rejects.toThrow('Kiểu trình bày không hợp lệ')
  })

  it('xem trước mẫu HTML ra PDF có dữ liệu mẫu và tên ngân hàng', async () => {
    const text = await textOf(
      await previewInvoiceTemplateHtml(admin, { body: DEFAULT_INVOICE_TEMPLATES.formal.html, style: 'formal' }),
    )
    expect(text).toContain('HOÁ ĐƠN')
    expect(text).toContain('Ngân hàng mẫu')
    expect(text).toContain('Tiền phòng')
  })

  it('xem nhanh theo mã mẫu: cả mẫu HTML lẫn mẫu cũ', async () => {
    const html = await createInvoiceTemplate(db, admin, {
      name: 'Mới',
      body: DEFAULT_INVOICE_TEMPLATES.modern.html,
      style: 'modern',
    })
    const legacy = await createInvoiceTemplate(db, admin, { name: 'Cũ' })
    expect(new TextDecoder().decode((await previewInvoiceTemplateById(db, html.id)).slice(0, 5))).toBe('%PDF-')
    expect(new TextDecoder().decode((await previewInvoiceTemplateById(db, legacy.id)).slice(0, 5))).toBe('%PDF-')
    await expect(previewInvoiceTemplateById(db, crypto.randomUUID())).rejects.toThrow()
  })

  it('hoá đơn thật dựng từ mẫu HTML: điền mã, khách, dòng khoản thu và ngân hàng', async () => {
    const { renderInvoiceFromTemplate } = await import('@/server/pdf')
    const text = await textOf(
      await renderInvoiceFromTemplate(
        {
          kind: 'monthly',
          code: 'TD-HD-202612-0001',
          issueDate: '2026-12-01',
          periodStart: '2026-12-01',
          periodEnd: '2026-12-31',
          dueDate: '2026-12-05',
          facility: { name: 'Siris Thảo Điền', address: 'TP.HCM' },
          room: '301',
          tenant: { name: 'Nguyễn Thị Thu', phone: '0123456789', kind: 'vietnamese' },
          lines: [
            {
              description: 'Tiền phòng tháng 12',
              quantity: 1,
              unitLabel: 'tháng',
              unitPrice: 9380000,
              amount: 9380000,
            },
          ],
          total: 9380000,
          paid: 0,
          bank: {
            bankBin: '970436',
            bankName: 'Vietcombank',
            accountNumber: '0123456789',
            accountName: 'NGUYEN VAN A',
          },
        },
        { body: DEFAULT_INVOICE_TEMPLATES.modern.html, style: 'modern' },
      ),
    )
    for (const want of [
      'TD-HD-202612-0001',
      'Nguyễn Thị Thu',
      'Tiền phòng tháng 12',
      '9.380.000',
      'Vietcombank',
      '01/12/2026',
    ])
      expect(text).toContain(want)
  })
})
