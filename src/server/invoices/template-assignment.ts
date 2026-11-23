import { eq } from 'drizzle-orm'
import { invoiceTemplates, invoices, leases, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { recordAudit } from '@/server/audit'

export async function selectInvoiceTemplate(db: DB, ctx: AccessContext, invoiceId: string, templateId: string | null) {
  await db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId))
    if (!inv) throw new NotFoundError()
    assertCan(ctx, 'billing', inv.facilityId)
    if (templateId) {
      const [row] = await tx.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, templateId))
      if (!row) throw new ValidationError('Mẫu hóa đơn không tồn tại')
    }
    await tx
      .update(invoices)
      .set({ invoiceTemplateId: templateId, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'invoice',
      entityId: invoiceId,
      facilityId: inv.facilityId,
      summary: 'Chọn mẫu hóa đơn',
      after: { templateId },
    })
  })
}
export async function selectLeaseInvoiceTemplate(
  db: DB,
  ctx: AccessContext,
  leaseId: string,
  templateId: string | null,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ facilityId: rooms.facilityId })
      .from(leases)
      .innerJoin(rooms, eq(rooms.id, leases.roomId))
      .where(eq(leases.id, leaseId))
    if (!row) throw new NotFoundError()
    assertCan(ctx, 'tenants_contracts', row.facilityId)
    if (templateId) {
      const [template] = await tx
        .select({ id: invoiceTemplates.id })
        .from(invoiceTemplates)
        .where(eq(invoiceTemplates.id, templateId))
      if (!template) throw new ValidationError('Mẫu hóa đơn không tồn tại')
    }
    await tx.update(leases).set({ invoiceTemplateId: templateId, updatedAt: new Date() }).where(eq(leases.id, leaseId))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'lease',
      entityId: leaseId,
      facilityId: row.facilityId,
      summary: 'Chọn mẫu hóa đơn cho hợp đồng',
      after: { templateId },
    })
  })
}
