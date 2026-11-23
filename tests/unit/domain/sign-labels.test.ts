import { describe, expect, it } from 'vitest'
import { signStatusLabel } from '@/domain/sign-labels'

describe('nhãn trạng thái ký', () => {
  it('chỉ hợp đồng đã ký mới hiện "Đã ký"', () => {
    expect(signStatusLabel('signed')).toBe('Đã ký')
  })
  it('nháp và đã xuất đều hiện "Chưa ký"', () => {
    expect(signStatusLabel('draft')).toBe('Chưa ký')
    expect(signStatusLabel('exported')).toBe('Chưa ký')
  })
  it('giá trị lạ hoặc rỗng hiện "Chưa ký"', () => {
    expect(signStatusLabel('')).toBe('Chưa ký')
  })
})
