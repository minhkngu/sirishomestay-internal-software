import { describe, expect, it } from 'vitest'
import { resolveSupabaseKey } from '@/lib/supabase/config'

describe('resolveSupabaseKey', () => {
  it('accepts the publishable key when the legacy anon key is absent', () => {
    expect(resolveSupabaseKey(undefined, 'sb_publishable_example')).toBe('sb_publishable_example')
  })
  it('keeps using the anon key when both are configured', () => {
    expect(resolveSupabaseKey('legacy', 'new')).toBe('legacy')
  })
})
