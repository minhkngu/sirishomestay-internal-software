import { describe, it, expect } from 'vitest'
import { IMPORT_TARGETS, suggestMapping } from '@/features/import/targets'
import { validateRows } from '@/features/import/validate'

describe('suggestMapping', () => {
  it('ghép cột theo tiêu đề tiếng Việt có dấu', () => {
    const m = suggestMapping(['Số điện thoại', 'Họ tên', 'Hết hạn visa', 'Cột lạ'], 'tenants')
    expect(m.phone).toBe('Số điện thoại')
    expect(m.fullName).toBe('Họ tên')
    expect(m.visaExpiry).toBe('Hết hạn visa')
    expect(m.passportNumber).toBeNull()
  })
  it('mọi trường của mục tiêu đều có mặt trong kết quả', () => {
    const m = suggestMapping([], 'rooms')
    expect(Object.keys(m).sort()).toEqual(IMPORT_TARGETS.rooms.fields.map((f) => f.key).sort())
  })
})

describe('validateRows tenants', () => {
  const mapping = { kind: 'k', facilityCode: 'c', fullName: 'n', phone: 'p', passportNumber: 'pp', visaExpiry: 'v', idNumber: 'id' }
  const row = (n: number, o: Record<string, unknown>) => ({ __row: n, ...o })

  it('hiểu ngày dd/mm/yyyy và số ngày Excel; 05/03/2027 là 5 tháng 3', () => {
    const { valid, errors } = validateRows('tenants', [
      row(2, { k: 'Nước ngoài', c: 'A', n: 'John', p: '+1 415 555 0100', pp: 'X1', v: '05/03/2027' }),
      row(3, { k: 'foreign', c: 'A', n: 'Jane', p: '+1 415 555 0101', pp: 'X2', v: 46451 }),
    ], mapping)
    expect(errors).toEqual([])
    expect(valid.map((r) => r.target === 'tenants' && r.data.kind === 'foreign' && r.data.visaExpiry)).toEqual(['2027-03-05', '2027-03-05'])
  })

  it('khách nước ngoài thiếu passport → lỗi đúng dòng và đúng trường', () => {
    const { valid, errors } = validateRows('tenants', [
      row(2, { k: 'Nước ngoài', c: 'A', n: 'John', p: '+1 415 555 0100', pp: 'X1' }),
      row(3, { k: 'Nước ngoài', c: 'A', n: 'Jane', p: '+1 415 555 0101' }),
    ], mapping)
    expect(valid).toHaveLength(1)
    expect(errors).toEqual([{ row: 3, field: 'passportNumber', message: expect.any(String) }])
  })

  it('loại khách lạ và thiếu mã cơ sở đều báo lỗi', () => {
    const { errors } = validateRows('tenants', [row(2, { k: 'abc', c: 'A', n: 'X' }), row(3, { k: 'vn', n: 'Y', p: '0901234567', id: '012345678901' })], mapping)
    expect(errors.map((e) => [e.row, e.field])).toEqual([[2, 'kind'], [3, 'facilityCode']])
  })

  it('khôi phục số 0 đầu của số điện thoại/CCCD khi ô Excel là số', () => {
    const { valid, errors } = validateRows('tenants', [row(2, { k: 'vn', c: 'A', n: 'X', p: 901234567, id: 12345678901 })], mapping)
    expect(errors).toEqual([])
    const d = valid[0].target === 'tenants' ? valid[0].data : null
    expect(d?.phone).toBe('+84901234567')
    expect(d?.kind === 'vietnamese' && d.idNumber).toBe('012345678901')
  })
})

describe('validateRows rooms', () => {
  const mapping = { facilityCode: 'a', roomCode: 'b', listPrice: 'c', capacity: 'd' }
  it('đọc giá dạng số hoặc chuỗi có dấu chấm; thiếu mã phòng → lỗi', () => {
    const { valid, errors } = validateRows('rooms', [
      { __row: 2, a: 'A', b: '101', c: '5.500.000', d: 2 },
      { __row: 3, a: 'A', b: '', c: 1 },
    ], mapping)
    expect(valid[0].target === 'rooms' && valid[0].data.listPrice).toBe(5500000)
    expect(errors).toEqual([{ row: 3, field: 'roomCode', message: expect.any(String) }])
  })
})
