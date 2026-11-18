import { asc, eq } from 'drizzle-orm'
import { invoiceTemplates, invoices, leases, rooms } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { defaultInvoiceTemplate, invoiceTemplateSchema, resolveInvoiceTemplateId, type InvoiceTemplateConfig } from '@/domain/invoice-template'
import { recordAudit } from '@/server/audit'

function checked(input: { name: string; config: unknown }) {
  const name = input.name?.trim()
  const config = invoiceTemplateSchema.safeParse(input.config)
  if (!name || name.length > 100 || !config.success) throw new ValidationError('Tên hoặc cấu hình mẫu hóa đơn không hợp lệ')
  if (config.data.logo) {
    const [prefix, data] = config.data.logo.split(',')
    const bytes = Buffer.from(data, 'base64')
    const valid = prefix === 'data:image/png;base64' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    if (!valid || bytes.length > 300_000) throw new ValidationError('Logo phải là ảnh PNG hoặc JPEG không quá 300 KB')
  }
  return { name, config: config.data }
}
export async function listInvoiceTemplates(db: Pick<DB, 'select'>, ctx: AccessContext) {
  void ctx
  return db.select().from(invoiceTemplates).orderBy(asc(invoiceTemplates.createdAt))
}
export async function createInvoiceTemplate(db: DB, ctx: AccessContext, input: { name: string; config: unknown }) {
  assertCan(ctx, 'settings'); const data = checked(input)
  return db.transaction(async tx => { const [row] = await tx.insert(invoiceTemplates).values(data).returning(); await recordAudit(tx, ctx, { action: 'create', entity: 'invoice_template', entityId: row.id, summary: `Tạo mẫu hóa đơn ${row.name}` }); return row })
}
export async function updateInvoiceTemplate(db: DB, ctx: AccessContext, id: string, input: { name: string; config: unknown }) {
  assertCan(ctx, 'settings'); const data = checked(input)
  return db.transaction(async tx => { const [row] = await tx.update(invoiceTemplates).set({ ...data, updatedAt: new Date() }).where(eq(invoiceTemplates.id, id)).returning(); if (!row) throw new NotFoundError(); await recordAudit(tx, ctx, { action: 'update', entity: 'invoice_template', entityId: id, summary: `Cập nhật mẫu hóa đơn ${row.name}` }); return row })
}
export async function setDefaultInvoiceTemplate(db: DB, ctx: AccessContext, id: string) {
  assertCan(ctx, 'settings')
  await db.transaction(async tx => {
    const rows = await tx.select().from(invoiceTemplates).orderBy(asc(invoiceTemplates.id)).for('update')
    if (!rows.some(r => r.id === id)) throw new NotFoundError()
    await tx.update(invoiceTemplates).set({ isDefault: false }).where(eq(invoiceTemplates.isDefault, true))
    await tx.update(invoiceTemplates).set({ isDefault: true, updatedAt: new Date() }).where(eq(invoiceTemplates.id, id))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice_template', entityId: id, summary: 'Đặt mẫu hóa đơn mặc định' })
  })
}
export async function deleteInvoiceTemplate(db: DB, ctx: AccessContext, id: string) {
  assertCan(ctx, 'settings')
  await db.transaction(async tx => {
    const [row] = await tx.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id)).for('update')
    if (!row) throw new NotFoundError()
    if (row.isDefault || row.isSystem) throw new ValidationError('Không thể xóa mẫu mặc định hoặc mẫu hệ thống')
    const [lease] = await tx.select({ id: leases.id }).from(leases).where(eq(leases.invoiceTemplateId, id)).limit(1)
    const [invoice] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.invoiceTemplateId, id)).limit(1)
    if (lease || invoice) throw new ValidationError('Mẫu đang được hợp đồng hoặc hóa đơn sử dụng')
    await tx.delete(invoiceTemplates).where(eq(invoiceTemplates.id, id))
    await recordAudit(tx, ctx, { action: 'delete', entity: 'invoice_template', entityId: id, summary: `Xóa mẫu hóa đơn ${row.name}` })
  })
}
export async function selectInvoiceTemplate(db: DB, ctx: AccessContext, invoiceId: string, templateId: string | null) {
  await db.transaction(async tx0 => {
    const tx = tx0 as unknown as DB; const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId))
    if (!inv) throw new NotFoundError()
    assertCan(ctx, 'billing', inv.facilityId)
    if (templateId) { const [row] = await tx.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, templateId)); if (!row) throw new ValidationError('Mẫu hóa đơn không tồn tại') }
    await tx.update(invoices).set({ invoiceTemplateId: templateId, updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
    await recordAudit(tx, ctx, { action: 'update', entity: 'invoice', entityId: invoiceId, facilityId: inv.facilityId, summary: 'Chọn mẫu hóa đơn', after: { templateId } })
  })
}
export async function selectLeaseInvoiceTemplate(db: DB, ctx: AccessContext, leaseId: string, templateId: string | null) {
  await db.transaction(async tx => {
    const [row] = await tx.select({ facilityId: rooms.facilityId }).from(leases).innerJoin(rooms, eq(rooms.id, leases.roomId)).where(eq(leases.id, leaseId))
    if (!row) throw new NotFoundError()
    assertCan(ctx, 'tenants_contracts', row.facilityId)
    if (templateId) { const [template] = await tx.select({ id: invoiceTemplates.id }).from(invoiceTemplates).where(eq(invoiceTemplates.id, templateId)); if (!template) throw new ValidationError('Mẫu hóa đơn không tồn tại') }
    await tx.update(leases).set({ invoiceTemplateId: templateId, updatedAt: new Date() }).where(eq(leases.id, leaseId))
    await recordAudit(tx, ctx, { action: 'update', entity: 'lease', entityId: leaseId, facilityId: row.facilityId, summary: 'Chọn mẫu hóa đơn cho hợp đồng', after: { templateId } })
  })
}
export async function resolveInvoiceTemplate(db: Pick<DB, 'select'>, invoiceId: string): Promise<{ id: string | null; config: InvoiceTemplateConfig }> {
  const [row] = await db.select({ invoice: invoices.invoiceTemplateId, lease: leases.invoiceTemplateId }).from(invoices).innerJoin(leases, eq(leases.id, invoices.leaseId)).where(eq(invoices.id, invoiceId))
  if (!row) throw new NotFoundError()
  const [fallback] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.isDefault, true))
  const id = resolveInvoiceTemplateId(row.invoice, row.lease, fallback?.id ?? null)
  const [template] = id ? await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id)) : []
  if (id && !template) throw new ValidationError('Mẫu hóa đơn đã chọn không tồn tại')
  return { id, config: template ? invoiceTemplateSchema.parse(template.config) : defaultInvoiceTemplate }
}
