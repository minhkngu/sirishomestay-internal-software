import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { invoiceTemplates } from '@/db'
import type { AccessContext } from '@/domain/access'
import { DEFAULT_INVOICE_TEMPLATES } from '@/modules/documents/domain/invoice-template-html'
import { createInvoiceTemplate, updateInvoiceTemplate } from '@/modules/documents/server/invoice-templates/service'
import { createTestDb } from '../helpers/db'

vi.mock('@/modules/documents/server/pdf', () => ({
  renderInvoiceFromTemplate: async () => {
    throw new Error('không dựng được PDF')
  },
  renderInvoicePdf: async () => {
    throw new Error('không dựng được PDF')
  },
}))

const admin: AccessContext = {
  userId: crypto.randomUUID(),
  email: 'a@x.com',
  fullName: 'A',
  isAdmin: true,
  facilityIds: new Set(),
  permissions: new Set(['settings']),
}

describe('lưu mẫu hoá đơn khi dựng PDF lỗi', () => {
  it('mẫu vẫn lưu được, previewPdf để trống để dựng lại ở lần xem sau', async () => {
    const db = await createTestDb()
    const t = await createInvoiceTemplate(db, admin, {
      name: 'A',
      body: DEFAULT_INVOICE_TEMPLATES.formal.html,
      style: 'formal',
    })
    await updateInvoiceTemplate(db, admin, t.id, {
      name: 'A2',
      body: DEFAULT_INVOICE_TEMPLATES.formal.html,
      style: 'formal',
    })
    const [row] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, t.id))
    expect(row.name).toBe('A2')
    expect(row.previewPdf).toBeNull()
  })
})
