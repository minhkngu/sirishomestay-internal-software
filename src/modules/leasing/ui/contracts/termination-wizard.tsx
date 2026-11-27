'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { formatVND } from '@/domain/money'
import { ASSET_CONDITION } from '@/domain/asset-labels'
import { uploadOne } from '@/modules/platform/ui'
import { RENT_REFUND_MODES } from '../../domain/liquidation'
import { createTerminationAction } from '../../server/addenda/actions'
import { BareSelect } from './contract-form-ui'
import { Field, inputCls, ReadingInputs, toReadings, type MeterOption } from './addendum-shell'

type RentRefundMode = (typeof RENT_REFUND_MODES)[number]
const REFUND_LABELS: Record<RentRefundMode, string> = {
  by_days: 'Hoàn theo ngày không ở',
  partial: 'Hoàn một phần',
  none: 'Không hoàn',
}

export type CheckoutAssetOption = {
  assetId: string
  code: string
  name: string
  value: number
  checkInCondition: string | null
}

type AssetDraft = {
  assetId: string
  code: string
  name: string
  value: number
  checkInCondition: string | null
  condition: string
  damaged: boolean
  missing: boolean
  penalty: string
  note: string
  photos: File[]
}

type PenaltyDraft = {
  id: string
  description: string
  amount: string
}

