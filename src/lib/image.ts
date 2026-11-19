'use client'

import imageCompression from 'browser-image-compression'

async function toBlob(file: File, maxSide: number, quality: number): Promise<Blob> {
  const opts = {
    maxWidthOrHeight: maxSide,
    initialQuality: quality,
    useWebWorker: true,
    fileType: 'image/webp' as const,
  }
  try {
    return await imageCompression(file, opts)
  } catch {
    // Trình duyệt không xuất được WebP: dùng JPEG
    return imageCompression(file, { ...opts, fileType: 'image/jpeg' })
  }
}

/** Nén ảnh trên trình duyệt: cạnh dài 1600px / chất lượng ~0.75, kèm thumbnail 300px. */
export async function compressImage(file: File): Promise<{ main: Blob; thumb: Blob }> {
  const [main, thumb] = await Promise.all([toBlob(file, 1600, 0.75), toBlob(file, 300, 0.7)])
  return { main, thumb }
}
