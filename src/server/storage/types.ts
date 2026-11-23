export interface StorageAdapter {
  createUploadUrl(key: string, contentType: string, maxBytes: number): Promise<string>
  createDownloadUrl(key: string, expiresSec: number, downloadName?: string): Promise<string>
  delete(key: string): Promise<void>
  /** Đọc/ghi phía server (đọc mẫu Word, lưu bản xuất). */
  read(key: string): Promise<ArrayBuffer>
  write(key: string, data: ArrayBuffer | Uint8Array, contentType: string): Promise<void>
}
