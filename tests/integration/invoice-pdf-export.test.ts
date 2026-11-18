import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { facilities, rooms, tenants, leases, invoices, invoiceLines, payments, files } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { ForbiddenError } from '@/domain/errors'
import { getDownloadUrl } from '@/server/files/service'
import { convertPdfToPng } from '@/server/convert'
import { exportDocument } from '@/server/templates/service'
import '@/server/invoices/service'
import { MemoryStorage } from '@/server/storage/memory'
import { createTestDb } from '../helpers/db'
import { createInvoiceTemplate, selectInvoiceTemplate } from '@/server/invoice-templates/service'
import { defaultInvoiceTemplate } from '@/domain/invoice-template'

let db: DB, storage: MemoryStorage, ctx: AccessContext, facilityId: string, invoiceId: string, paymentId: string
beforeEach(async () => {
  db = await createTestDb(); storage = new MemoryStorage()
  const [f] = await db.insert(facilities).values({ code: 'A', name: 'Thảo Điền', bankAccount: { bankBin: '970436', bankName: 'VCB', accountNumber: '123456789', accountName: 'A' } }).returning(); facilityId = f.id
  const [r] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
  const [t] = await db.insert(tenants).values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'Nguyễn An', phone: '+84901234567', idNumber: '012345678901' }).returning()
  const [l] = await db.insert(leases).values({ code: 'HD1', roomId: r.id, tenantId: t.id, startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 9000000, depositAmount: 9000000 }).returning()
  const [i] = await db.insert(invoices).values({ code: 'HD-01', leaseId: l.id, facilityId, kind: 'monthly', periodStart: '2026-12-01', periodEnd: '2026-12-31', issueDate: '2026-12-01' }).returning(); invoiceId = i.id
  await db.insert(invoiceLines).values({ invoiceId, type: 'rent', description: 'Tiền phòng', quantity: 1, unitPrice: 9000000, amount: 9000000 })
  ctx = { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'An', isAdmin: false, facilityIds: new Set([facilityId]), permissions: new Set(['billing']) }
  const [p] = await db.insert(payments).values({ invoiceId, paidOn: '2026-12-02', amount: 1000000, method: 'cash', receivedBy: ctx.userId }).returning(); paymentId = p.id
})
async function exported(docType: 'invoice_monthly' | 'invoice_termination' | 'receipt', entityId: string, format?: 'pdf' | 'png' | 'docx') {
  const result = await exportDocument(db, ctx, storage, { docType, entityId, format })
  return (await db.select().from(files).where(eq(files.id, result.fileId)))[0]
}
describe('xuất hoá đơn và phiếu thu', () => {
  it('xuất PDF theo mẫu đã chọn cho kỳ hóa đơn', async () => {
    const admin: AccessContext = { ...ctx, isAdmin: true, permissions: new Set(['settings']) }
    const template = await createInvoiceTemplate(db, admin, { name: 'Thử', config: { ...defaultInvoiceTemplate, brand: 'MAU TUY CHON' } })
    await selectInvoiceTemplate(db, ctx, invoiceId, template.id)
    const row = await exported('invoice_monthly', invoiceId)
    const pdf = await getDocument({ data: new Uint8Array(await storage.read(row.storageKey)), useSystemFonts: true }).promise
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map(i => 'str' in i ? i.str : '').join(' ')
    expect(text).toContain('MAU TUY CHON')
  })
  it('mặc định PDF, dùng tài khoản toà và không gọi dịch vụ ngoài', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch'); const qrSpy = vi.spyOn(QRCode, 'toDataURL')
    try { const row = await exported('invoice_monthly', invoiceId); expect(row).toMatchObject({ contentType: 'application/pdf', name: 'HD-01.pdf' }); expect(fetchSpy.mock.calls.filter(([url]) => /^https?:/.test(String(url)))).toHaveLength(0); expect(qrSpy.mock.calls[0][0]).toContain('123456789') } finally { fetchSpy.mockRestore(); qrSpy.mockRestore() }
  })
  it('xuất PNG không gọi dịch vụ ngoài', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    try { expect(await exported('invoice_monthly', invoiceId, 'png')).toMatchObject({ contentType: 'image/png', name: 'HD-01.png' }); expect(spy.mock.calls.filter(([url]) => /^https?:/.test(String(url)))).toHaveLength(0) } finally { spy.mockRestore() }
  })
  it('ghi chỉ số đầu và cuối của dòng điện vào PDF', async () => {
    await db.insert(invoiceLines).values({ invoiceId, type: 'electric', description: 'Tiền điện', quantity: 333, unitPrice: 3000, amount: 999000, meta: { segments: [{ meterId: 'm1', start: 123, end: 456 }] } })
    const row = await exported('invoice_monthly', invoiceId)
    const pdf = await getDocument({ data: new Uint8Array(await storage.read(row.storageKey)), useSystemFonts: true }).promise
    const content = await (await pdf.getPage(1)).getTextContent()
    const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ')
    expect(text).toContain('123 đến 456')
    expect(text).toContain('kWh')
  })
  it('liên kết tải dùng đúng tên tệp xuất', async () => {
    const row = await exported('invoice_monthly', invoiceId)
    const spy = vi.spyOn(storage, 'createDownloadUrl')
    try { await getDownloadUrl(db, ctx, storage, row.id, false); expect(spy).toHaveBeenCalledWith(row.storageKey, 300, 'HD-01.pdf') } finally { spy.mockRestore() }
  })
  it('xem PDF không ép tải xuống và vẫn kiểm tra quyền', async () => {
    const row = await exported('invoice_monthly', invoiceId)
    const spy = vi.spyOn(storage, 'createDownloadUrl')
    try {
      await getDownloadUrl(db, ctx, storage, row.id, false, true)
      expect(spy).toHaveBeenCalledWith(row.storageKey, 300, undefined)
      ctx.permissions = new Set(['meters'])
      await expect(getDownloadUrl(db, ctx, storage, row.id, false, true)).rejects.toThrow(ForbiddenError)
    } finally { spy.mockRestore() }
  })
  it('xuất ảnh không phụ thuộc đường dẫn require nội bộ của pdf.js', async () => {
    const row = await exported('invoice_monthly', invoiceId)
    const pdf = new Blob([new Uint8Array(await storage.read(row.storageKey))])
    const original = process.getBuiltinModule.bind(process)
    const spy = vi.spyOn(process, 'getBuiltinModule').mockImplementation((name) => {
      const builtin = original(name)
      if (name !== 'module') return builtin
      return { ...builtin, createRequire: () => () => { throw new Error('Không tìm được canvas từ pdf.js') } }
    })
    try { expect((await convertPdfToPng(pdf)).type).toBe('image/png') } finally { spy.mockRestore() }
  })
  it('từ chối Word', async () => expect(exported('invoice_monthly', invoiceId, 'docx')).rejects.toThrow('Hoá đơn và phiếu thu chỉ xuất PDF hoặc ảnh'))
  it('hoá đơn đầu tiên xuất theo mẫu hoá đơn tháng', async () => {
    await db.update(invoices).set({ kind: 'first' }).where(eq(invoices.id, invoiceId))
    expect((await exported('invoice_monthly', invoiceId)).contentType).toBe('application/pdf')
  })
  it('xuất thanh lý và phiếu thu bằng PDF', async () => {
    await db.update(invoices).set({ kind: 'termination' }).where(eq(invoices.id, invoiceId))
    expect((await exported('invoice_termination', invoiceId)).contentType).toBe('application/pdf')
    expect((await exported('receipt', paymentId)).contentType).toBe('application/pdf')
  })
  it('người thiếu quyền billing không xuất được', async () => {
    ctx.permissions = new Set(['meters'])
    await expect(exported('invoice_monthly', invoiceId)).rejects.toThrow(ForbiddenError)
  })
})
