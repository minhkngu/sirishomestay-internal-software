'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, HandCoins, Pencil, Trash2, Undo2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CollectPaymentDialog } from '@/components/collect-payment-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { approveInvoiceAction, deleteInvoiceAction, unapproveInvoiceAction } from '@/server/invoices/actions'

/** Thao tác nhanh trên dòng hoá đơn. Nháp: Duyệt, Sửa, Xoá. Đã duyệt: chỉ Bỏ duyệt (khi chưa có khoản thu), muốn sửa phải bỏ duyệt trước. */
export function InvoiceRowActions({ id, code, draft, unapproveBlock, collect }: { id: string; code: string; draft: boolean; /** Lý do không bỏ duyệt được (null = bỏ duyệt được). */ unapproveBlock: string | null; collect: { leaseId: string; roomCode: string; tenantName: string; debt: number } | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [collecting, setCollecting] = useState(false)
  const [confirm, setConfirm] = useState<'approve' | 'unapprove' | 'delete' | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else { toast.success(ok); router.refresh() }
    })
  // Hộp xác nhận của app thay window.confirm (app desktop có thể chặn hộp thoại gốc nên bấm không thấy phản hồi)
  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      onOpenChange={(o) => { if (!o) setConfirm(null) }}
      title={confirm === 'approve' ? `Duyệt hoá đơn ${code}?` : confirm === 'unapprove' ? `Bỏ duyệt hoá đơn ${code}?` : `Xoá hoá đơn ${code}?`}
      description={confirm === 'unapprove' ? 'Hoá đơn về nháp để sửa.' : confirm === 'delete' ? 'Không thể hoàn tác.' : undefined}
      confirmLabel={confirm === 'approve' ? 'Duyệt' : confirm === 'unapprove' ? 'Bỏ duyệt' : 'Xoá'}
      destructive={confirm === 'delete'}
      onConfirm={() => {
        if (confirm === 'approve') run(() => approveInvoiceAction(id, {}), 'Đã duyệt hoá đơn')
        else if (confirm === 'unapprove') run(() => unapproveInvoiceAction(id), 'Đã bỏ duyệt, hoá đơn về nháp')
        else if (confirm === 'delete') run(() => deleteInvoiceAction(id), 'Đã xoá hoá đơn')
      }}
    />
  )
  if (!draft) {
    return (
      <div className="flex items-center gap-1">
        {collect
          ? (
            <>
              <Button size="icon-sm" variant="ghost" aria-label={`Thu tiền ${code}`} title="Thu tiền" onClick={() => setCollecting(true)}>
                <HandCoins className="size-4 text-emerald-700" aria-hidden="true" />
              </Button>
              {collecting && <CollectPaymentDialog open onOpenChange={setCollecting} {...collect} />}
            </>
          )
          : <span className="size-8" aria-hidden="true" />}
        <Button size="icon-sm" variant="ghost" disabled={pending || unapproveBlock !== null} aria-label={`Bỏ duyệt ${code}`} title={unapproveBlock ?? 'Bỏ duyệt'}
          onClick={() => setConfirm('unapprove')}>
          <Undo2 className="size-4" aria-hidden="true" />
        </Button>
        {dialog}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Duyệt ${code}`} title="Duyệt"
        onClick={() => setConfirm('approve')}>
        <Check className="size-4 text-primary" aria-hidden="true" />
      </Button>
      <Link href={`/invoices/${id}`} aria-label={`Sửa ${code}`} title="Sửa" className={cn(buttonVariants({ size: 'icon-sm', variant: 'ghost' }))}><Pencil className="size-4" aria-hidden="true" /></Link>
      <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Xoá ${code}`} title="Xoá"
        onClick={() => setConfirm('delete')}>
        <Trash2 className="size-4 text-rose-600" aria-hidden="true" />
      </Button>
      {dialog}
    </div>
  )
}
