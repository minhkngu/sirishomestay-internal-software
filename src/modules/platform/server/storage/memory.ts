import type { StorageAdapter } from './types'

/** Adapter trong bộ nhớ, dùng cho test và khi chưa cấu hình R2. */
export class MemoryStorage implements StorageAdapter {
  deleted: string[] = []
  async createUploadUrl(key: string, contentType: string, maxBytes: number) {
    return `memory://upload/${key}?type=${encodeURIComponent(contentType)}&max=${maxBytes}`
  }
  async createDownloadUrl(key: string, expiresSec: number, downloadName?: string) {
    return `memory://download/${key}?expires=${expiresSec}${downloadName ? `&download=${encodeURIComponent(downloadName)}` : ''}`
  }
  private blobs = new Map<string, Uint8Array>()
  async delete(key: string) {
    this.deleted.push(key)
    this.blobs.delete(key)
  }
  async read(key: string): Promise<ArrayBuffer> {
    const b = this.blobs.get(key)
    if (!b) throw new Error(`Không có tệp ${key}`)
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  }
  async write(key: string, data: ArrayBuffer | Uint8Array) {
    this.blobs.set(key, data instanceof Uint8Array ? data : new Uint8Array(data))
  }
}
