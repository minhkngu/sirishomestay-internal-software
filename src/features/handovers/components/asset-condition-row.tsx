'use client'

import { FileUpload } from '@/components/file-upload'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'

export type ItemState = { id: string; assetCode: string; assetName: string; assetValue: number; condition: string; note: string; damaged: boolean; missing: boolean; penalty: string; photoIds: string[] }

const CONDITIONS = ['Tốt', 'Trầy xước', 'Hư'] as const

/** Một tài sản: nút to dễ bấm trên điện thoại; chọn Hư/Mất thì hiện ô tiền phạt; chụp ảnh gắn theo món. */
export function AssetConditionRow({ item, readOnly, checkInCondition, onChange, onPhoto }: {
  item: ItemState; readOnly: boolean; checkInCondition?: string; onChange: (patch: Partial<ItemState>) => void; onPhoto: () => void
}) {
  const pick = (c: string) => onChange({ condition: c, damaged: c === 'Hư', ...(c !== 'Hư' ? {} : {}) })
  return (
    <li className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><span className="font-medium">{item.assetName}</span> <span className="text-xs text-muted-foreground">({item.assetCode} · {formatVND(item.assetValue)})</span></div>
        {checkInCondition && <span className="text-xs text-muted-foreground">Lúc check-in: {checkInCondition}</span>}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Tình trạng ${item.assetCode}`}>
        {CONDITIONS.map((c) => (
          <button key={c} type="button" disabled={readOnly || item.missing} onClick={() => pick(c)}
            className={cn('min-h-11 flex-1 rounded-lg border px-3 text-sm', item.condition === c && !item.missing && 'bg-[var(--primary-strong)] text-primary-foreground')}>{c}</button>
        ))}
        <button type="button" disabled={readOnly} onClick={() => onChange({ missing: !item.missing, condition: !item.missing ? 'Mất' : 'Tốt', damaged: false })}
          className={cn('min-h-11 flex-1 rounded-lg border px-3 text-sm', item.missing && 'bg-destructive text-white')}>Mất</button>
      </div>
      <input aria-label={`Ghi chú ${item.assetCode}`} disabled={readOnly} placeholder="Ghi chú" value={item.note} onChange={(e) => onChange({ note: e.target.value })} className="h-10 w-full rounded-lg border px-2 text-sm" />
      {(item.damaged || item.missing) && (
        <label className="flex items-center gap-2 text-sm">Tiền phạt (VND)
          <input aria-label={`Tiền phạt ${item.assetCode}`} disabled={readOnly} inputMode="numeric" value={item.penalty} onChange={(e) => onChange({ penalty: e.target.value })} className="h-10 w-36 rounded-lg border px-2" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {item.photoIds.map((id) => (
          // eslint-disable-next-line @next/next/no-img-element
          <a key={id} href={`/api/files/${id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${id}?thumb=1`} alt="Ảnh" className="size-14 rounded border object-cover" /></a>
        ))}
        {!readOnly && <FileUpload ownerType="handover_photo" ownerId={item.id} capture multiple label="Chụp ảnh" nameFor={(f) => f.name} onUploaded={onPhoto} />}
      </div>
    </li>
  )
}
