import { describe, expect, it, vi } from 'vitest'
import { ensureSeedBucket } from '../../../scripts/seed/bucket'

describe('ensureSeedBucket', () => {
  it('creates a private bucket when it does not exist', async () => {
    const storage = {
      getBucket: vi.fn().mockResolvedValue({
        data: null,
        error: { status: 400, statusCode: '404', code: 'NoSuchBucket', message: 'not found' },
      }),
      createBucket: vi.fn().mockResolvedValue({ data: { name: 'siris' }, error: null }),
    }
    await ensureSeedBucket(storage)
    expect(storage.createBucket).toHaveBeenCalledWith('siris', { public: false })
  })
  it('reports a failure to create the bucket', async () => {
    const storage = {
      getBucket: vi.fn().mockResolvedValue({ data: null, error: { status: 404, message: 'not found' } }),
      createBucket: vi.fn().mockResolvedValue({ data: null, error: { message: 'quota exceeded' } }),
    }
    await expect(ensureSeedBucket(storage)).rejects.toThrow('quota exceeded')
  })
  it('reuses an existing private bucket', async () => {
    const storage = {
      getBucket: vi.fn().mockResolvedValue({ data: { public: false }, error: null }),
      createBucket: vi.fn(),
    }
    await ensureSeedBucket(storage)
    expect(storage.createBucket).not.toHaveBeenCalled()
  })
  it('rejects an existing public bucket and does not change it', async () => {
    const storage = {
      getBucket: vi.fn().mockResolvedValue({ data: { public: true }, error: null }),
      createBucket: vi.fn(),
    }
    await expect(ensureSeedBucket(storage)).rejects.toThrow('riêng tư')
    expect(storage.createBucket).not.toHaveBeenCalled()
  })
  it('reports access errors instead of trying to create a bucket', async () => {
    const storage = {
      getBucket: vi.fn().mockResolvedValue({ data: null, error: { status: 403, message: 'denied' } }),
      createBucket: vi.fn(),
    }
    await expect(ensureSeedBucket(storage)).rejects.toThrow('denied')
    expect(storage.createBucket).not.toHaveBeenCalled()
  })
})
