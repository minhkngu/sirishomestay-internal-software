'use client'

import { DateField } from '@/components/date-field'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { PAYMENT_METHOD_OPTIONS } from '@/domain/payment-labels'
import { addPaymentAction, leaseWalletBalanceAction, recordLeasePaymentAction } from '../../server/invoices/actions'
import { clampWalletUse } from '../../domain/wallet'

/** Popup thu tiền theo hợp đồng: mặc định điền tổng dư nợ; tiền tự gạch các hoá đơn đã duyệt từ cũ đến mới. */
export function CollectPaymentDialog({
  open,
  onOpenChange,
  leaseId,
  roomCode,
  tenantName,
  debt,
  refundInvoiceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leaseId: string
  roomCode: string
  tenantName: string
  /** Hoá đơn thu tiền: tổng dư nợ. Hoá đơn hoàn khách (tổng âm): số còn phải hoàn. */
  debt: number
  /** Có giá trị = ghi khoản chi cho khách vào hoá đơn tổng âm này (số tiền ghi âm). */
  refundInvoiceId?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState(String(debt))
  const [paidOn, setPaidOn] = useState(todayVN())
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [wallet, setWallet] = useState(0)
  const [walletInput, setWalletInput] = useState('0')
  useEffect(() => {
    if (!open || refundInvoiceId) return
    let alive = true
    void leaseWalletBalanceAction(leaseId).then((r) => {
      if (alive && r.ok) setWallet(r.data)
    })
    return () => {
      alive = false
    }
  }, [open, leaseId, refundInvoiceId])
  const value = amount === '' ? 0 : Number(amount)
  const walletValue = walletInput === '' ? 0 : Number(walletInput)
  const walletMax = clampWalletUse(Number.MAX_SAFE_INTEGER, wallet, debt)
  const walletError = walletValue > walletMax ? `Tối đa ${formatVND(walletMax)}` : ''
  // Tiền mặt vượt phần nợ còn lại sau khi dùng ví: phần dư tự vào ví khách (không chặn)
  const surplus = refundInvoiceId ? 0 : Math.max(0, value - Math.max(0, debt - walletValue))
  const amountError = refundInvoiceId
    ? amount !== '' && value <= 0
      ? 'Số tiền phải lớn hơn 0'
      : value > debt
        ? `Số tiền không được vượt quá số còn phải hoàn (${formatVND(debt)})`
        : ''
    : value < 0
      ? 'Số tiền không được âm'
      : ''
  const submit = () =>
    start(async () => {
      const r = refundInvoiceId
        ? await addPaymentAction(refundInvoiceId, { paidOn, amount: -value, method: method as 'cash', note })
        : await recordLeasePaymentAction(leaseId, {
            paidOn,
            amount: value,
            walletAmount: walletValue,
            method: method as 'cash',
            note,
          })
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success(refundInvoiceId ? 'Đã ghi chi hoàn khách' : 'Đã ghi thu')
      onOpenChange(false)
      router.refresh()
    })
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={refundInvoiceId ? 'Hoàn tiền cho khách' : 'Thu tiền'}
      description={
        refundInvoiceId
          ? `Phòng ${roomCode} · ${tenantName}. Ghi khoản chi hoàn tiền cho khách theo hoá đơn này.`
          : `Phòng ${roomCode} · ${tenantName}. Tiền thu gạch hoá đơn đã duyệt cũ nhất trước.`
      }
      size="sm"
    >
      <div className="space-y-4 pb-1">
        <p className="text-sm text-muted-foreground">
          {refundInvoiceId ? 'Còn phải hoàn khách' : 'Tổng dư nợ'}:{' '}
          <span className="font-semibold tabular-nums text-foreground">{formatVND(debt)}</span>
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="collect-amount">{refundInvoiceId ? 'Số tiền chi' : 'Số tiền thu'}</Label>
          <MoneyInput
            id="collect-amount"
            value={amount}
            onValueChange={setAmount}
            className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-right text-sm font-medium tabular-nums"
          />
          {amountError && (
            <p role="alert" className="text-xs text-destructive">
              {amountError}
            </p>
          )}
          {surplus > 0 && (
            <p className="text-xs text-muted-foreground">
              Phần vượt {formatVND(surplus)} sẽ vào ví của khách, dùng được cho lần thu sau.
            </p>
          )}
        </div>
        {!refundInvoiceId && wallet > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="collect-wallet">Dùng số dư ví (đang có {formatVND(wallet)})</Label>
            <MoneyInput
              id="collect-wallet"
              value={walletInput}
              onValueChange={setWalletInput}
              className="h-9 w-full rounded-xl border border-border/80 bg-background px-3 text-right text-sm font-medium tabular-nums"
            />
            {walletError && (
              <p role="alert" className="text-xs text-destructive">
                {walletError}
              </p>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField
            id="collect-date"
            label={refundInvoiceId ? 'Ngày chi' : 'Ngày thu'}
            value={paidOn}
            onValueChange={setPaidOn}
          />
          <div className="space-y-1.5">
            <Label>Hình thức</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(String(v))} items={PAYMENT_METHOD_OPTIONS}>
              <SelectTrigger aria-label="Hình thức" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collect-note">Ghi chú</Label>
          <Input
            id="collect-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Đợt 1"
            className="h-9"
          />
        </div>
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
            disabled={
              pending ||
              (refundInvoiceId
                ? value <= 0 || value > debt
                : value + walletValue <= 0 || value < 0 || walletValue < 0 || walletValue > walletMax)
            }
            onClick={submit}
          >
            {refundInvoiceId ? 'Ghi chi' : 'Ghi thu'}
          </Button>
        </div>
      </div>
    </FormDialog>
  )
}
