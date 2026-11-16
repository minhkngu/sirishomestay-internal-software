export interface StorageAdapter {
  createUploadUrl(key: string, contentType: string, maxBytes: number): Promise<string>
  createDownloadUrl(key: string, expiresSec: number): Promise<string>
  delete(key: string): Promise<void>
}
