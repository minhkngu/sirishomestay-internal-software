import { useState } from 'react'

type Result = { ok: boolean; error?: string; data?: { base64: string } }

/** Bản xem PDF theo id mẫu: có sẵn từ server cho mẫu mở sẵn, mẫu thu gọn lấy khi bấm mở (một lần). */
export function useLazyPreview(initial: Record<string, string | null>, fetcher: (id: string) => Promise<Result>) {
  const [previews, setPreviews] = useState<Record<string, string | null>>(initial)
  const [loading, setLoading] = useState<Set<string>>(() => new Set())
  async function ensure(id: string) {
    if (previews[id] || loading.has(id)) return
    setLoading((cur) => new Set(cur).add(id))
    const r = await fetcher(id)
    setPreviews((cur) => ({ ...cur, [id]: r.ok && r.data ? r.data.base64 : null }))
    setLoading((cur) => {
      const next = new Set(cur)
      next.delete(id)
      return next
    })
  }
  return { previews, loading, ensure }
}
