'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateVN, todayVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { DEPOSIT_ENTRY_LABELS } from '@/domain/deposit'
import { PAYMENT_METHOD_LABELS } from '@/domain/payment-labels'
import type { DepositEntry } from '@/domain/types'
import { BareSelect } from './contract-form-ui'

export type DepositRow = { id: string; date: string; type: string; amount: number; status: string }
export type DocsDraft = {
  signedFile: File | null
  photos: File[]
  newEntries: {
    key: string
    date: string
    type: 'collect' | 'topup' | 'deduct' | 'refund' | 'forfeit'
    amount: number
  }[]
  doneEntries: Record<string, { date: string; method: 'cash' | 'transfer' | 'other' }>
}
export const emptyDocsDraft: DocsDraft = { signedFile: null, photos: [], newEntries: [], doneEntries: {} }
export const docsDraftChanged = (d: DocsDraft) =>
  !!d.signedFile || d.photos.length > 0 || d.newEntries.length > 0 || Object.keys(d.doneEntries).length > 0

/** Giấy tờ, sổ cọc và bàn giao trong popup "Sửa hợp đồng": chỉ ghi nháp, mọi thứ được lưu khi bấm "Lưu thay đổi". */
export function EditDocuments({
  kind,
  signed,
  signedFileId,
  entries,
  canEditDeposit,
  draft,
  onChange,
}: {
  kind: 'lease' | 'deposit'
  signed: boolean
  signedFileId?: string | null
  entries: DepositRow[]
  canEditDeposit: boolean
  draft: DocsDraft
  onChange: (draft: DocsDraft) => void
}) {
  const signedInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<DocsDraft>) => onChange({ ...draft, ...patch })
  const balances = entries.reduce<number[]>(
    (acc, e) => [
      ...acc,
      (acc.at(-1) ?? 0) + (e.status === 'done' ? (['collect', 'topup'].includes(e.type) ? e.amount : -e.amount) : 0),
    ],
    [],
  )
  return (
    <div className="space-y-4 rounded-xl border p-3">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Bản hợp đồng đã ký</h3>
        <p className="text-xs text-muted-foreground">
          Bản scan hoặc PDF của hợp đồng đã có chữ ký của hai bên. Chọn tệp xong, hợp đồng chuyển sang &ldquo;Đã
          ký&rdquo; khi lưu.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {signed && signedFileId && (
            <a className="underline" href={`/api/files/${signedFileId}`}>
              Xem bản đã ký
            </a>
          )}
          {(!signed || !signedFileId) && (
            <>
              <input
                ref={signedInput}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  set({ signedFile: e.target.files?.[0] ?? null })
                  e.target.value = ''
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => signedInput.current?.click()}>
                {draft.signedFile ? 'Chọn tệp khác' : 'Chọn bản hợp đồng đã ký'}
              </Button>
              {draft.signedFile && (
                <span className="text-xs">
                  {draft.signedFile.name}{' '}
                  <button type="button" className="underline" onClick={() => set({ signedFile: null })}>
                    Bỏ
                  </button>
                </span>
              )}
            </>
          )}
        </div>
        {kind === 'lease' && (
          <>
            <h3 className="pt-2 text-sm font-semibold">Ảnh chụp hợp đồng</h3>
            <p className="text-xs text-muted-foreground">
              Ảnh đính kèm để tham khảo (trang đặc biệt, phụ kiện, hiện trạng...), không phải bản đã ký và không đổi
              trạng thái ký.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  set({ photos: [...draft.photos, ...Array.from(e.target.files ?? [])] })
                  e.target.value = ''
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => photoInput.current?.click()}>
                Thêm ảnh đính kèm
              </Button>
              {draft.photos.map((f, i) => (
                <span key={`${f.name}-${i}`} className="text-xs">
                  {f.name}{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => set({ photos: draft.photos.filter((_, j) => j !== i) })}
                  >
                    Bỏ
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {kind === 'lease' && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Sổ cọc</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Ngày</th>
                  <th className="py-1 pr-3 font-medium">Loại</th>
                  <th className="py-1 pr-3 font-medium">Số tiền</th>
                  <th className="py-1 pr-3 font-medium">Trạng thái</th>
                  <th className="py-1 pr-3 font-medium">Số dư</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {entries.map((e, i) => {
                  const done = draft.doneEntries[e.id]
                  return (
                    <tr key={e.id}>
                      <td className="py-1.5 pr-3">{formatDateVN(e.date)}</td>
                      <td className="py-1.5 pr-3">{DEPOSIT_ENTRY_LABELS[e.type as DepositEntry['type']] ?? e.type}</td>
                      <td className="py-1.5 pr-3">{formatVND(e.amount)}</td>
                      <td className="py-1.5 pr-3">{done ? 'Sẽ hoàn tất' : e.status === 'done' ? 'Đã xong' : 'Chờ'}</td>
                      <td className="py-1.5 pr-3">{formatVND(balances[i])}</td>
                      <td className="py-1.5">
                        {canEditDeposit &&
                          e.status === 'pending' &&
                          (done ? (
                            <div className="flex items-center gap-1">
                              <Input
                                aria-label="Ngày hoàn tất"
                                type="date"
                                className="h-7 w-36"
                                value={done.date}
                                onChange={(ev) =>
                                  set({
                                    doneEntries: { ...draft.doneEntries, [e.id]: { ...done, date: ev.target.value } },
                                  })
                                }
                              />
                              <BareSelect
                                ariaLabel="Hình thức"
                                value={done.method}
                                onValueChange={(method) =>
                                  set({
                                    doneEntries: {
                                      ...draft.doneEntries,
                                      [e.id]: { ...done, method: method as 'cash' },
                                    },
                                  })
                                }
                                options={Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => ({
                                  value: k,
                                  label: v,
                                }))}
                                className="h-7 w-36 rounded-lg px-2 py-0 text-xs"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const rest = { ...draft.doneEntries }
                                  delete rest[e.id]
                                  set({ doneEntries: rest })
                                }}
                              >
                                Bỏ
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                set({
                                  doneEntries: { ...draft.doneEntries, [e.id]: { date: todayVN(), method: 'cash' } },
                                })
                              }
                            >
                              Hoàn tất
                            </Button>
                          ))}
                      </td>
                    </tr>
                  )
                })}
                {draft.newEntries.map((n) => (
                  <tr key={n.key} className="bg-muted/40">
                    <td className="py-1.5 pr-3">{formatDateVN(n.date)}</td>
                    <td className="py-1.5 pr-3">{DEPOSIT_ENTRY_LABELS[n.type]}</td>
                    <td className="py-1.5 pr-3">{formatVND(n.amount)}</td>
                    <td className="py-1.5 pr-3">Dòng mới (chờ)</td>
                    <td />
                    <td className="py-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => set({ newEntries: draft.newEntries.filter((x) => x.key !== n.key) })}
                      >
                        Bỏ
                      </Button>
                    </td>
                  </tr>
                ))}
                {entries.length + draft.newEntries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-2 text-muted-foreground">
                      Chưa có dòng ghi sổ cọc nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {canEditDeposit && <NewEntry onAdd={(entry) => set({ newEntries: [...draft.newEntries, entry] })} />}
        </div>
      )}
    </div>
  )
}

