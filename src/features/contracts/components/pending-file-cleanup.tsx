'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { retryContractFileCleanupAction, retryRestoredFileCleanupAction } from '@/server/contracts/actions'

export function PendingFileCleanup({ count, restored = false }: { count: number; restored?: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
    >
      <span>
        Còn {count} tệp {restored ? 'sau khi khôi phục hợp đồng' : 'của hợp đồng đã xoá'} chưa xoá được khỏi kho lưu
        trữ.
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await (restored ? retryRestoredFileCleanupAction() : retryContractFileCleanupAction())
            if (!result.ok) {
              setError(result.error)
              return
            }
            setError(result.data.pendingFiles ? `Còn ${result.data.pendingFiles} tệp chưa xoá được.` : '')
            router.refresh()
          })
        }
      >
        Thử xoá tệp lại
      </Button>
      {error && <span>{error}</span>}
    </div>
  )
}
