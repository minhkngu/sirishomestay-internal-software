import type { StorageAdapter } from './types'

/** Adapter trong bộ nhớ, dùng cho test và khi chưa cấu hình R2. */
export class MemoryStorage implements StorageAdapter {
  deleted: string[] = []
  async createUploadUrl(key: string, contentType: string, maxBytes: number) {
    return `memory://upload/${key}?type=${encodeURIComponent(contentType)}&max=${maxBytes}`
  }
  async createDownloadUrl(key: string, expiresSec: number) {
    return `memory://download/${key}?expires=${expiresSec}`
  }
  async delete(key: string) {
    this.deleted.push(key)
  }
}
