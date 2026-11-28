'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/date-field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { formatVND } from '@/domain/money'
import { todayVN } from '@/domain/dates'
import { previewPaymentRemovalAction } from '@/modules/leasing/actions'
import { deletePaymentAction } from '../server/cashbook/actions'

type Preview = { amount: number; method: string; walletBalance: number; hasDeposit: boolean; canMistake: boolean }
type Choice = 'to_wallet' | 'refund' | 'mistake'

/** Gỡ một khoản thu: chuyển tiền vào ví khách, trả lại khách, hoặc xoá do nhập nhầm. */
export function RemovePaymentDialog({
  paymentId,
  open,
  onOpenChange,
}: {
  paymentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [choice, setChoice] = useState<Choice>('to_wallet')
  const [refundOn, setRefundOn] = useState(todayVN())
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void previewPaymentRemovalAction(paymentId).then((r) => {
      if (!alive) return
      if (r.ok) setPreview(r.data)
      else setError(r.error)
    })
    return () => {
      alive = false
    }
  }, [paymentId])

  // Phiếu trả bằng ví thì chỉ có một cách: trả lại ví
  const walletPayment = preview?.method === 'wallet'
  const after =
    preview && !walletPayment
      ? choice === 'to_wallet'
        ? preview.walletBalance + preview.amount
        : preview.walletBalance
      : preview
        ? preview.walletBalance + preview.amount
        : 0
  const options: { value: Choice; label: string; hint: string }[] = [
    {
      value: 'to_wallet',
      label: 'Chuyển vào ví khách',
      hint: 'Dùng cho lập lại hoá đơn hoặc gạch nhầm hoá đơn. Sổ quỹ giữ nguyên.',
    },
    { value: 'refund', label: 'Trả lại khách', hint: 'Thu giữ ngày gốc, thêm một khoản chi "Trả lại khách".' },
    ...(preview?.canMistake
      ? [
          {
            value: 'mistake' as const,
            label: 'Nhập nhầm, xoá luôn',
            hint: 'Phiếu không có thật: dòng thu biến mất khỏi sổ quỹ.',
          },
        ]
      : []),
  ]
  const submit = () =>
    start(async () => {
      const r = await deletePaymentAction(
        paymentId,
        walletPayment ? { kind: 'to_wallet' } : choice === 'refund' ? { kind: 'refund', refundOn } : { kind: choice },
      )
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success('Đã gỡ khoản thu')
      onOpenChange(false)
      router.refresh()
    })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Gỡ khoản thu" size="sm">
      <div className="space-y-4 pb-1">
        {!preview && !error && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {preview && walletPayment && (
          <p className="text-sm">Khoản này trả bằng ví: gỡ thì {formatVND(preview.amount)} đ quay lại ví khách.</p>
        )}
        {preview && !walletPayment && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Cách xử lý tiền đã thu</legend>
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/80 p-3 text-sm"
              >
                <input
                  type="radio"
                  name="removal"
                  className="mt-1"
                  checked={choice === o.value}
                  onChange={() => setChoice(o.value)}
                />
                <span>
                  <span className="font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {choice === 'refund' && !walletPayment && preview && (
          <DateField id="refund-on" label="Ngày trả lại khách" value={refundOn} onValueChange={setRefundOn} />
        )}
        {preview && (
          <div className="space-y-1 text-sm">
            <p>
              Số dư ví sau khi gỡ: <span className="font-semibold tabular-nums">{formatVND(after)} đ</span>
            </p>
            {preview.hasDeposit && <p className="text-xs text-muted-foreground">Phần cọc của phiếu này về chờ thu.</p>}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !preview || (choice === 'refund' && !refundOn)}
            onClick={submit}
          >
            Gỡ khoản thu
          </Button>
        </div>
      </div>
    </FormDialog>
  )
}