export function TerminationWizard({
  leaseId,
  meters,
  today,
  assets = [],
  depositBalance = 0,
  onCompleted,
}: {
  leaseId: string
  meters: MeterOption[]
  today: string
  assets?: CheckoutAssetOption[]
  depositBalance?: number
  defaultOpen?: boolean
  onCompleted?: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [endDate, setEnd] = useState(today)
  const [mode, setMode] = useState<'none' | 'partial' | 'all'>('none')
  const [forfeitAmount, setForfeitAmount] = useState('')
  const [refundMode, setRefundMode] = useState<RentRefundMode>('by_days')
  const [refundAmount, setRefundAmount] = useState('')
  const [readings, setReadings] = useState<Record<string, string>>(() =>
    Object.fromEntries(meters.map((m) => [m.meterId, m.latestReading ? String(m.latestReading.value) : ''])),
  )
  // Số đầu mặc định là lần chốt gần nhất, sửa được
  const [openings, setOpenings] = useState<Record<string, string>>(() =>
    Object.fromEntries(meters.map((m) => [m.meterId, m.latestReading ? String(m.latestReading.value) : ''])),
  )
  const [assetRows, setAssetRows] = useState<AssetDraft[]>(() =>
    assets.map((a) => ({
      ...a,
      condition: a.checkInCondition ?? ASSET_CONDITION.good,
      damaged: false,
      missing: false,
      penalty: '',
      note: '',
      photos: [],
    })),
  )
  const [penalties, setPenalties] = useState<PenaltyDraft[]>([])

  const patchAsset = (assetId: string, patch: Partial<AssetDraft>) =>
    setAssetRows((prev) => prev.map((row) => (row.assetId === assetId ? { ...row, ...patch } : row)))

  const validPenalties = penalties
    .map((p) => ({ description: p.description.trim(), amount: Number(p.amount) || 0 }))
    .filter((p) => p.description.length > 0 && p.amount > 0)

  const input = {
    endDate,
    forfeit: { mode, ...(mode === 'partial' ? { amount: Number(forfeitAmount) || 0 } : {}) },
    rentRefund: { mode: refundMode, ...(refundMode === 'partial' ? { amount: Number(refundAmount) || 0 } : {}) },
    readings: toReadings(readings, openings),
    handoverItems: assetRows.map((a) => ({
      assetId: a.assetId,
      condition: a.condition,
      note: a.note,
      damaged: a.damaged,
      missing: a.missing,
      penalty: Number(a.penalty) || 0,
    })),
    penalties: validPenalties,
  }

  const totalAssetPenalty = assetRows.reduce((sum, a) => sum + (Number(a.penalty) || 0), 0)
  const totalContractPenalty = validPenalties.reduce((sum, p) => sum + p.amount, 0)
  const forfeitedPreview =
    mode === 'all' ? depositBalance : mode === 'partial' ? Math.min(Number(forfeitAmount) || 0, depositBalance) : 0

  const endDateError = !endDate ? 'Chọn ngày trả phòng' : null
  const readingError = (() => {
    for (const m of meters) {
      const raw = (readings[m.meterId] ?? '').trim()
      const label = `${m.utility === 'electric' ? 'điện' : 'nước'}${m.serial ? ` (${m.serial})` : ''}`
      if (raw === '') return `Nhập chỉ số ${label} tại ngày trả phòng`
      if (!/^\d+$/.test(raw)) return `Chỉ số ${label} phải là số nguyên không âm`
      const open = (openings[m.meterId] ?? '').trim()
      if (open !== '' && !/^\d+$/.test(open)) return `Số đầu ${label} phải là số nguyên không âm`
      if (open !== '' && Number(raw) < Number(open)) {
        return `Số cuối ${label} không được nhỏ hơn số đầu (${Number(open).toLocaleString('vi-VN')})`
      }
    }
    return null
  })()
  const assetPenaltyError = assetRows.some((a) => a.penalty.trim() !== '' && Number(a.penalty) < 0)
    ? 'Tiền đền bù tài sản không được âm'
    : null
  const penaltyIncomplete = penalties.some(
    (p) => (p.description.trim() && !(Number(p.amount) > 0)) || (!p.description.trim() && Number(p.amount) > 0),
  )
  const forfeitError =
    mode === 'partial'
      ? forfeitAmount.trim() === ''
        ? 'Nhập số tiền mất cọc'
        : Number(forfeitAmount) <= 0
          ? 'Số tiền mất cọc phải lớn hơn 0'
          : Number(forfeitAmount) > depositBalance
            ? `Số tiền mất cọc không vượt quá số dư cọc (${formatVND(depositBalance)})`
            : null
      : null
  const hasLiveError = !!endDateError || !!readingError || !!assetPenaltyError || penaltyIncomplete || !!forfeitError

  const handleConfirm = () => {
    if (hasLiveError) return
    start(async () => {
      const r = await createTerminationAction(leaseId, input)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      const itemMap = new Map(r.data.handoverItems.map((x) => [x.assetId, x.itemId]))
      let failedPhotos = 0
      for (const row of assetRows) {
        const itemId = itemMap.get(row.assetId)
        if (!itemId || !row.photos.length) continue
        for (const file of row.photos) {
          try {
            await uploadOne(file, 'handover_photo', itemId)
          } catch {
            failedPhotos++
          }
        }
      }
      if (failedPhotos > 0) toast.warning(`Đã thanh lý hợp đồng, nhưng ${failedPhotos} ảnh kiểm kê chưa tải lên được`)
      else toast.success('Đã thanh lý hợp đồng')
      router.refresh()
      onCompleted?.()
    })
  }

  return (
    <div className="space-y-5 text-sm">
      {/* 1. Ngày trả & Chỉ số điện nước */}
      <section className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5">
        <h3 className="text-[13px] font-medium text-muted-foreground">1. Ngày trả phòng & Chỉ số điện nước</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ngày trả phòng">
            <input type="date" className={inputCls} value={endDate} onChange={(e) => setEnd(e.target.value)} />
            {endDateError && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {endDateError}
              </p>
            )}
          </Field>
        </div>
        <ReadingInputs
          title="Chỉ số tại ngày trả phòng"
          meters={meters}
          values={readings}
          onChange={setReadings}
          openings={openings}
          onOpeningsChange={setOpenings}
        />
        {readingError && (
          <p role="alert" className="text-xs text-destructive">
            {readingError}
          </p>
        )}
      </section>

      {/* 2. Kiểm kê & Đền bù tài sản */}
      <section className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-muted-foreground">
            2. Kiểm kê & Đền bù tài sản ({assetRows.length})
          </h3>
          {totalAssetPenalty > 0 && (
            <span className="text-xs font-semibold text-destructive">Đền bù: {formatVND(totalAssetPenalty)}</span>
          )}
        </div>
        {assetRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Phòng không có tài sản nào cần kiểm kê.</p>
        ) : (
          <ul className="space-y-2.5">
            {assetRows.map((a) => (
              <li key={a.assetId} className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-foreground">{a.code}</span>
                    <span className="ml-1.5 text-foreground">{a.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Giá trị: {formatVND(a.value)}</span>
                    {a.checkInCondition && <span>· Lúc nhận: {a.checkInCondition}</span>}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs">
                    <span className="text-muted-foreground">Tình trạng lúc trả</span>
                    <input
                      className={inputCls}
                      value={a.condition}
                      onChange={(e) => patchAsset(a.assetId, { condition: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="text-muted-foreground">Tiền đền bù (VND)</span>
                    <MoneyInput
                      className={inputCls}
                      value={a.penalty}
                      onValueChange={(val) => patchAsset(a.assetId, { penalty: val })}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="text-muted-foreground">Ghi chú</span>
                    <input
                      className={inputCls}
                      value={a.note}
                      placeholder="Ghi chú tình trạng..."
                      onChange={(e) => patchAsset(a.assetId, { note: e.target.value })}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-4">
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={a.damaged}
                        onChange={(e) => patchAsset(a.assetId, { damaged: e.target.checked })}
                        className="size-3.5 accent-primary"
                      />
                      <span>Hư hỏng</span>
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={a.missing}
                        onChange={(e) => {
                          const nextMissing = e.target.checked
                          patchAsset(a.assetId, {
                            missing: nextMissing,
                            ...(nextMissing && !a.penalty && a.value > 0 ? { penalty: String(a.value) } : {}),
                          })
                        }}
                        className="size-3.5 accent-destructive"
                      />
                      <span>Mất tài sản</span>
                    </label>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <span>Ảnh hiện trạng{a.photos.length ? ` (${a.photos.length})` : ''}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="max-w-44 text-[11px]"
                      onChange={(e) => patchAsset(a.assetId, { photos: Array.from(e.target.files ?? []) })}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Mất cọc & Chi phí phạt hợp đồng */}
      <section className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-muted-foreground">3. Mất cọc & Chi phí phạt hợp đồng</h3>
          {depositBalance > 0 && (
            <span className="text-xs text-muted-foreground">Số dư cọc hiện tại: {formatVND(depositBalance)}</span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mất cọc">
            <BareSelect
              ariaLabel="Mất cọc"
              value={mode}
              onValueChange={(next) => setMode(next as 'none' | 'partial' | 'all')}
              options={[
                { value: 'none', label: 'Không mất cọc' },
                { value: 'partial', label: 'Mất một phần' },
                { value: 'all', label: 'Mất toàn bộ' },
              ]}
            />
          </Field>
          {mode === 'partial' && (
            <Field label="Số tiền mất cọc">
              <MoneyInput className={inputCls} value={forfeitAmount} onValueChange={setForfeitAmount} />
              {forfeitError && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {forfeitError}
                </p>
              )}
            </Field>
          )}
          <Field label="Tiền phòng đã trả trước">
            <BareSelect
              ariaLabel="Tiền phòng đã trả trước"
              value={refundMode}
              onValueChange={(next) => setRefundMode(next as RentRefundMode)}
              options={RENT_REFUND_MODES.map((value) => ({ value, label: REFUND_LABELS[value] }))}
            />
          </Field>
          {refundMode === 'partial' && (
            <Field label="Số tiền hoàn">
              <MoneyInput className={inputCls} value={refundAmount} onValueChange={setRefundAmount} />
              <p className="mt-1 text-xs text-muted-foreground">
                Tối đa bằng số tính theo ngày; nhập vượt sẽ báo lỗi khi xác nhận.
              </p>
            </Field>
          )}
        </div>

        <div className="space-y-2 border-t border-border/60 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Phí phạt theo hợp đồng</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                setPenalties((prev) => [...prev, { id: crypto.randomUUID(), description: '', amount: '' }])
              }
            >
              <Plus className="size-3.5" />
              Thêm khoản phạt
            </Button>
          </div>
          {penalties.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2">
              <input
                className={`${inputCls} min-w-44 flex-1`}
                placeholder="Nội dung phạt (trả muộn, vệ sinh...)"
                value={p.description}
                onChange={(e) =>
                  setPenalties((prev) => prev.map((x) => (x.id === p.id ? { ...x, description: e.target.value } : x)))
                }
              />
              <MoneyInput
                className={`${inputCls} w-36`}
                placeholder="Số tiền"
                value={p.amount}
                onValueChange={(val) =>
                  setPenalties((prev) => prev.map((x) => (x.id === p.id ? { ...x, amount: val } : x)))
                }
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Xoá khoản phạt"
                onClick={() => setPenalties((prev) => prev.filter((x) => x.id !== p.id))}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          {penaltyIncomplete && (
            <p role="alert" className="text-xs text-destructive">
              Nhập đủ nội dung và số tiền cho từng khoản phạt
            </p>
          )}
          {assetPenaltyError && (
            <p role="alert" className="text-xs text-destructive">
              {assetPenaltyError}
            </p>
          )}
        </div>
      </section>

      {/* Footer cố định */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-background pt-3 pb-1">
        <div className="text-xs text-muted-foreground">
          Đền bù TS: <strong className="text-foreground">{formatVND(totalAssetPenalty)}</strong>
          {' · '}Phạt HĐ: <strong className="text-foreground">{formatVND(totalContractPenalty)}</strong>
          {forfeitedPreview > 0 && (
            <>
              {' · '}Mất cọc: <strong className="text-foreground">{formatVND(forfeitedPreview)}</strong>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={pending || hasLiveError} onClick={handleConfirm}>
            Xác nhận thanh lý
          </Button>
        </div>
      </div>
    </div>
  )
}
