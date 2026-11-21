'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Pencil, Trash2, Undo2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { approveInvoiceAction, deleteInvoiceAction, unapproveInvoiceAction } from '@/server/invoices/actions'

/** Thao tác nhanh trên dòng hoá đơn. Nháp: Duyệt, Sửa, Xoá. Đã duyệt: chỉ Bỏ duyệt (khi chưa có khoản thu), muốn sửa phải bỏ duyệt trước. */
export function InvoiceRowActions({ id, code, draft, canUnapprove }: { id: string; code: string; draft: boolean; canUnapprove: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else { toast.success(ok); router.refresh() }
    })
  if (!draft) {
    return (
      <div className="flex items-center gap-1">
        {canUnapprove
          ? (
            <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Bỏ duyệt ${code}`} title="Bỏ duyệt"
              onClick={() => { if (window.confirm(`Bỏ duyệt hoá đơn ${code} để sửa?`)) run(() => unapproveInvoiceAction(id), 'Đã bỏ duyệt, hoá đơn về nháp') }}>
              <Undo2 className="size-4" aria-hidden="true" />
            </Button>
          )
          : <span className="size-8" aria-hidden="true" />}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Duyệt ${code}`} title="Duyệt"
        onClick={() => { if (window.confirm(`Duyệt hoá đơn ${code}?`)) run(() => approveInvoiceAction(id, {}), 'Đã duyệt hoá đơn') }}>
        <Check className="size-4 text-primary" aria-hidden="true" />
      </Button>
      <Link href={`/invoices/${id}`} aria-label={`Sửa ${code}`} title="Sửa" className={cn(buttonVariants({ size: 'icon-sm', variant: 'ghost' }))}><Pencil className="size-4" aria-hidden="true" /></Link>
      <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Xoá ${code}`} title="Xoá"
        onClick={() => { if (window.confirm(`Xoá hoá đơn ${code}? Không thể hoàn tác.`)) run(() => deleteInvoiceAction(id), 'Đã xoá hoá đơn') }}>
        <Trash2 className="size-4 text-rose-600" aria-hidden="true" />
      </Button>
    </div>
  )
}
