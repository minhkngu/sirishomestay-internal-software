import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

describe('next.config', () => {
  it('nâng giới hạn body server action để nhập được file Excel lớn', () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe('12mb')
  })
})
