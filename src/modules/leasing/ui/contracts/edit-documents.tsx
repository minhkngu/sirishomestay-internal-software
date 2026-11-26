'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { DEPOSIT_ENTRY_LABELS, runningDepositBalances } from '@/domain/deposit'
import type { DepositEntry } from '@/domain/types'

export type DepositRow = {
  id: string
  date: string
  type: DepositEntry['type']
  amount: number
  status: DepositEntry['status']
}
export type DocsDraft = {
  signedFile: File | null
  photos: File[]
}
export const emptyDocsDraft: DocsDraft = { signedFile: null, photos: [] }
export const docsDraftChanged = (d: DocsDraft) => !!d.signedFile || d.photos.length > 0

/** Giấy tờ, sổ cọc và bàn giao trong popup "Sửa hợp đồng": giấy tờ chỉ ghi nháp, lưu khi bấm "Lưu thay đổi"; sổ cọc chỉ xem. */
export function EditDocuments({
  kind,
  signed,
  signedFileId,
  entries,
  draft,
  onChange,
}: {
  kind: 'lease' | 'deposit'
  signed: boolean
  signedFileId?: string | null
  entries: DepositRow[]
  draft: DocsDraft
  onChange: (draft: DocsDraft) => void
}) {
  const signedInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<DocsDraft>) => onChange({ ...draft, ...patch })
  const balances = runningDepositBalances(entries)
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {entries.map((e, i) => (
                  <tr key={e.id}>
                    <td className="py-1.5 pr-3">{formatDateVN(e.date)}</td>
                    <td className="py-1.5 pr-3">{DEPOSIT_ENTRY_LABELS[e.type] ?? e.type}</td>
                    <td className="py-1.5 pr-3">{formatVND(e.amount)}</td>
                    <td className="py-1.5 pr-3">{e.status === 'done' ? 'Đã xong' : 'Chờ'}</td>
                    <td className="py-1.5 pr-3">{formatVND(balances[i])}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 text-muted-foreground">
                      Chưa có dòng ghi sổ cọc nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Sổ cọc chỉ để xem, không sửa được ở đây.</p>
        </div>
      )}
    </div>
  )
}
