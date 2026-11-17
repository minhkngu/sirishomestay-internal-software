import { supabaseAdmin } from '@/lib/supabase/admin'
import type { StorageAdapter } from './types'

const BUCKET = 'siris'

/** Supabase Storage (bucket riêng tư `siris`) — dùng ở giai đoạn thử. Kích thước tệp được giới hạn ở phía trình duyệt. */
export class SupabaseStorage implements StorageAdapter {
  private bucket() {
    return supabaseAdmin().storage.from(BUCKET)
  }
  async createUploadUrl(key: string, _contentType: string) {
    const { data, error } = await this.bucket().createSignedUploadUrl(key)
    if (error || !data) throw new Error(`Không tạo được URL tải lên: ${error?.message}`)
    return data.signedUrl
  }
  async createDownloadUrl(key: string, expiresSec: number, downloadName?: string) {
    const { data, error } = await this.bucket().createSignedUrl(key, expiresSec, downloadName ? { download: downloadName } : undefined)
    if (error || !data) throw new Error(`Không tạo được URL tải xuống: ${error?.message}`)
    return data.signedUrl
  }
  async delete(key: string) {
    await this.bucket().remove([key])
  }
  async read(key: string): Promise<ArrayBuffer> {
    const { data, error } = await this.bucket().download(key)
    if (error || !data) throw new Error(`Không đọc được tệp: ${error?.message}`)
    return data.arrayBuffer()
  }
  async write(key: string, data: ArrayBuffer | Uint8Array, contentType: string) {
    const { error } = await this.bucket().upload(key, data instanceof Uint8Array ? data : new Uint8Array(data), { contentType, upsert: true })
    if (error) throw new Error(`Không lưu được tệp: ${error.message}`)
  }
}
