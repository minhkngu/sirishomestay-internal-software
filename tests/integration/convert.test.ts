import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { facilities, files } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import { confirmUpload, requestUpload } from '@/server/files/service'
import { MemoryStorage } from '@/server/storage/memory'
import { attachTemplateFile, createTemplate, exportDocument, registerDocLoader } from '@/server/templates/service'
import { DOCX_MIME } from '@/lib/docx'
import { buildSampleTemplate } from '../../scripts/build-sample-templates'
import { createTestDb } from '../helpers/db'

// PDF một trang trắng tối thiểu (đủ để pdf.js dựng ảnh)
const MIN_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF'
const admin: AccessContext = { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(['settings']), facilityIds: new Set(), isAdmin: true }
describe('xuất PDF và ảnh (Gotenberg giả)', () => {
  let db: DB, storage: MemoryStorage, facilityId: string
  const calls: { url: string }[] = []
  async function addTemplate(docType: 'lease' | 'invoice_monthly') {
    const t = await createTemplate(db, admin, { docType, name: docType })
    const up = await requestUpload(db, admin, storage, { ownerType: 'template', ownerId: t.id, contentType: DOCX_MIME, name: 't.docx' })
    const [row] = await db.select().from(files).where(eq(files.id, up.fileId))
    await storage.write(row.storageKey, await buildSampleTemplate(docType), DOCX_MIME)
    await confirmUpload(db, admin, up.fileId); await attachTemplateFile(db, admin, t.id, up.fileId)
  }
  beforeEach(async () => {
    db = await createTestDb(); storage = new MemoryStorage(); calls.length = 0
    facilityId = (await db.insert(facilities).values({ code: 'A', name: 'A' }).returning())[0].id
    const loader = async () => ({ entities: { now: '2026-11-16' }, facilityId, baseName: 'tai-lieu' })
    registerDocLoader('lease', loader); registerDocLoader('invoice_monthly', loader)
    vi.stubEnv('GOTENBERG_URL', 'http://gotenberg.test')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push({ url }); return new Response(MIN_PDF, { status: 200 }) }))
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('pdf gọi POST /forms/libreoffice/convert và lưu file application/pdf', async () => {
    await addTemplate('lease')
    const r = await exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), format: 'pdf' })
    expect(calls.map((c) => c.url)).toEqual(['http://gotenberg.test/forms/libreoffice/convert'])
    const [row] = await db.select().from(files).where(eq(files.id, r.fileId))
    expect(row).toMatchObject({ contentType: 'application/pdf', name: 'tai-lieu.pdf' })
    expect(new TextDecoder().decode(await storage.read(row.storageKey))).toBe(MIN_PDF)
  })
  it('Gotenberg lỗi → ValidationError tiếng Việt', async () => {
    await addTemplate('lease')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    await expect(exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), format: 'pdf' })).rejects.toThrow('Không chuyển được sang PDF, thử lại sau')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    await expect(exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), format: 'pdf' })).rejects.toThrow(ValidationError)
  })
  it('không cho xuất hợp đồng thành ảnh', async () => {
    await addTemplate('lease')
    await expect(exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), format: 'png' })).rejects.toThrow('Chỉ hoá đơn mới xuất được ảnh')
  })
  it('chưa cấu hình dịch vụ → báo rõ, không crash', async () => {
    await addTemplate('lease'); vi.stubEnv('GOTENBERG_URL', '')
    await expect(exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), format: 'pdf' })).rejects.toThrow('Chưa cấu hình dịch vụ chuyển PDF')
  })
})
