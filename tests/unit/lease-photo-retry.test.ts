import { describe, expect, it, vi } from 'vitest'
import { uploadLeasePhotos } from '@/features/contracts/lease-photo-retry'

describe('uploadLeasePhotos', () => {
  it('chỉ thử lại ảnh lỗi và dùng lại ID hợp đồng', async () => {
    const upload = vi.fn(async (file: string, id: string) => {
      if (file === 'b' && upload.mock.calls.length === 2) throw new Error('network')
      expect(id).toBe('lease-1')
    })
    const failed = await uploadLeasePhotos('lease-1', ['a', 'b', 'c'], upload)
    expect(failed).toEqual(['b'])
    expect(await uploadLeasePhotos('lease-1', failed, upload)).toEqual([])
    expect(upload.mock.calls.map(([file]) => file)).toEqual(['a', 'b', 'c', 'b'])
  })
})