function NewEntry({ onAdd }: { onAdd: (entry: DocsDraft['newEntries'][number]) => void }) {
  const dateRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<'topup' | 'collect' | 'deduct' | 'refund' | 'forfeit'>('topup')
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="grid gap-0.5 text-xs">
        Ngày
        <Input ref={dateRef} type="date" className="h-8" defaultValue={todayVN()} />
      </label>
      <div className="grid gap-0.5 text-xs">
        <span>Loại</span>
        <BareSelect
          ariaLabel="Loại"
          value={type}
          onValueChange={(value) => setType(value as 'topup' | 'collect' | 'deduct' | 'refund' | 'forfeit')}
          options={(['topup', 'collect', 'deduct', 'refund', 'forfeit'] as const).map((k) => ({
            value: k,
            label: DEPOSIT_ENTRY_LABELS[k],
          }))}
          className="h-8 w-28 rounded-lg px-2 py-0 text-xs"
        />
      </div>
      <label className="grid gap-0.5 text-xs">
        Số tiền
        <Input ref={amountRef} type="number" min="1" step="1" className="h-8 w-32" />
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          const amount = Number(amountRef.current?.value)
          if (!dateRef.current?.value || !Number.isSafeInteger(amount) || amount < 1) return
          onAdd({ key: crypto.randomUUID(), date: dateRef.current.value, type, amount })
          if (amountRef.current) amountRef.current.value = ''
        }}
      >
        Thêm dòng
      </Button>
    </div>
  )
}
