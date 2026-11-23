import { describe, expect, it, vi } from 'vitest'
import { readUserId } from '@/lib/supabase/auth-user'

describe('readUserId', () => {
  const client = (r: unknown) => ({
    auth: {
      getClaims: vi.fn().mockResolvedValue(r),
      getUser: vi.fn(() => {
        throw new Error('không được gọi getUser')
      }),
    },
  })
  it('trả sub khi token hợp lệ', async () => {
    expect(await readUserId(client({ data: { claims: { sub: 'u1' } }, error: null }) as never)).toBe('u1')
  })
  it('null khi có lỗi', async () => {
    expect(await readUserId(client({ data: null, error: new Error('invalid JWT') }) as never)).toBeNull()
  })
  it('null khi chưa đăng nhập', async () => {
    expect(await readUserId(client({ data: null, error: null }) as never)).toBeNull()
  })
  it('null khi getClaims ném lỗi', async () => {
    expect(
      await readUserId({ auth: { getClaims: vi.fn().mockRejectedValue(new Error('network')) } } as never),
    ).toBeNull()
  })
})
