'use client'
import { DateField } from '@/components/date-field'
import { useState } from 'react'
import { createExtensionAction } from '../../server/addenda/actions'
import { AddendumShell, Field, inputCls } from './addendum-shell'
import { BareSelect } from './contract-form-ui'
import type { FeeData } from './contract-edit-actions'
import { extensionFeesPayload, initialFeeRows, type ExtensionFeeRow } from './extension-fees'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'

export function ExtensionDialog({
  leaseId,
  endDate,
  finalInvoiceExists = true,
  monthlyRent,
  depositAmount,
  feeData,
  defaultOpen,
  onCompleted,
}: {
  leaseId: string
  endDate: string
  /** Đã có hoá đơn kỳ cuối của hợp đồng; chưa có thì chặn gia hạn. */
  finalInvoiceExists?: boolean
  monthlyRent: number
  depositAmount: number
  feeData?: FeeData | null
  defaultOpen?: boolean
  onCompleted?: () => void
}) {
  const [initialRows] = useState(() => initialFeeRows(feeData?.current ?? []))
  const [newEndDate, setEnd] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [rows, setRows] = useState<ExtensionFeeRow[]>(initialRows)
  const patch = (key: string, value: Partial<ExtensionFeeRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...value } : r)))
  const showFees = feeData?.editable === true
  const fees = showFees ? extensionFeesPayload(rows, initialRows) : undefined
  const input = {
    newEndDate,
    ...(rent && Number(rent) !== monthlyRent ? { newMonthlyRent: Number(rent) } : {}),
    // Chỉ đổi cọc nếu có nhập và khác cọc hiện tại
    ...(deposit && Number(deposit) !== depositAmount ? { newDepositAmount: Number(deposit) } : {}),
    ...(fees ? { fees } : {}),
  }
  const options = (feeData?.options ?? []).filter((o) =>
    o.meter ? feeData?.canEditMeters === true : !rows.some((r) => r.feeTypeId === o.id),
  )
  const usedMeters = new Set(rows.map((r) => r.meterId).filter(Boolean))
  if (!finalInvoiceExists)
    return (
      <section role="alert" className="max-w-xl space-y-3 rounded-lg border border-destructive/40 bg-card p-4">
        <h3 className="font-medium">Chưa thể gia hạn hợp đồng</h3>
        <p className="text-sm">
          Hợp đồng chưa có hoá đơn kỳ cuối (kỳ kết thúc ngày {formatDateVN(endDate)}). Hãy lập hoá đơn kỳ cuối trước,
          rồi mới gia hạn.
        </p>
        {onCompleted && (
          <Button size="sm" variant="outline" onClick={onCompleted}>
            Đóng
          </Button>
        )}
      </section>
    )
  return (
    <AddendumShell
      label="Gia hạn hợp đồng"
      kind="extension"
      leaseId={leaseId}
      input={input}
      create={createExtensionAction}
      defaultOpen={defaultOpen}
      onCompleted={onCompleted}
      simple
    >
      <Field label={`Ngày kết thúc mới (hiện tại ${formatDateVN(endDate)}, hiệu lực từ ngày liền sau)`}>
        <DateField id="extension-end" ariaLabel="Ngày kết thúc mới" value={newEndDate} onValueChange={setEnd} />
      </Field>
      <Field label={`Giá thuê mới (đang ${formatVND(monthlyRent)}, để trống nếu không đổi)`}>
        <MoneyInput className={inputCls} value={rent} onValueChange={setRent} />
      </Field>
      <Field label={`Tiền cọc mới (đang ${formatVND(depositAmount)}, để trống nếu không đổi)`}>
        <MoneyInput className={inputCls} value={deposit} onValueChange={setDeposit} />
      </Field>
      {showFees && (
        <div className="grid gap-2">
          <p className="font-medium">Phí dịch vụ</p>
          {rows.length === 0 && <p className="text-xs text-muted-foreground">Hợp đồng chưa có phí dịch vụ.</p>}
          {rows.map((r) => (
            <div key={r.key} className="rounded-lg border border-border/70 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium">
                  {r.name} <span className="font-normal text-muted-foreground">· {r.unit}</span>
                </span>
                {!(r.isMeter && r.leaseFeeId) && (
                  <button
                    type="button"
                    aria-label={`Bỏ phí ${r.name}`}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    Bỏ
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Đơn giá
                  <MoneyInput
                    aria-label={`Đơn giá ${r.name}`}
                    className={inputCls}
                    value={r.price}
                    onValueChange={(price) => patch(r.key, { price })}
                  />
                </label>
                {r.isMeter && !r.leaseFeeId && (
                  <>
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      Đồng hồ
                      <BareSelect
                        ariaLabel={`Đồng hồ ${r.name}`}
                        value={r.meterId}
                        onValueChange={(meterId) => patch(r.key, { meterId })}
                        options={[
                          { value: '', label: '— Chọn đồng hồ —' },
                          ...(feeData?.roomMeters ?? [])
                            .filter((m) => !m.busy && (m.id === r.meterId || !usedMeters.has(m.id)))
                            .map((m) => ({ value: m.id, label: m.label })),
                        ]}
                      />
                    </div>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Chỉ số ban đầu
                      <input
                        aria-label={`Chỉ số ban đầu ${r.name}`}
                        inputMode="numeric"
                        className={inputCls}
                        value={r.initialReading}
                        onChange={(e) => patch(r.key, { initialReading: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          ))}
          {options.length > 0 && (
            <BareSelect
              ariaLabel="Thêm phí dịch vụ"
              value=""
              onValueChange={(id) => {
                const o = options.find((x) => x.id === id)
                if (!o) return
                setRows((rs) => [
                  ...rs,
                  {
                    key: `new-${crypto.randomUUID()}`,
                    leaseFeeId: null,
                    feeTypeId: o.id,
                    name: o.name,
                    unit: o.unit,
                    isMeter: o.meter,
                    price: String(o.price),
                    meterId: '',
                    initialReading: '',
                  },
                ])
              }}
              options={[
                { value: '', label: '+ Thêm phí dịch vụ' },
                ...options.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          )}
        </div>
      )}
    </AddendumShell>
  )
}
