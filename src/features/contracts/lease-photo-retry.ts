export type PendingPhoto<T> = { file: T; ownerType: 'lease_photo' | 'handover_photo'; ownerId: string | null }
export function assetEntry<T>(values: Record<string, T>, code: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(values, code) ? values[code] : undefined
}

export function buildHandoverPhotoTasks<T>(leaseId: string, contractPhotos: T[], assetCodes: string[], assetPhotos: Record<string, T[]>, items: Array<{ assetCode: string; itemId: string }>): PendingPhoto<T>[] {
  const ids = new Map(items.map(item => [item.assetCode, item.itemId]))
  return [
    ...contractPhotos.map(file => ({ file, ownerType: 'lease_photo' as const, ownerId: leaseId })),
    ...assetCodes.flatMap(code => (assetEntry(assetPhotos, code) ?? []).map(file => ({ file, ownerType: 'handover_photo' as const, ownerId: ids.get(code) ?? null }))),
  ]
}

/** Giữ lại từng ảnh lỗi để thử lại với hợp đồng đã tạo. */
export async function uploadLeasePhotos<T>(leaseId: string, photos: T[], upload: (photo: T, leaseId: string) => Promise<unknown>): Promise<T[]> {
  const failed: T[] = []
  for (const photo of photos) {
    try { await upload(photo, leaseId) } catch { failed.push(photo) }
  }
  return failed
}
