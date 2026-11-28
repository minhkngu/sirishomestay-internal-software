import { describe, expect, it } from 'vitest'
import {
  defaultInvoiceTemplate,
  invoiceTemplateKindOf,
  invoiceTemplateSchema,
  pickInvoiceTemplateId,
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
  it('hoá đơn thanh lý có dòng chuyển sang hợp đồng mới là loại chuyển phòng', () => {
    expect(invoiceTemplateKindOf('monthly', false)).toBe('standard')
    expect(invoiceTemplateKindOf('first', true)).toBe('standard')
    expect(invoiceTemplateKindOf('termination', false)).toBe('termination')
    expect(invoiceTemplateKindOf('termination', true)).toBe('room_change')
  })
  it('chọn mẫu theo loại: mẫu của hoá đơn, mẫu hợp đồng cùng loại, mặc định của loại, mặc định hoá đơn thường', () => {
    const defaults = { standard: 'tl-thuong', termination: 'tl-thanh-ly' }
    const lease = { id: 'hd', kind: 'standard' }
    expect(pickInvoiceTemplateId({ invoice: 'rieng', lease, kind: 'termination', defaults })).toBe('rieng')
    expect(pickInvoiceTemplateId({ invoice: null, lease, kind: 'standard', defaults })).toBe('hd')
    // Mẫu hợp đồng là mẫu hoá đơn thường: hoá đơn thanh lý không dùng nó
    expect(pickInvoiceTemplateId({ invoice: null, lease, kind: 'termination', defaults })).toBe('tl-thanh-ly')
    // Loại chuyển phòng chưa có mặc định: dùng mặc định hoá đơn thường
    expect(pickInvoiceTemplateId({ invoice: null, lease: null, kind: 'room_change', defaults })).toBe('tl-thuong')
    expect(pickInvoiceTemplateId({ invoice: null, lease: null, kind: 'standard', defaults: {} })).toBeNull()
  })
})
