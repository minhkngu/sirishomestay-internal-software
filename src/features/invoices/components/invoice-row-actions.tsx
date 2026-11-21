'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Pencil, Trash2 } from 'lucide-react'
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
    <div className="flex items-center gap-1">
      {!draft && <span className="size-8" aria-hidden="true" />}
      {draft && (
        <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Duyệt ${code}`} title="Duyệt"
          onClick={() => { if (window.confirm(`Duyệt hoá đơn ${code}?`)) run(() => approveInvoiceAction(id, {}), 'Đã duyệt hoá đơn') }}>
          <Check className="size-4 text-primary" aria-hidden="true" />
        </Button>
      )}
      <Link href={`/invoices/${id}`} aria-label={`Sửa ${code}`} title="Sửa" className={cn(buttonVariants({ size: 'icon-sm', variant: 'ghost' }))}><Pencil className="size-4" aria-hidden="true" /></Link>
      <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Xoá ${code}`} title="Xoá"
        onClick={() => { if (window.confirm(`Xoá hoá đơn ${code}? Không thể hoàn tác.`)) run(() => deleteInvoiceAction(id), 'Đã xoá hoá đơn') }}>
        <Trash2 className="size-4 text-rose-600" aria-hidden="true" />
      </Button>
    </div>
  )
}
