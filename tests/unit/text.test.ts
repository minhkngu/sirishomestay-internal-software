import { describe, it, expect } from 'vitest'
import { removeDiacritics, buildSearchText } from '@/lib/text'

describe('text', () => {
  it('removeDiacritics xử lý đ/Đ', () => {
    expect(removeDiacritics('Nguyễn Văn Đức')).toBe('Nguyen Van Duc')
    expect(removeDiacritics('đ')).toBe('d')
  })
  it('buildSearchText bỏ dấu, gộp khoảng trắng, thêm dạng 0xxxxxxxxx', () => {
    expect(buildSearchText(['Nguyễn  Văn A', '+84901234567'])).toBe('nguyen van a +84901234567 0901234567')
  })
  it('buildSearchText bỏ phần rỗng/null', () => {
    expect(buildSearchText([null, undefined, '  ', 'ABC'])).toBe('abc')
  })
})
