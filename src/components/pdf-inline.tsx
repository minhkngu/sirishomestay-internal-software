'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

/** Hiện PDF (base64) ngay trong trang bằng khung xem của trình duyệt; không gọi server. */
export function PdfInline({ base64, title }: { base64: string; title: string }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const url = useMemo(() => (mounted ? URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'application/pdf' })) : null), [mounted, base64])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!url) return <div className="h-[60vh] w-full animate-pulse rounded-md border bg-muted/40" />
  return <iframe src={url} title={title} className="h-[60vh] w-full rounded-md border" />
}
