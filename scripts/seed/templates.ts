import { eq } from 'drizzle-orm'
import { docTemplates } from '@/db'
import { TEMPLATE_DOC_TYPES } from '@/domain/template-fields'
import { DEFAULT_TEMPLATES } from '@/modules/documents/server/templates/defaults'
import type { SeedModule } from './types'

/** Mười sáu mẫu giấy tờ mặc định (tám loại × hai kiểu); kiểu Trang trọng là mẫu mặc định của từng loại. */
export const templateSeed: SeedModule = {
  name: 'templates',
  async isSeeded({ db }) {
    return (
      (await db.select({ id: docTemplates.id }).from(docTemplates).where(eq(docTemplates.isDemo, true)).limit(1))
        .length > 0
    )
  },
  async run({ db, rng }) {
    for (const docType of TEMPLATE_DOC_TYPES) {
      for (const style of ['formal', 'modern'] as const) {
        const { name, html } = DEFAULT_TEMPLATES[docType][style]
        await db
          .insert(docTemplates)
          .values({ id: rng.uuid(), docType, name, body: html, style, isDefault: style === 'formal', isDemo: true })
      }
    }
  },
}
