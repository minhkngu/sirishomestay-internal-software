import { describe, expect, it } from 'vitest'
import { TEMPLATE_FIELDS } from '@/domain/template-fields'
import { fieldGroups, fieldPlacement } from '@/features/templates/components/field-palette'

describe('fieldGroups', () => {
  const g = fieldGroups('lease')
  it('lease có hai nhóm vòng lặp với đúng trường con', () => {
    expect(g.loops.map((l) => l.key).sort()).toEqual(['nguoi_o', 'phi_dich_vu'])
    expect(g.loops.find((l) => l.key === 'nguoi_o')!.fields.map((f) => f.key)).toEqual(['ho_ten', 'giay_to'])
    expect(g.loops.find((l) => l.key === 'phi_dich_vu')!.fields.map((f) => f.key)).toEqual(['ten', 'don_vi', 'so_luong', 'don_gia'])
  })
  it('chỗ điền thường không chứa khoá của vòng lặp', () => {
    const keys = g.fields.map((f) => f.key)
    expect(keys).not.toContain('nguoi_o')
    expect(keys).not.toContain('phi_dich_vu')
  })
  it('mọi khoá của lease xuất hiện đúng một lần', () => {
    const all = [...g.fields.map((f) => f.key), ...g.loops.map((l) => l.key)]
    expect(all.sort()).toEqual(TEMPLATE_FIELDS.lease.map((f) => f.key).sort())
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('fieldPlacement', () => {
  const g = fieldGroups('lease')
  it('chỗ điền thường chèn được ở đoạn văn, không chèn được vào hàng lặp', () => {
    expect(fieldPlacement(g, 'ten_khach', null)).toBeNull()
    expect(fieldPlacement(g, 'ten_khach', 'nguoi_o')).toContain('Hàng lặp')
  })
  it('trường con của vòng lặp chỉ chèn được trong đúng hàng lặp', () => {
    expect(fieldPlacement(g, 'ho_ten', 'nguoi_o')).toBeNull()
    expect(fieldPlacement(g, 'ho_ten', null)).toContain('hàng lặp')
    expect(fieldPlacement(g, 'ho_ten', 'phi_dich_vu')).toContain('hàng lặp')
  })
  it('khoá lạ bị từ chối', () => expect(fieldPlacement(g, 'khong_co', null)).toContain('không có'))
})
