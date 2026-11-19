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
