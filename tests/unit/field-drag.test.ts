import { describe, expect, it } from 'vitest'
import { decodeFieldDrag, encodeFieldDrag, FIELD_DRAG_MIME } from '@/modules/documents/ui/field-drag'

describe('field-drag', () => {
  it('có kiểu dữ liệu riêng', () => expect(FIELD_DRAG_MIME).toBe('application/x-siris-field'))
  it('khứ hồi đúng cho chỗ điền', () => {
    const p = { kind: 'field', key: 'ten_khach', label: 'Họ tên khách' } as const
    expect(decodeFieldDrag(encodeFieldDrag(p))).toEqual(p)
  })
  it('khứ hồi đúng cho vòng lặp', () => {
    expect(decodeFieldDrag(encodeFieldDrag({ kind: 'loop', key: 'nguoi_o' }))).toEqual({ kind: 'loop', key: 'nguoi_o' })
  })
  it.each([
    ['chuỗi rỗng', ''],
    ['JSON sai', '{abc'],
    ['không phải đối tượng', '123'],
    ['kiểu lạ', JSON.stringify({ kind: 'x', key: 'a' })],
    ['khoá không phải chuỗi', JSON.stringify({ kind: 'field', key: 5, label: 'a' })],
    ['chỗ điền thiếu nhãn', JSON.stringify({ kind: 'field', key: 'a' })],
    ['khoá rỗng', JSON.stringify({ kind: 'loop', key: '' })],
  ])('%s → null', (_n, raw) => expect(decodeFieldDrag(raw)).toBeNull())
})
