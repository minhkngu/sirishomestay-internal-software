import { describe, expect, it } from 'vitest'
import {
  defaultInvoiceTemplate,
  invoiceTemplateSchema,
  resolveInvoiceTemplateId,
} from '@/modules/documents/domain/invoice-template'

describe('mẫu hóa đơn', () => {
  it('ưu tiên mẫu của kỳ, rồi mẫu hợp đồng, rồi mẫu mặc định', () => {
    expect(resolveInvoiceTemplateId('ky', 'hop-dong', 'mac-dinh')).toBe('ky')
    expect(resolveInvoiceTemplateId(null, 'hop-dong', 'mac-dinh')).toBe('hop-dong')
    expect(resolveInvoiceTemplateId(null, null, 'mac-dinh')).toBe('mac-dinh')
  })
  it('bắt buộc đầy đủ phần hóa đơn không trùng và màu hợp lệ', () => {
    expect(invoiceTemplateSchema.safeParse(defaultInvoiceTemplate).success).toBe(true)
    expect(invoiceTemplateSchema.safeParse({ ...defaultInvoiceTemplate, color: 'red' }).success).toBe(false)
    expect(invoiceTemplateSchema.safeParse({ ...defaultInvoiceTemplate, sections: ['header', 'header'] }).success).toBe(
      false,
    )
  })
})
