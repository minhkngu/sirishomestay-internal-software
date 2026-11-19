'use client'

import { useEffect } from 'react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trang này đang gặp lỗi</h1>
      <p>Thử lại sau giây lát. Nếu vẫn lỗi, liên hệ quản trị.</p>
      <button type="button" className="rounded border px-4 py-2" onClick={reset}>
        Thử lại
      </button>
    </div>
  )
}
