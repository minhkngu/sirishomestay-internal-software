import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { invoiceLines, invoiceTemplates, invoices, leases } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { TemplateStyle } from '../../domain/doc-template'
import {
  defaultInvoiceTemplate,
  invoiceTemplateKindOf,
  invoiceTemplateSchema,
  isInvoiceTemplateKind,
  pickInvoiceTemplateId,
  type InvoiceTemplateConfig,
  type InvoiceTemplateKind,
} from '../../domain/invoice-template'
import { recordAudit } from '@/modules/platform'

type TemplateInput = {
  name: string
  config?: unknown
  body?: string
  style?: TemplateStyle
  kind?: InvoiceTemplateKind
}
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
  if (input.kind !== undefined && !isInvoiceTemplateKind(input.kind)) throw new ValidationError('Loại mẫu không hợp lệ')
  return {
    name,
    config: config.data,
    kind: input.kind ?? ('standard' as InvoiceTemplateKind),
    ...(input.body !== undefined && { body: input.body, style: input.style ?? 'formal' }),
  }
}
/** Xem mẫu chưa lưu bằng cùng bộ dựng PDF, không tạo hóa đơn hoặc tệp xuất. */
export async function previewInvoiceTemplate(ctx: AccessContext, config: unknown): Promise<Uint8Array> {
  assertCan(ctx, 'settings')
  const validated = checked({ name: 'Xem trước', config }).config
  const { renderInvoicePdf } = await import('../pdf')
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
const SAMPLE_BASE = {
  code: 'MAU-KHONG-THANH-TOAN',
  issueDate: '2026-11-01',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  dueDate: '2026-11-05',
  facility: { name: 'Siris Residences (dữ liệu mẫu)', address: 'Địa chỉ cơ sở mẫu' },
  room: '301',
  tenant: { name: 'Nguyễn Văn An', phone: '0900000000' },
  paid: 0,
  bank: { bankBin: '970436', bankName: 'Ngân hàng mẫu', accountNumber: '123456789', accountName: 'TAI KHOAN MAU' },
}
const line = (description: string, quantity: number, unitLabel: string, unitPrice: number) => ({
  description,
  quantity,
  unitLabel,
  unitPrice,
  amount: quantity * unitPrice,
})
const SAMPLE_LINES: Record<InvoiceTemplateKind, ReturnType<typeof line>[]> = {
  standard: [
    line('Tiền phòng', 1, 'tháng', 9000000),
    line('Phí dịch vụ', 2, 'người', 200000),
    line('Điện', 100, 'kWh', 3500),
  ],
  termination: [
    line('Tiền phòng đến ngày trả phòng', 1, 'tháng', 4500000),
    line('Điện', 100, 'kWh', 3500),
    line('Phạt trả phòng trước hạn', 1, '', 500000),
    line('Hoàn tiền cọc', 1, '', -9000000),
  ],
  room_change: [
    line('Tiền phòng đến ngày chuyển', 1, 'tháng', 4500000),
    line('Điện', 100, 'kWh', 3500),
    line('Hoàn tiền cọc', 1, '', -9000000),
    line('Chuyển sang hợp đồng mới', 1, '', 4150000),
  ],
}
/** Hoá đơn mẫu theo loại, để xem thử mẫu thường, thanh lý, chuyển phòng. */
export function sampleInvoiceFor(kind: InvoiceTemplateKind) {
  const lines = SAMPLE_LINES[kind]
  return {
    ...SAMPLE_BASE,
    kind: (kind === 'standard' ? 'monthly' : 'termination') as 'monthly' | 'termination',
    lines,
    total: lines.reduce((n, l) => n + l.amount, 0),
  }
}
/** Xem mẫu HTML chưa lưu với dữ liệu mẫu (có mã QR minh hoạ). */
export async function previewInvoiceTemplateHtml(
  ctx: AccessContext,
  input: { body: string; style: TemplateStyle; kind?: InvoiceTemplateKind },
): Promise<Uint8Array> {
  assertCan(ctx, 'settings')
  if (!input.body.trim()) throw new ValidationError('Nhập nội dung mẫu')
  if (input.body.length > 200_000) throw new ValidationError('Nội dung mẫu quá dài')
  const { renderInvoiceFromTemplate } = await import('../pdf')
  return renderInvoiceFromTemplate(sampleInvoiceFor(input.kind ?? 'standard'), input, { sample: true })
}
/** Phiên bản bộ dựng bản xem; đổi số này khi cách dựng PDF thay đổi để bản xem đã lưu được dựng lại. */
export const INVOICE_PREVIEW_VERSION = 1

type TemplateRow = typeof invoiceTemplates.$inferSelect
async function renderPreview(t: Pick<TemplateRow, 'body' | 'style' | 'config' | 'kind'>): Promise<Uint8Array> {
  const pdf = await import('../pdf')
  const sample = sampleInvoiceFor(isInvoiceTemplateKind(t.kind) ? t.kind : 'standard')
  return t.body
    ? pdf.renderInvoiceFromTemplate(sample, { body: t.body, style: t.style as TemplateStyle }, { sample: true })
    : pdf.renderInvoicePdf(sample, invoiceTemplateSchema.parse(t.config), { sample: true })
}
/** Xem nhanh một mẫu hoá đơn đã lưu với dữ liệu mẫu, để chọn mẫu cho hợp đồng; mẫu cũ dựng theo khối vẫn xem được. */
export async function previewInvoiceTemplateById(db: Pick<DB, 'select'>, templateId: string): Promise<Uint8Array> {
  const [t] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, templateId))
  if (!t) throw new NotFoundError()
  return renderPreview(t)
}
/** Dựng bản xem và lưu vào mẫu; lỗi dựng không làm hỏng việc lưu mẫu (bản xem để trống, dựng lại ở lần xem sau). */
export async function storeInvoiceTemplatePreview(
  db: Pick<DB, 'select' | 'update'>,
  templateId: string,
): Promise<string | null> {
  try {
    const [t] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, templateId))
    if (!t) return null
    const base64 = Buffer.from(await renderPreview(t)).toString('base64')
    await db
      .update(invoiceTemplates)
      .set({ previewPdf: base64, previewVersion: INVOICE_PREVIEW_VERSION })
      .where(eq(invoiceTemplates.id, templateId))
    return base64
  } catch {
    return null
  }
}
/** Bản xem (base64) của mẫu: dùng lại bản đã lưu, dựng và lưu lại nếu thiếu hoặc bộ dựng đã đổi phiên bản. */
export async function getInvoiceTemplatePreview(db: DB, templateId: string): Promise<string> {
  const [t] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, templateId))
  if (!t) throw new NotFoundError()
  if (t.previewPdf && t.previewVersion === INVOICE_PREVIEW_VERSION) return t.previewPdf
  const base64 = await storeInvoiceTemplatePreview(db, templateId)
  if (base64 === null) throw new ValidationError('Không dựng được bản xem mẫu hoá đơn')
  return base64
}
/** Bản xem của mọi mẫu (id → base64) cho trang danh sách mẫu. */
export async function listInvoiceTemplatePreviews(
  db: DB,
  ctx: AccessContext,
  ids?: string[],
): Promise<Record<string, string>> {
  void ctx
  const all = await db
    .select({ id: invoiceTemplates.id })
    .from(invoiceTemplates)
    .orderBy(asc(invoiceTemplates.createdAt))
  const rows = ids ? all.filter((r) => ids.includes(r.id)) : all
  const entries = await Promise.all(
    rows.map(async (r) => [r.id, await getInvoiceTemplatePreview(db, r.id).catch(() => null)] as const),
  )
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e[1] !== null))
}
export async function listInvoiceTemplates(db: Pick<DB, 'select'>, ctx: AccessContext) {
  void ctx
  const { previewPdf, previewVersion, ...columns } = getTableColumns(invoiceTemplates)
  void previewPdf
  void previewVersion
  return db.select(columns).from(invoiceTemplates).orderBy(asc(invoiceTemplates.createdAt))
}
export async function createInvoiceTemplate(db: DB, ctx: AccessContext, input: TemplateInput) {
  assertCan(ctx, 'settings')
  const data = checked(input)
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(invoiceTemplates).values(data).returning()
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'invoice_template',
      entityId: row.id,
      summary: `Tạo mẫu hóa đơn ${row.name}`,
    })
    return row
  })
  await storeInvoiceTemplatePreview(db, created.id)
  return created
}
export async function updateInvoiceTemplate(db: DB, ctx: AccessContext, id: string, input: TemplateInput) {
  assertCan(ctx, 'settings')
  const { kind: _kind, ...data } = checked(input)
  void _kind
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invoiceTemplates)
      .set({ ...data, previewPdf: null, previewVersion: null, updatedAt: new Date() })
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
  await storeInvoiceTemplatePreview(db, updated.id)
  return updated
}
export async function setDefaultInvoiceTemplate(db: DB, ctx: AccessContext, id: string) {
  assertCan(ctx, 'settings')
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(invoiceTemplates).orderBy(asc(invoiceTemplates.id)).for('update')
    const target = rows.find((r) => r.id === id)
    if (!target) throw new NotFoundError()
    // Mặc định đặt riêng cho từng loại hoá đơn
    await tx
      .update(invoiceTemplates)
      .set({ isDefault: false })
      .where(and(eq(invoiceTemplates.isDefault, true), eq(invoiceTemplates.kind, target.kind)))
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
    .select({ invoice: invoices.invoiceTemplateId, lease: leases.invoiceTemplateId, kind: invoices.kind })
    .from(invoices)
    .innerJoin(leases, eq(leases.id, invoices.leaseId))
    .where(eq(invoices.id, invoiceId))
  if (!row) throw new NotFoundError()
  const [transfer] =
    row.kind === 'termination'
      ? await db
          .select({ id: invoiceLines.id })
          .from(invoiceLines)
          .where(and(eq(invoiceLines.invoiceId, invoiceId), sql`${invoiceLines.meta} ->> 'transfer' = 'true'`))
          .limit(1)
      : []
  const kind = invoiceTemplateKindOf(row.kind, !!transfer)
  const [leaseTemplate] = row.lease
    ? await db
        .select({ id: invoiceTemplates.id, kind: invoiceTemplates.kind })
        .from(invoiceTemplates)
        .where(eq(invoiceTemplates.id, row.lease))
    : []
  const defaults = Object.fromEntries(
    (await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.isDefault, true))).map((t) => [t.kind, t.id]),
  ) as Partial<Record<InvoiceTemplateKind, string>>
  const id = pickInvoiceTemplateId({ invoice: row.invoice, lease: leaseTemplate ?? null, kind, defaults })
  const [template] = id ? await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id)) : []
  if (id && !template) throw new ValidationError('Mẫu hóa đơn đã chọn không tồn tại')
  return {
    id,
    config: template ? invoiceTemplateSchema.parse(template.config) : defaultInvoiceTemplate,
    html: template?.body ? { body: template.body, style: template.style as TemplateStyle } : null,
  }
}
