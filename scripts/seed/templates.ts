import { eq } from 'drizzle-orm'
import { docTemplates, files } from '@/db'
import { DOC_TYPES, DOC_TYPE_LABELS } from '@/domain/template-fields'
import { DOCX_MIME } from '@/lib/docx'
import { buildSampleTemplate } from '../build-sample-templates'
import type { SeedModule } from './types'

/** Mẫu Word mẫu (sinh bằng thư viện docx) cho đủ 10 loại giấy tờ, mỗi loại một mẫu mặc định. */
export const templateSeed: SeedModule = {
  name: 'templates',
  async isSeeded({ db }) { return (await db.select({ id: docTemplates.id }).from(docTemplates).where(eq(docTemplates.isDemo, true)).limit(1)).length > 0 },
  async run({ db, rng, storage }) {
    for (const docType of DOC_TYPES) {
      const templateId = rng.uuid()
      const fileId = rng.uuid()
      const key = `template/${templateId}/${fileId}.docx`
      const bytes = new Uint8Array(await buildSampleTemplate(docType))
      await storage.write(key, bytes, DOCX_MIME)
      await db.insert(files).values({
        id: fileId, storageKey: key, name: `${docType}.docx`, contentType: DOCX_MIME, size: bytes.byteLength,
        ownerType: 'template', ownerId: templateId, confirmedAt: new Date(), isDemo: true,
      })
      await db.insert(docTemplates).values({ id: templateId, docType, name: `${DOC_TYPE_LABELS[docType]} (mẫu)`, fileId, isDefault: true, isDemo: true })
    }
  },
}
