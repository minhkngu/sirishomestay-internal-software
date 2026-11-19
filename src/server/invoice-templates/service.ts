import { asc, eq } from 'drizzle-orm'
import { invoiceTemplates, invoices, leases } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { TemplateStyle } from '@/domain/doc-template'
import {
  defaultInvoiceTemplate,
  invoiceTemplateSchema,
  resolveInvoiceTemplateId,
  type InvoiceTemplateConfig,
} from '@/domain/invoice-template'
import { recordAudit } from '@/modules/platform'

type TemplateInput = { name: string; config?: unknown; body?: string; style?: TemplateStyle }
function checked(input: TemplateInput) {
  const name = input.name?.trim()
  const config = invoiceTemplateSchema.safeParse(input.config ?? defaultInvoiceTemplate)
  if (!name || name.length > 100 || !config.success)
    throw new ValidationError('Tên hoặc cấu hình mẫu hóa đơn không hợp lệ')
  if (input.body !== undefined) {
    if (!input.body.trim()) throw new ValidationError('Nhập nội dung mẫu')
    if (input.body.length > 200_000) throw new ValidationError('Nội dung mẫu quá dài')
    if (input.style && !['formal', 'modern'].includes(input.style))
      throw new ValidationError('Kiểu trình bày không hợp lệ')
  }
  if (config.data.logo) {
    const [prefix, data] = config.data.logo.split(',')
    const bytes = Buffer.from(data, 'base64')
    const valid =
      prefix === 'data:image/png;base64'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    if (!valid || bytes.length > 300_000) throw new ValidationError('Logo phải là ảnh PNG hoặc JPEG không quá 300 KB')
  }
  return {
    name,
    config: config.data,
    ...(input.body !== undefined && { body: input.body, style: input.style ?? 'formal' }),
  }
}
/** Xem mẫu chưa lưu bằng cùng bộ dựng PDF, không tạo hóa đơn hoặc tệp xuất. */
export async function previewInvoiceTemplate(ctx: AccessContext, config: unknown): Promise<Uint8Array> {
  assertCan(ctx, 'settings')
  const validated = checked({ name: 'Xem trước', config }).config
  const { renderInvoicePdf } = await import('@/server/pdf')
  return renderInvoicePdf(
    {
      kind: 'monthly',
      code: 'MAU-KHONG-THANH-TOAN',
      issueDate: '2026-11-01',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      dueDate: '2026-11-05',
      facility: { name: 'Siris Residences (dữ liệu mẫu)', address: 'Địa chỉ cơ sở mẫu' },
      room: '301',
      tenant: { name: 'Nguyễn Văn An', phone: '0900000000' },
      lines: [
        { description: 'Tiền phòng', quantity: 1, unitLabel: 'tháng', unitPrice: 9000000, amount: 9000000 },
        { description: 'Phí dịch vụ', quantity: 2, unitLabel: 'người', unitPrice: 200000, amount: 400000 },
        { description: 'Điện', quantity: 100, unitLabel: 'kWh', unitPrice: 3500, amount: 350000 },
      ],
      total: 9750000,
      paid: 0,
      bank: { bankBin: '970436', bankName: 'Ngân hàng mẫu', accountNumber: '123456789', accountName: 'TAI KHOAN MAU' },
    },
    validated,
    { sample: true },
  )
}
const SAMPLE_INVOICE = {
  kind: 'monthly' as const,
  code: 'MAU-KHONG-THANH-TOAN',
  issueDate: '2026-11-01',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  dueDate: '2026-11-05',
  facility: { name: 'Siris Residences (dữ liệu mẫu)', address: 'Địa chỉ cơ sở mẫu' },
  room: '301',
  tenant: { name: 'Nguyễn Văn An', phone: '0900000000' },
  lines: [
    { description: 'Tiền phòng', quantity: 1, unitLabel: 'tháng', unitPrice: 9000000, amount: 9000000 },
    { description: 'Phí dịch vụ', quantity: 2, unitLabel: 'người', unitPrice: 200000, amount: 400000 },
    { description: 'Điện', quantity: 100, unitLabel: 'kWh', unitPrice: 3500, amount: 350000 },
  ],
  total: 9750000,
  paid: 0,
  bank: { bankBin: '970436', bankName: 'Ngân hàng mẫu', accountNumber: '123456789', accountName: 'TAI KHOAN MAU' },
}
/** Xem mẫu HTML chưa lưu với dữ liệu mẫu (có mã QR minh hoạ). */
export async function previewInvoiceTemplateHtml(
  ctx: AccessContext,
  input: { body: string; style: TemplateStyle },
): Promise<Uint8Array> {
  assertCan(ctx, 'settings')
  if (!input.body.trim()) throw new ValidationError('Nhập nội dung mẫu')
  if (input.body.length > 200_000) throw new ValidationError('Nội dung mẫu quá dài')
  const { renderInvoiceFromTemplate } = await import('@/server/pdf')
  return renderInvoiceFromTemplate(SAMPLE_INVOICE, input, { sample: true })
}
/** Xem nhanh một mẫu hoá đơn đã lưu với dữ liệu mẫu, để chọn mẫu cho hợp đồng; mẫu cũ dựng theo khối vẫn xem được. */
export async function previewInvoiceTemplateById(db: Pick<DB, 'select'>, templateId: string): Promise<Uint8Array> {
  const [t] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, templateId))
  if (!t) throw new NotFoundError()
  const pdf = await import('@/server/pdf')
  return t.body
    ? pdf.renderInvoiceFromTemplate(SAMPLE_INVOICE, { body: t.body, style: t.style as TemplateStyle }, { sample: true })
    : pdf.renderInvoicePdf(SAMPLE_INVOICE, invoiceTemplateSchema.parse(t.config), { sample: true })
}
export async function listInvoiceTemplates(db: Pick<DB, 'select'>, ctx: AccessContext) {
  void ctx
  return db.select().from(invoiceTemplates).orderBy(asc(invoiceTemplates.createdAt))
}
export async function createInvoiceTemplate(db: DB, ctx: AccessContext, input: TemplateInput) {
  assertCan(ctx, 'settings')
  const data = checked(input)
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(invoiceTemplates).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'invoice_template',
      entityId: row.id,
      summary: `Tạo mẫu hóa đơn ${row.name}`,
    })
    return row
  })
}
export async function updateInvoiceTemplate(db: DB, ctx: AccessContext, id: string, input: TemplateInput) {
  assertCan(ctx, 'settings')
  const data = checked(input)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(invoiceTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(invoiceTemplates.id, id))
      .returning()
    if (!row) throw new NotFoundError()
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'invoice_template',
      entityId: id,
      summary: `Cập nhật mẫu hóa đơn ${row.name}`,
    })
    return row
  })
}
export async function setDefaultInvoiceTemplate(db: DB, ctx: AccessContext, id: string) {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(invoiceTemplates).orderBy(asc(invoiceTemplates.id)).for('update')
    if (!rows.some((r) => r.id === id)) throw new NotFoundError()
    await tx.update(invoiceTemplates).set({ isDefault: false }).where(eq(invoiceTemplates.isDefault, true))
    await tx.update(invoiceTemplates).set({ isDefault: true, updatedAt: new Date() }).where(eq(invoiceTemplates.id, id))
    await recordAudit(tx, ctx, {
      action: 'update',
      entity: 'invoice_template',
      entityId: id,
      summary: 'Đặt mẫu hóa đơn mặc định',
    })
  })
}
export async function deleteInvoiceTemplate(db: DB, ctx: AccessContext, id: string) {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id)).for('update')
    if (!row) throw new NotFoundError()
    if (row.isDefault || row.isSystem) throw new ValidationError('Không thể xóa mẫu mặc định hoặc mẫu hệ thống')
    const [lease] = await tx.select({ id: leases.id }).from(leases).where(eq(leases.invoiceTemplateId, id)).limit(1)
    const [invoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.invoiceTemplateId, id))
      .limit(1)
    if (lease || invoice) throw new ValidationError('Mẫu đang được hợp đồng hoặc hóa đơn sử dụng')
    await tx.delete(invoiceTemplates).where(eq(invoiceTemplates.id, id))
    await recordAudit(tx, ctx, {
      action: 'delete',
      entity: 'invoice_template',
      entityId: id,
      summary: `Xóa mẫu hóa đơn ${row.name}`,
    })
  })
}
export async function resolveInvoiceTemplate(
  db: Pick<DB, 'select'>,
  invoiceId: string,
): Promise<{ id: string | null; config: InvoiceTemplateConfig; html: { body: string; style: TemplateStyle } | null }> {
  const [row] = await db
    .select({ invoice: invoices.invoiceTemplateId, lease: leases.invoiceTemplateId })
    .from(invoices)
    .innerJoin(leases, eq(leases.id, invoices.leaseId))
    .where(eq(invoices.id, invoiceId))
  if (!row) throw new NotFoundError()
  const [fallback] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.isDefault, true))
  const id = resolveInvoiceTemplateId(row.invoice, row.lease, fallback?.id ?? null)
  const [template] = id ? await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id)) : []
  if (id && !template) throw new ValidationError('Mẫu hóa đơn đã chọn không tồn tại')
  return {
    id,
    config: template ? invoiceTemplateSchema.parse(template.config) : defaultInvoiceTemplate,
    html: template?.body ? { body: template.body, style: template.style as TemplateStyle } : null,
  }
}
