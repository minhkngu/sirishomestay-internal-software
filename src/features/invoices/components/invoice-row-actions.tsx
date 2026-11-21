'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { approveInvoiceAction, deleteInvoiceAction } from '@/server/invoices/actions'

/** Thao tác nhanh ngay trên dòng hoá đơn: Duyệt (chỉ nháp), Sửa (mở trang hoá đơn), Xoá. */
export function InvoiceRowActions({ id, code, draft }: { id: string; code: string; draft: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else { toast.success(ok); router.refresh() }
    })
  return (
    <div className="flex items-center justify-end gap-1.5">
      {draft && (
        <Button size="sm" variant="outline" disabled={pending} aria-label={`Duyệt ${code}`}
          onClick={() => { if (window.confirm(`Duyệt hoá đơn ${code}?`)) run(() => approveInvoiceAction(id, {}), 'Đã duyệt hoá đơn') }}>
          Duyệt
        </Button>
      )}
      <Link href={`/invoices/${id}`} aria-label={`Sửa ${code}`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>Sửa</Link>
      <Button size="sm" variant="outline" disabled={pending} aria-label={`Xoá ${code}`}
        onClick={() => { if (window.confirm(`Xoá hoá đơn ${code}? Không thể hoàn tác.`)) run(() => deleteInvoiceAction(id), 'Đã xoá hoá đơn') }}>
        Xoá
      </Button>
    </div>
  )
}
