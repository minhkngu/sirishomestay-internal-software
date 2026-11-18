'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { parseFacilityFilter } from '@/lib/facility-filter'
import { paginate } from '@/lib/paginate'
import { DEFAULT_PAGE_SIZE, readPageSize, writePageSize } from '@/lib/page-size'

/** Đọc một tham số bộ lọc trên URL (cập nhật khi `setListParams` ghi URL). */
export function useListParam(key: string): string | null {
  return useSearchParams().get(key)
}

/** Ghi bộ lọc lên URL bằng history API: không gọi server, link vẫn chia sẻ được. */
export function setListParams(patch: Record<string, string | null>): void {
  const params = new URLSearchParams(window.location.search)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') params.delete(k)
    else params.set(k, v)
  }
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
}

/** Danh sách cơ sở đang chọn trên URL, bỏ id không thuộc quyền. */
export function useFacilitySelection(allowedIds: string[]): string[] {
  const raw = useListParam('toa')
  return useMemo(() => parseFacilityFilter(raw ?? undefined).filter((id) => allowedIds.includes(id)), [raw, allowedIds])
}

export type PagerProps = {
  total: number
  page: number
  pageCount: number
  start: number
  end: number
  size: number
  onPage: (page: number) => void
  onSize: (size: number) => void
}

/** Phân trang tại chỗ; về trang 1 khi `resetKey` hoặc số dòng đổi. */
export function usePager<T>(rows: T[], tableKey: string, resetKey: string): { pageRows: T[]; pager: PagerProps } {
  const [size, setSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [state, setState] = useState({ page: 1, resetKey })

  // Đọc số dòng đã nhớ sau khi dựng (tránh lệch giữa SSR và trình duyệt)
  useEffect(() => {
    const saved = readPageSize(tableKey)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage chỉ có ở trình duyệt
    setSize(saved)
  }, [tableKey])

  // Đổi bộ lọc: về trang 1 và ghi nhận khoá mới (quay lại bộ lọc cũ không đưa về trang cũ)
  if (state.resetKey !== resetKey) setState({ page: 1, resetKey })
  const requested = state.resetKey === resetKey ? state.page : 1
  const p = paginate(rows.length, requested, size)
  const pageRows = useMemo(() => rows.slice(p.start, p.end), [rows, p.start, p.end])

  const onPage = useCallback((page: number) => setState({ page, resetKey }), [resetKey])
  const onSize = useCallback(
    (next: number) => {
      writePageSize(tableKey, next)
      setSize(next)
      setState({ page: 1, resetKey })
    },
    [tableKey, resetKey],
  )

  return { pageRows, pager: { total: rows.length, page: p.page, pageCount: p.pageCount, start: p.start, end: p.end, size, onPage, onSize } }
}
