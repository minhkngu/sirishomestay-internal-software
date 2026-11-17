/** Giữ lại từng ảnh lỗi để thử lại với hợp đồng đã tạo. */
export async function uploadLeasePhotos<T>(leaseId: string, photos: T[], upload: (photo: T, leaseId: string) => Promise<unknown>): Promise<T[]> {
  const failed: T[] = []
  for (const photo of photos) {
    try { await upload(photo, leaseId) } catch { failed.push(photo) }
  }
  return failed
}
