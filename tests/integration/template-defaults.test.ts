import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { docTemplates, facilities, files } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { renderTemplate } from '@/domain/doc-template'
import { sampleDataFor, TEMPLATE_DOC_TYPES, type TemplateDocType } from '@/domain/template-fields'
import { MemoryStorage } from '@/server/storage/memory'
import { DEFAULT_TEMPLATES, ensureDefaultTemplate, restoreDefaultTemplates } from '@/server/templates/defaults'
import { exportDocument, registerDocLoader } from '@/server/templates/service'
import { createTestDb } from '../helpers/db'
import { addHtmlTemplate } from '../helpers/templates'

const admin: AccessContext = { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(['settings']), facilityIds: new Set(), isAdmin: true }
const STYLES = ['formal', 'modern'] as const

describe('mẫu giấy tờ mặc định', () => {
  let db: DB
  beforeEach(async () => { db = await createTestDb() })

  describe.each(TEMPLATE_DOC_TYPES)('%s', (docType) => {
    it.each(STYLES)('kiểu %s điền đủ dữ liệu mẫu, không thiếu chỗ điền nào', (style) => {
      const { html } = DEFAULT_TEMPLATES[docType][style]
      const { doc, warnings } = renderTemplate(html, sampleDataFor(docType))
      expect(warnings).toEqual([])
      expect(doc.length).toBeGreaterThan(5)
    })
  })

  it('có đủ tám loại, mỗi loại hai kiểu, tên theo dạng "Loại (Kiểu)"', () => {
    expect(TEMPLATE_DOC_TYPES).toHaveLength(8)
    expect(DEFAULT_TEMPLATES.lease.formal.name).toBe('Hợp đồng thuê (Trang trọng)')
    expect(DEFAULT_TEMPLATES.lease.modern.name).toBe('Hợp đồng thuê (Hiện đại)')
  })

  it('kiểu Hiện đại có khối tóm tắt, kiểu Trang trọng có quốc hiệu', () => {
    for (const t of TEMPLATE_DOC_TYPES) {
      expect(DEFAULT_TEMPLATES[t].modern.html).toContain('data-role="summary"')
      expect(DEFAULT_TEMPLATES[t].formal.html).toContain('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM')
    }
  })

  it('ensureDefaultTemplate tạo đúng hai mẫu cho loại, mẫu Trang trọng là mặc định, gọi lại không tạo thêm', async () => {
    const t = await ensureDefaultTemplate(db, admin, 'lease')
    expect(t).toMatchObject({ docType: 'lease', style: 'formal', isDefault: true })
    await ensureDefaultTemplate(db, admin, 'lease')
    const rows = await db.select().from(docTemplates).where(eq(docTemplates.docType, 'lease'))
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1)
    expect(rows.map((r) => r.style).sort()).toEqual(['formal', 'modern'])
  })

  it('gọi song song 5 lần vẫn chỉ ra một bộ mẫu', async () => {
    await Promise.all([1, 2, 3, 4, 5].map(() => ensureDefaultTemplate(db, admin, 'deposit_contract')))
    const rows = await db.select().from(docTemplates).where(eq(docTemplates.docType, 'deposit_contract'))
    expect(rows).toHaveLength(2)
  })

  it('loại đã có mẫu riêng thì không tạo thêm', async () => {
    const own = await addHtmlTemplate(db, admin, 'lease', { name: 'Mẫu riêng' })
    const t = await ensureDefaultTemplate(db, admin, 'lease')
    expect(t.id).toBe(own.id)
    expect(await db.select().from(docTemplates).where(eq(docTemplates.docType, 'lease'))).toHaveLength(1)
  })

  it('loại giấy tờ không dùng mẫu (hoá đơn) bị từ chối', async () => {
    await expect(ensureDefaultTemplate(db, admin, 'invoice_monthly')).rejects.toThrow('không dùng mẫu')
  })

  it('xuất hợp đồng khi chưa có mẫu nào: ra PDF thật và tạo đúng một bộ mẫu mặc định', async () => {
    const facilityId = (await db.insert(facilities).values({ code: 'A', name: 'A' }).returning())[0].id
    registerDocLoader('lease', async () => ({ entities: { now: '2026-11-16' }, facilityId, baseName: 'hop-dong' }))
    const storage = new MemoryStorage()
    const r = await exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), format: 'pdf' })
    const [row] = await db.select().from(files).where(eq(files.id, r.fileId))
    expect(new TextDecoder().decode((await storage.read(row.storageKey)).slice(0, 5))).toBe('%PDF-')
    expect(await db.select().from(docTemplates).where(eq(docTemplates.docType, 'lease'))).toHaveLength(2)
  })

  it('restoreDefaultTemplates tạo mẫu còn thiếu, không ghi đè mẫu đã sửa', async () => {
    const t = await ensureDefaultTemplate(db, admin, 'lease')
    await db.update(docTemplates).set({ body: '<p>Đã sửa</p>' }).where(eq(docTemplates.id, t.id))
    const n = await restoreDefaultTemplates(db, admin)
    expect(n).toBe(TEMPLATE_DOC_TYPES.length * 2 - 2)
    const [after] = await db.select().from(docTemplates).where(eq(docTemplates.id, t.id))
    expect(after.body).toBe('<p>Đã sửa</p>')
    expect(await restoreDefaultTemplates(db, admin)).toBe(0)
    const perType = (x: TemplateDocType) => db.select().from(docTemplates).where(eq(docTemplates.docType, x))
    for (const x of TEMPLATE_DOC_TYPES) expect((await perType(x)).filter((r) => r.isDefault)).toHaveLength(1)
  })
})
