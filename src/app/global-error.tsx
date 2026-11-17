'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <html lang="vi">
      <body>
        <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
          <h1>Trang này đang gặp lỗi</h1>
          <p>Thử lại sau giây lát. Nếu vẫn lỗi, liên hệ quản trị.</p>
          <button type="button" onClick={reset}>Thử lại</button>
        </main>
      </body>
    </html>
  )
}
