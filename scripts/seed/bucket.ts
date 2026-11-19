type BucketError = { message: string; status?: number; statusCode?: string; code?: string }
type BucketStorage = {
  getBucket(id: string): Promise<{ data: { public: boolean } | null; error: BucketError | null }>
  createBucket(id: string, options: { public: boolean }): Promise<{ error: BucketError | null }>
}

/** Tạo bucket riêng tư trước khi nạp file, không thay đổi bucket đã có. */
export async function ensureSeedBucket(storage: BucketStorage): Promise<void> {
  const { data, error } = await storage.getBucket('siris')
  if (data) {
    if (data.public) throw new Error('Bucket siris phải là bucket riêng tư')
    return
  }
  if (error && error.status !== 404 && error.statusCode !== '404' && error.code !== 'NoSuchBucket')
    throw new Error(`Không kiểm tra được bucket siris: ${error.message}`)
  const created = await storage.createBucket('siris', { public: false })
  if (created.error) throw new Error(`Không tạo được bucket siris: ${created.error.message}`)
}
