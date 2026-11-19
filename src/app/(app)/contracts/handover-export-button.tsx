'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { exportHandoverAction } from '@/server/handovers/actions'

/** Xuất biên bản bàn giao thành tệp và lưu vào "Văn bản đã lưu" của hợp đồng. */
export function HandoverExportButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => start(async () => {
    const r = await exportHandoverAction(id)
    if (!r.ok) toast.error(r.error); else { toast.success('Đã lưu biên bản'); router.refresh() }
  })}>{pending ? 'Đang xuất…' : 'Xuất biên bản'}</Button>
}
