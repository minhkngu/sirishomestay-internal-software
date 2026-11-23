import { Calendar, FileText, User } from 'lucide-react'
import { db } from '@/db/client'
import { formatDateVN, todayVN } from '@/domain/dates'
import { computeDueDate } from '@/modules/leasing'
import { NewInvoiceForm } from '@/modules/leasing/ui'
import { listFacilities } from '@/modules/facilities'
import { listFeeTypePrices, listFeeTypes, listFeeUnits } from '@/modules/facilities'
import { previewNewInvoice } from '@/modules/leasing'
import { getAccessContext } from '@/modules/platform'
import { getSettings } from '@/modules/platform'
import { InvoiceEditorWithFees } from '../[id]/invoice-editor-with-fees'

export type NewInvoiceParams = { facility?: string; lease?: string; period?: string }

const UUID = /^[0-9a-f-]{36}$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** Thân dùng chung cho popup và trang đầy đủ: bảng chọn ở trên, bản xem trước hoá đơn bên dưới. Chưa ghi gì cho tới khi bấm Lưu thay đổi. */
export async function NewInvoice({ sp }: { sp: NewInvoiceParams }) {
  const ctx = await getAccessContext()
  const facilities = (await listFacilities(db, ctx)).map((f) => ({ id: f.id, name: f.name }))
  const leaseId = UUID.test(sp.lease ?? '') ? sp.lease! : ''
  const period = MONTH.test(sp.period ?? '') ? sp.period! : ''
  const form = (
    <NewInvoiceForm
      facilities={facilities}
      initial={{ facilityId: sp.facility ?? '', leaseId, period: sp.period ?? '' }}
    />
  )
  if (!leaseId || !period) return <div className="space-y-5">{form}</div>

  const preview = await previewNewInvoice(db, ctx, { leaseId, period }).catch((e: Error) => ({ error: e.message }))
  if ('error' in preview)
    return (
      <div className="space-y-4">
        {form}
        <p role="alert" className="text-sm text-destructive">
          {preview.error}
        </p>
      </div>
    )
  if (!preview.period)
    return (
      <div className="space-y-4">
        {form}
        <p role="alert" className="text-sm text-destructive">
          Hợp đồng không có kỳ nào để lập hoá đơn trong tháng này.
        </p>
      </div>
    )

  const [feeTypes, feeUnits, feePrices, settings] = await Promise.all([
    listFeeTypes(db, ctx),
    listFeeUnits(db),
    listFeeTypePrices(db, ctx),
    getSettings(db),
  ])
  const unitName = new Map(feeUnits.map((u) => [u.id, u.name]))
  const rule = settings.dueRule
  const dueDefaultLabel =
    rule.kind === 'day_of_invoice_month'
      ? `ngày ${rule.day} của chính tháng hoá đơn`
      : rule.kind === 'day_of_next_month'
        ? `ngày ${rule.day} của tháng sau`
        : `${rule.days} ngày sau khi duyệt`
  return (
    <div className="space-y-5">
      {form}
      <div className="border-t border-border/70 pt-5">
        <InvoiceEditorWithFees
          key={`${leaseId}|${period}`}
          header={
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">Hoá đơn mới</h1>
                <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Chưa lưu
                </span>
                <span className="rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Phòng {preview.roomCode}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <User className="size-3.5 text-primary" />
                  {preview.tenantName}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {formatDateVN(preview.period.start)} – {formatDateVN(preview.period.end)}
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText className="size-3.5" />
                  Hợp đồng {preview.leaseCode}
                </span>
              </div>
              {'rentSkipped' in preview && preview.rentSkipped && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Kỳ này đã có hoá đơn: hoá đơn thêm này không cộng tiền phòng, dùng cho các khoản phát sinh khác. Phí
                  hợp đồng không cần tính lại thì xoá khỏi hoá đơn.
                </p>
              )}
              {preview.warnings.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">⚠ {preview.warnings.join('; ')} — bổ sung sau khi lưu.</p>
              )}
            </div>
          }
          meterPanels={preview.meterPanels}
          newInvoice={{ leaseId, period, fixedQtyFeeIds: preview.fixedQtyFeeIds }}
          addFee={{
            feeTypes: feeTypes
              .filter((f) => f.quantityFrom !== 'meter')
              .map((f) => ({
                id: f.id,
                name: f.name,
                unit: unitName.get(f.unitId) ?? '',
                defaultPrice: f.defaultPrice,
                prices: feePrices[f.id] ?? {},
                billing: f.billing,
                quantityFrom: f.quantityFrom,
              })),
            usedTypeIds: [],
            facilityId: preview.facilityId,
            units: feeUnits.map((u) => ({ id: u.id, name: u.name })),
          }}
          status="draft"
          start={preview.period.start}
          end={preview.period.end}
          coefficient={null}
          fullMonth={false}
          proration={settings.proration}
          dueDate={null}
          dueDateIso={null}
          dueDefaultLabel={dueDefaultLabel}
          dueDefaultIso={computeDueDate(rule, todayVN(), period)}
          note=""
          lines={preview.lines.map((l) => ({
            type: l.type,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            meta: (l.meta as Record<string, unknown> | null) ?? null,
          }))}
        />
      </div>
    </div>
  )
}
