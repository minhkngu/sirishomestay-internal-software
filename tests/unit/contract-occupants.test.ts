import { describe, expect, it } from 'vitest'
import { replaceSigner } from '@/features/contracts/contract-occupants'

describe('replaceSigner', () => {
  it('thay người ký nhưng giữ những người thêm chủ động', () => {
    expect(replaceSigner('b', ['c'])).toEqual(['b', 'c'])
    expect(replaceSigner('b', ['a', 'c'])).toEqual(['b', 'a', 'c'])
    expect(replaceSigner('c', ['c'])).toEqual(['c'])
  })
})
