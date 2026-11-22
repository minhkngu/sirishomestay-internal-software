'use client'

import { useMemo, useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

// Giữ URL theo nội dung PDF: không huỷ khi effect chạy lại (Strict Mode ở dev làm khung trắng); trình duyệt tự thu hồi khi đóng trang.
const urlCache = new Map<string, string>()
function blobUrl(base64: string) {
  let url = urlCache.get(base64)
  if (!url) {
    url = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'application/pdf' }),
    )
    urlCache.set(base64, url)
  }
  return url
}

/** Hiện PDF (base64) ngay trong trang bằng khung xem của trình duyệt; không gọi server. */
export function PdfInline({ base64, title }: { base64: string; title: string }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  const url = useMemo(() => (mounted ? blobUrl(base64) : null), [mounted, base64])
  if (!url) return <div className="h-[60vh] w-full animate-pulse rounded-md border bg-muted/40" />
  return <iframe src={url} title={title} className="h-[60vh] w-full rounded-md border" />
}
