import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { invoiceTemplates } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { DEFAULT_INVOICE_TEMPLATES } from '@/modules/documents/domain/invoice-template-html'
import { restoreDefaultInvoiceTemplates } from '@/modules/documents/server/invoice-templates/defaults'
import {
  INVOICE_PREVIEW_VERSION,
  createInvoiceTemplate,
  getInvoiceTemplatePreview,
  listInvoiceTemplatePreviews,
  listInvoiceTemplates,
  updateInvoiceTemplate,
} from '@/modules/documents/server/invoice-templates/service'
import { createTestDb } from '../helpers/db'

const admin: AccessContext = {
  userId: crypto.randomUUID(),
  email: 'a@x.com',
  fullName: 'A',
  isAdmin: true,
  facilityIds: new Set(),
  permissions: new Set(['settings']),
}
const BODY = DEFAULT_INVOICE_TEMPLATES.formal.html

describe('bản xem mẫu hoá đơn dựng sẵn', () => {
  let db: DB
  const row = async (id: string) => (await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id)))[0]
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('tạo mẫu lưu sẵn previewPdf (PDF hợp lệ) và previewVersion hiện hành', async () => {
    const t = await createInvoiceTemplate(db, admin, { name: 'A', body: BODY, style: 'formal' })
    const saved = await row(t.id)
    expect(saved.previewVersion).toBe(INVOICE_PREVIEW_VERSION)
    expect(Buffer.from(saved.previewPdf!, 'base64').subarray(0, 4).toString()).toBe('%PDF')
  })

  it('sửa nội dung mẫu đổi previewPdf', async () => {
    const t = await createInvoiceTemplate(db, admin, { name: 'A', body: BODY, style: 'formal' })
    const before = (await row(t.id)).previewPdf
    await updateInvoiceTemplate(db, admin, t.id, {
      name: 'A',
      body: '<p>Hoá đơn khác hẳn {{tenant.name}}</p>',
      style: 'modern',
    })
    const after = (await row(t.id)).previewPdf
    expect(after).toBeTruthy()
    expect(after).not.toBe(before)
  })

  it('restoreDefaultInvoiceTemplates lưu bản xem cho mẫu mới tạo', async () => {
    await restoreDefaultInvoiceTemplates(db, admin)
    const rows = (await db.select().from(invoiceTemplates)).filter((r) => !r.isSystem) // mẫu hệ thống có sẵn từ migration, không do restore tạo
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.previewPdf && r.previewVersion === INVOICE_PREVIEW_VERSION)).toBe(true)
  })

  it('getInvoiceTemplatePreview dựng lại khi previewVersion cũ hơn hiện hành và ghi lại', async () => {
    const t = await createInvoiceTemplate(db, admin, { name: 'A', body: BODY, style: 'formal' })
    await db
      .update(invoiceTemplates)
      .set({ previewPdf: 'cu', previewVersion: INVOICE_PREVIEW_VERSION - 1 })
      .where(eq(invoiceTemplates.id, t.id))
    const b64 = await getInvoiceTemplatePreview(db, t.id)
    expect(b64).not.toBe('cu')
    expect(await row(t.id)).toMatchObject({ previewPdf: b64, previewVersion: INVOICE_PREVIEW_VERSION })
  })

  it('getInvoiceTemplatePreview dùng lại bản đã lưu khi phiên bản còn hiện hành', async () => {
    const t = await createInvoiceTemplate(db, admin, { name: 'A', body: BODY, style: 'formal' })
    await db.update(invoiceTemplates).set({ previewPdf: 'da-luu' }).where(eq(invoiceTemplates.id, t.id))
    expect(await getInvoiceTemplatePreview(db, t.id)).toBe('da-luu')
  })

  it('getInvoiceTemplatePreview dựng cho mẫu cũ chưa có bản xem', async () => {
    const t = await createInvoiceTemplate(db, admin, { name: 'A', body: BODY, style: 'formal' })
    await db
      .update(invoiceTemplates)
      .set({ previewPdf: null, previewVersion: null })
      .where(eq(invoiceTemplates.id, t.id))
    const b64 = await getInvoiceTemplatePreview(db, t.id)
    expect(Buffer.from(b64, 'base64').subarray(0, 4).toString()).toBe('%PDF')
    expect((await row(t.id)).previewPdf).toBe(b64)
  })

  it('listInvoiceTemplates không có khoá previewPdf và previewVersion', async () => {
    await createInvoiceTemplate(db, admin, { name: 'A', body: BODY, style: 'formal' })
    const list = await listInvoiceTemplates(db, admin)
    expect(list.some((x) => x.name === 'A')).toBe(true)
    for (const x of list) {
      expect(x).not.toHaveProperty('previewPdf')
      expect(x).not.toHaveProperty('previewVersion')
    }
  })

  it('listInvoiceTemplatePreviews trả id → base64 cho mọi mẫu', async () => {
    const a = await createInvoiceTemplate(db, admin, { name: 'A', body: BODY, style: 'formal' })
    const b = await createInvoiceTemplate(db, admin, { name: 'B', body: BODY, style: 'modern' })
    await db
      .update(invoiceTemplates)
      .set({ previewPdf: null, previewVersion: null })
      .where(eq(invoiceTemplates.id, b.id))
    const map = await listInvoiceTemplatePreviews(db, admin)
    const all = (await db.select({ id: invoiceTemplates.id }).from(invoiceTemplates)).map((r) => r.id)
    expect(Object.keys(map).sort()).toEqual(all.sort())
    expect(all).toEqual(expect.arrayContaining([a.id, b.id]))
    expect(Object.values(map).every((v) => v.length > 100)).toBe(true)
  })
})
