import { describe, expect, it, vi } from 'vitest'

const remove = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ storage: { from: () => ({ remove }) } }) }))
import { SupabaseStorage } from '@/server/storage/supabase'

describe('SupabaseStorage.delete', () => {
  it('báo lỗi khi kho lưu trữ từ chối xoá', async () => {
    remove.mockResolvedValueOnce({ error: { message: 'storage unavailable' } })
    await expect(new SupabaseStorage().delete('contract/file')).rejects.toThrow('storage unavailable')
  })
  it('hoàn tất khi kho xác nhận xoá', async () => {
    remove.mockResolvedValueOnce({ error: null })
    await expect(new SupabaseStorage().delete('contract/file')).resolves.toBeUndefined()
    expect(remove).toHaveBeenLastCalledWith(['contract/file'])
  })
})
