import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { docTemplates } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { DOC_TEMPLATE_PREVIEW_VERSION, createTemplate, getTemplatePreview, listTemplatePreviews, listTemplates, updateTemplate } from '@/server/templates/service'
import { createTestDb } from '../helpers/db'

const admin: AccessContext = { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', isAdmin: true, facilityIds: new Set(), permissions: new Set(['settings']) }

describe('bản xem mẫu hợp đồng và biên bản dựng sẵn', () => {
  let db: DB
  const row = async (id: string) => (await db.select().from(docTemplates).where(eq(docTemplates.id, id)))[0]
  beforeEach(async () => { db = await createTestDb() })

  it('tạo mẫu có nội dung lưu sẵn previewPdf (PDF hợp lệ) và previewVersion hiện hành', async () => {
    const t = await createTemplate(db, admin, { docType: 'lease', name: 'A', body: '<p>Hợp đồng [ten_khach]</p>', style: 'formal' })
    const saved = await row(t.id)
    expect(saved.previewVersion).toBe(DOC_TEMPLATE_PREVIEW_VERSION)
    expect(Buffer.from(saved.previewPdf!, 'base64').subarray(0, 4).toString()).toBe('%PDF')
  })

  it('sửa nội dung đổi previewPdf', async () => {
    const t = await createTemplate(db, admin, { docType: 'lease', name: 'A', body: '<p>Một</p>', style: 'formal' })
    const before = (await row(t.id)).previewPdf
    await updateTemplate(db, admin, t.id, { body: '<p>Hai khác hẳn</p>', style: 'modern' })
    const after = (await row(t.id)).previewPdf
    expect(after).toBeTruthy()
    expect(after).not.toBe(before)
  })

  it('listTemplatePreviews dựng và lưu mẫu còn thiếu hoặc cũ phiên bản, bỏ qua mẫu không có nội dung', async () => {
    const a = await createTemplate(db, admin, { docType: 'lease', name: 'A', body: '<p>A</p>' })
    await createTemplate(db, admin, { docType: 'lease', name: 'Cũ' }) // mẫu Word cũ, không có nội dung
    await db.update(docTemplates).set({ previewPdf: 'cu', previewVersion: DOC_TEMPLATE_PREVIEW_VERSION - 1 }).where(eq(docTemplates.id, a.id))
    const previews = await listTemplatePreviews(db, admin)
    expect(Object.keys(previews)).toEqual([a.id])
    expect(previews[a.id]).not.toBe('cu')
    expect((await row(a.id)).previewPdf).toBe(previews[a.id])
  })

  it('listTemplatePreviews theo danh sách id chỉ trả mẫu được hỏi; getTemplatePreview lấy một mẫu', async () => {
    const a = await createTemplate(db, admin, { docType: 'lease', name: 'A', body: '<p>A</p>' })
    const b = await createTemplate(db, admin, { docType: 'lease', name: 'B', body: '<p>B</p>' })
    expect(Object.keys(await listTemplatePreviews(db, admin, [a.id]))).toEqual([a.id])
    const one = await getTemplatePreview(db, admin, b.id)
    expect(Buffer.from(one, 'base64').subarray(0, 4).toString()).toBe('%PDF')
  })

  it('listTemplates không trả cột bản xem', async () => {
    await createTemplate(db, admin, { docType: 'lease', name: 'A', body: '<p>A</p>' })
    const [t] = await listTemplates(db, admin)
    expect('previewPdf' in t).toBe(false)
  })
})
