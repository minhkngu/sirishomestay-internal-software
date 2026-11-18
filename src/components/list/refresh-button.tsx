'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Lấy lại dữ liệu từ server (thấy thay đổi của người khác); bảng cũ vẫn hiện trong lúc tải. */
export function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
      {pending ? 'Đang làm mới…' : 'Làm mới'}
    </Button>
  )
}
