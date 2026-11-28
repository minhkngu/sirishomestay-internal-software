import { z } from 'zod'

export const invoiceSections = ['header', 'customer', 'charges', 'total', 'payment', 'footer'] as const
export type InvoiceSection = (typeof invoiceSections)[number]
export const invoiceSectionLabels: Record<InvoiceSection, string> = {
  header: 'Tiêu đề và thương hiệu',
  customer: 'Thông tin khách',
  charges: 'Bảng khoản thu',
  total: 'Tổng tiền',
  payment: 'Thông tin thanh toán',
  footer: 'Chân trang',
}
export const invoiceTemplateSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  brand: z.string().max(100),
  title: z.string().max(100),
  footer: z.string().max(500),
  logo: z
    .string()
    .max(400_000)
    .refine((v) => !v || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(v)),
  sections: z
    .array(z.enum(invoiceSections))
    .length(invoiceSections.length)
    .refine((s) => new Set(s).size === invoiceSections.length),
  hidden: z
    .array(z.enum(invoiceSections))
    .refine((s) => new Set(s).size === s.length && !s.includes('charges') && !s.includes('total')),
})
export type InvoiceTemplateConfig = z.infer<typeof invoiceTemplateSchema>
export const defaultInvoiceTemplate: InvoiceTemplateConfig = {
  color: '#0E9F6E',
  brand: 'SIRIS',
  title: '',
  footer: '',
  logo: '',
  sections: [...invoiceSections],
  hidden: [],
}
export function resolveInvoiceTemplateId(invoice: string | null, lease: string | null, fallback: string | null) {
  return invoice ?? lease ?? fallback
}

/** Loại hoá đơn có mẫu riêng: hoá đơn thường (tháng, kỳ đầu, lập tay), thanh lý, chuyển phòng. */
export const INVOICE_TEMPLATE_KINDS = ['standard', 'termination', 'room_change'] as const
export type InvoiceTemplateKind = (typeof INVOICE_TEMPLATE_KINDS)[number]
export const INVOICE_TEMPLATE_KIND_LABELS: Record<InvoiceTemplateKind, string> = {
  standard: 'Hoá đơn thường',
  termination: 'Hoá đơn thanh lý',
  room_change: 'Hoá đơn chuyển phòng',
}
export const isInvoiceTemplateKind = (v: unknown): v is InvoiceTemplateKind =>
  (INVOICE_TEMPLATE_KINDS as readonly unknown[]).includes(v)

/** Hoá đơn dùng mẫu loại nào: thanh lý có dòng chuyển sang hợp đồng mới là chuyển phòng. */
export function invoiceTemplateKindOf(invoiceKind: string, hasTransferLine: boolean): InvoiceTemplateKind {
  return invoiceKind === 'termination' ? (hasTransferLine ? 'room_change' : 'termination') : 'standard'
}

/**
 * Mẫu áp cho hoá đơn: mẫu chọn riêng cho hoá đơn; mẫu của hợp đồng chỉ khi cùng loại; mẫu mặc định của loại;
 * chưa có mẫu mặc định của loại thì dùng mẫu mặc định hoá đơn thường.
 */
export function pickInvoiceTemplateId(input: {
  invoice: string | null
  lease: { id: string; kind: string } | null
  kind: InvoiceTemplateKind
  defaults: Partial<Record<InvoiceTemplateKind, string>>
}): string | null {
  return (
    input.invoice ??
    (input.lease && input.lease.kind === input.kind ? input.lease.id : null) ??
    input.defaults[input.kind] ??
    input.defaults.standard ??
    null
  )
}
