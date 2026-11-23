import { describe, expect, it, vi } from 'vitest'
import { buildHandoverPhotoTasks, uploadLeasePhotos } from '@/features/contracts/lease-photo-retry'

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
  it('gắn ảnh vào đúng mục bàn giao và giữ ID mục khi tải lại', async () => {
    const tasks = buildHandoverPhotoTasks(
      'lease-1',
      ['hợp đồng'],
      ['A', 'B'],
      { A: ['ảnh A'], B: ['ảnh B'], REMOVED: ['không gửi'] },
      [
        { assetCode: 'A', itemId: 'item-a' },
        { assetCode: 'B', itemId: 'item-b' },
      ],
    )
    expect(tasks).toEqual([
      { file: 'hợp đồng', ownerType: 'lease_photo', ownerId: 'lease-1' },
      { file: 'ảnh A', ownerType: 'handover_photo', ownerId: 'item-a' },
      { file: 'ảnh B', ownerType: 'handover_photo', ownerId: 'item-b' },
    ])
    const failed = await uploadLeasePhotos('lease-1', tasks, async (task) => {
      if (task.file === 'ảnh B') throw new Error('mạng')
    })
    expect(failed).toEqual([{ file: 'ảnh B', ownerType: 'handover_photo', ownerId: 'item-b' }])
  })
  it('giữ ảnh để thử lại nếu không tìm được mục bàn giao', () => {
    expect(buildHandoverPhotoTasks('lease-1', [], ['A'], { A: ['ảnh'] }, [])).toEqual([
      { file: 'ảnh', ownerType: 'handover_photo', ownerId: null },
    ])
  })
  it('mã tài sản trùng tên thuộc tính mặc định không tạo ảnh giả', () => {
    expect(buildHandoverPhotoTasks('lease-1', [], ['toString'], {}, [])).toEqual([])
  })
})
