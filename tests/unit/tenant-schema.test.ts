import { describe, it, expect } from 'vitest'
import { tenantInput } from '@/server/tenants/schemas'

const FAC = '11111111-1111-4111-8111-111111111111'

function errorsOf(input: unknown): Record<string, string> {
  const r = tenantInput.safeParse(input)
  if (r.success) return {}
  const out: Record<string, string> = {}
  for (const i of r.error.issues) out[String(i.path[0])] ??= i.message
  return out
}

describe('tenantInput', () => {
  it('khách nước ngoài thiếu passport → lỗi passportNumber', () => {
    expect(
      errorsOf({ kind: 'foreign', homeFacilityId: FAC, fullName: 'John', phone: '+1 415 555 0100' }),
    ).toHaveProperty('passportNumber')
  })
  it('chuẩn hoá số điện thoại và ngày', () => {
    const r = tenantInput.parse({
      kind: 'foreign',
      homeFacilityId: FAC,
      fullName: 'John',
      phone: '0901 234 567',
      passportNumber: ' ab 123 ',
      visaExpiry: '05/03/2027',
    })
    expect(r.phone).toBe('+84901234567')
    expect(r.kind === 'foreign' && r.passportNumber).toBe('AB123')
    expect(r.kind === 'foreign' && r.visaExpiry).toBe('2027-03-05')
  })
  it('số điện thoại sai → "Số điện thoại không hợp lệ"', () => {
    expect(
      errorsOf({ kind: 'vietnamese', homeFacilityId: FAC, fullName: 'A', phone: '123', idNumber: '012345678901' })
        .phone,
    ).toBe('Số điện thoại không hợp lệ')
  })
  it('CCCD phải đủ 12 chữ số', () => {
    expect(
      errorsOf({
        kind: 'vietnamese',
        homeFacilityId: FAC,
        fullName: 'A',
        phone: '0901234567',
        idNumber: '12345678901',
      }),
    ).toHaveProperty('idNumber')
  })
  it('công ty: phone tuỳ chọn, mã số thuế 10 hoặc 13 số (10-3)', () => {
    expect(errorsOf({ kind: 'company', homeFacilityId: FAC, companyName: 'C', taxCode: '0100000001' })).toEqual({})
    const r = tenantInput.parse({
      kind: 'company',
      homeFacilityId: FAC,
      companyName: 'C',
      taxCode: '0100000001-001',
      phone: '',
    })
    expect(r.kind === 'company' && r.taxCode).toBe('0100000001-001')
    expect(r.phone).toBeNull()
    expect(errorsOf({ kind: 'company', homeFacilityId: FAC, companyName: 'C', taxCode: '12345' })).toHaveProperty(
      'taxCode',
    )
  })
  it('email sai định dạng bị từ chối', () => {
    expect(
      errorsOf({ kind: 'company', homeFacilityId: FAC, companyName: 'C', taxCode: '0100000001', email: 'abc' }),
    ).toHaveProperty('email')
  })
})
