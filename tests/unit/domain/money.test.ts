import { describe, it, expect } from 'vitest'
import { formatVND, numberToVietnameseWords, parseMoneyInput } from '@/domain/money'

describe('formatVND', () => {
  it('dùng dấu chấm phân tách hàng nghìn', () => {
    expect(formatVND(1500000)).toBe('1.500.000')
    expect(formatVND(0)).toBe('0')
    expect(formatVND(-2500)).toBe('-2.500')
  })
})

describe('parseMoneyInput', () => {
  it('bỏ dấu phân cách và phần lẻ', () => {
    expect(parseMoneyInput('15000000')).toBe('15000000')
    expect(parseMoneyInput('15.000.000')).toBe('15000000')
    expect(parseMoneyInput('15,000,000')).toBe('15000000')
    expect(parseMoneyInput('15.000.000,50')).toBe('15000000')
    expect(parseMoneyInput(' 1 500 000 ')).toBe('1500000')
  })
  it('giữ dấu âm và chuỗi rỗng', () => {
    expect(parseMoneyInput('-1.500.000')).toBe('-1500000')
    expect(parseMoneyInput('')).toBe('')
    expect(parseMoneyInput('-')).toBe('-')
    expect(parseMoneyInput('abc')).toBe('')
  })
})

describe('numberToVietnameseWords', () => {
  it.each([
    [1500000, 'Một triệu năm trăm nghìn đồng'],
    [2005000, 'Hai triệu không trăm linh năm nghìn đồng'],
    [9000000, 'Chín triệu đồng'],
    [11080000, 'Mười một triệu không trăm tám mươi nghìn đồng'],
    [1000005, 'Một triệu không trăm linh năm đồng'],
    [21, 'Hai mươi mốt đồng'],
    [15, 'Mười lăm đồng'],
    [25, 'Hai mươi lăm đồng'],
    [0, 'Không đồng'],
    [3500000000, 'Ba tỷ năm trăm triệu đồng'],
  ])('%i', (n, words) => {
    expect(numberToVietnameseWords(n)).toBe(words)
  })
  it('số âm có chữ "Âm"', () => {
    expect(numberToVietnameseWords(-2500)).toBe('Âm hai nghìn năm trăm đồng')
  })
})
