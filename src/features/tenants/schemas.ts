import { z } from 'zod'
import { normalizePhone } from '@/domain/phone'
import { parseFlexibleDate } from '@/domain/dates'

const optText = z.string().trim().nullish().transform((v) => (v ? v : null))
const reqText = (msg: string) => z.string({ error: msg }).trim().min(1, msg)

const optDate = z
  .union([z.string(), z.number(), z.date()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null
    const d = parseFlexibleDate(v)
    if (!d) {
      ctx.addIssue({ code: 'custom', message: 'Ngày không hợp lệ' })
      return z.NEVER
    }
    return d
  })

const phoneValue = (v: string, ctx: z.RefinementCtx) => {
  const n = normalizePhone(v)
  if (!n) {
    ctx.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ' })
    return z.NEVER
  }
  return n
}
const requiredPhone = z.string({ error: 'Nhập số điện thoại' }).trim().min(1, 'Nhập số điện thoại').transform(phoneValue)
const optionalPhone = z
  .string()
  .trim()
  .nullish()
  .transform((v, ctx) => (v ? phoneValue(v, ctx) : null))

const email = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, 'Email không hợp lệ')

const common = {
  homeFacilityId: z.string({ error: 'Chọn cơ sở' }).uuid('Chọn cơ sở'),
  email,
  note: z.string().trim().nullish().transform((v) => v ?? ''),
}

export const foreignSchema = z.object({
  kind: z.literal('foreign'),
  ...common,
  phone: requiredPhone,
  fullName: reqText('Nhập họ tên'),
  nationality: optText,
  passportNumber: z
    .string({ error: 'Nhập số passport' })
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine((v) => v.length > 0, 'Nhập số passport'),
  passportExpiry: optDate,
  visaType: optText,
  visaExpiry: optDate,
  dateOfBirth: optDate,
})

export const vietnameseSchema = z.object({
  kind: z.literal('vietnamese'),
  ...common,
  phone: requiredPhone,
  fullName: reqText('Nhập họ tên'),
  idNumber: z
    .string({ error: 'Nhập số CCCD' })
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => /^\d{12}$/.test(v), 'Số CCCD phải gồm đúng 12 chữ số'),
  idIssueDate: optDate,
  idIssuePlace: optText,
  dateOfBirth: optDate,
  permanentAddress: optText,
})

export const companySchema = z.object({
  kind: z.literal('company'),
  ...common,
  phone: optionalPhone,
  companyName: reqText('Nhập tên công ty'),
  taxCode: z
    .string({ error: 'Nhập mã số thuế' })
    .transform((v) => v.replace(/[\s.]/g, ''))
    .transform((v, ctx) => {
      const digits = v.replace(/-/g, '')
      if (!/^\d+$/.test(digits) || (digits.length !== 10 && digits.length !== 13)) {
        ctx.addIssue({ code: 'custom', message: 'Mã số thuế phải gồm 10 hoặc 13 chữ số' })
        return z.NEVER
      }
      return digits.length === 13 ? `${digits.slice(0, 10)}-${digits.slice(10)}` : digits
    }),
  companyAddress: optText,
  representative: optText,
  contactPerson: optText,
})

export const tenantInput = z.discriminatedUnion('kind', [foreignSchema, vietnameseSchema, companySchema])

export type TenantInput = z.output<typeof tenantInput>
