'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  parseWorkbookAction,
  previewImportAction,
  runImportAction,
  sampleWorkbookAction,
} from '@/server/import/actions'
import { IMPORT_TARGETS, suggestMapping, type ImportTarget } from '@/server/import/targets'
import type { ImportError } from '@/server/import/validate'

type Sheet = { name: string; headers: string[]; rows: Record<string, unknown>[] }

/** Lỗi ngoài ActionResult (mạng, vượt giới hạn dung lượng…) cũng phải hiện thông báo tiếng Việt. */
async function safely<T>(
  fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return await fn()
  } catch {
    return { ok: false, error: 'Không xử lý được yêu cầu (file có thể quá lớn hoặc mất kết nối)' }
  }
}

function errorsCsv(errors: ImportError[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  return '﻿' + ['Dòng,Trường,Lỗi', ...errors.map((e) => `${e.row},${esc(e.field)},${esc(e.message)}`)].join('\n')
}

export function ImportWizard() {
  const [pending, start] = useTransition()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [target, setTarget] = useState<ImportTarget>('tenants')
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [preview, setPreview] = useState<{ validCount: number; errors: ImportError[] } | null>(null)
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sheet = sheets[sheetIdx]
  const fields = IMPORT_TARGETS[target].fields
  const missingRequired = fields.filter((f) => f.required && !mapping[f.key])

  function upload(file: File | undefined) {
    if (!file) return
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.set('file', file)
      const r = await safely(() => parseWorkbookAction(fd))
      if (!r.ok) {
        setError(r.error)
        return
      }
      setSheets(r.data.sheets)
      setSheetIdx(0)
      setMapping(suggestMapping(r.data.sheets[0]?.headers ?? [], target))
      setStep(2)
    })
  }

  function toPreview() {
    setError(null)
    start(async () => {
      const r = await safely(() => previewImportAction({ target, rows: sheet.rows, mapping }))
      if (!r.ok) {
        setError(r.error)
        return
      }
      setPreview(r.data)
      setStep(3)
    })
  }

  function doImport() {
    setError(null)
    start(async () => {
      const r = await safely(() => runImportAction({ target, rows: sheet.rows, mapping }))
      if (!r.ok) {
        setError(r.error)
        return
      }
      setResult(r.data)
    })
  }

  function downloadSample() {
    start(async () => {
      const r = await safely(() => sampleWorkbookAction(target))
      if (!r.ok) {
        setError(r.error)
        return
      }
      const bytes = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = r.data.name
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  function downloadErrors() {
    if (!preview) return
    const url = URL.createObjectURL(new Blob([errorsCsv(preview.errors)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'loi-nhap-du-lieu.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (result) {
    return (
      <div className="space-y-3">
        <p className="text-green-700">
          Đã nhập xong: tạo mới {result.created}, cập nhật {result.updated}.
        </p>
        <Button
          onClick={() => {
            setResult(null)
            setPreview(null)
            setSheets([])
            setStep(1)
          }}
        >
          Nhập file khác
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <ol className="flex gap-4 text-sm">
        {['1. Chọn file', '2. Ghép cột', '3. Xem trước & nhập'].map((s, i) => (
          <li key={s} className={step === i + 1 ? 'font-semibold' : 'text-muted-foreground'}>
            {s}
          </li>
        ))}
      </ol>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {step === 1 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="target" className="text-sm font-medium">
              Loại dữ liệu
            </label>
            <select
              id="target"
              value={target}
              onChange={(e) => setTarget(e.target.value as ImportTarget)}
              className="h-8 w-full rounded-lg border px-2 text-sm"
            >
              {(Object.keys(IMPORT_TARGETS) as ImportTarget[]).map((t) => (
                <option key={t} value={t}>
                  {IMPORT_TARGETS[t].label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={downloadSample}>
            Tải file mẫu
          </Button>
          <input type="file" accept=".xlsx" disabled={pending} onChange={(e) => upload(e.target.files?.[0])} />
          <p className="text-xs text-muted-foreground">Tối đa 10MB, 5.000 dòng. Dòng đầu tiên là tiêu đề cột.</p>
        </div>
      )}

      {step === 2 && sheet && (
        <div className="space-y-3">
          {sheets.length > 1 && (
            <select
              value={sheetIdx}
              onChange={(e) => {
                const i = Number(e.target.value)
                setSheetIdx(i)
                setMapping(suggestMapping(sheets[i].headers, target))
              }}
              className="h-8 rounded-lg border px-2 text-sm"
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({s.rows.length} dòng)
                </option>
              ))}
            </select>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="space-y-1 text-sm">
                <span>
                  {f.label}
                  {f.required && ' *'}
                </span>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                  className="h-8 w-full rounded-lg border px-2 text-sm"
                >
                  <option value="">— không ghép —</option>
                  {sheet.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <p className="text-sm text-destructive">Cần ghép: {missingRequired.map((f) => f.label).join(', ')}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Quay lại
            </Button>
            <Button disabled={pending || missingRequired.length > 0} onClick={toPreview}>
              Xem trước
            </Button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div className="space-y-3">
          <p className="text-sm">
            {preview.validCount} dòng hợp lệ · {preview.errors.length} lỗi
          </p>
          {preview.errors.length > 0 && (
            <>
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-2">Dòng</th>
                      <th className="p-2">Trường</th>
                      <th className="p-2">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{e.row}</td>
                        <td className="p-2">{e.field}</td>
                        <td className="p-2">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" onClick={downloadErrors}>
                Tải danh sách lỗi (CSV)
              </Button>
            </>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Quay lại
            </Button>
            <Button disabled={pending || preview.validCount === 0} onClick={doImport}>
              Nhập {preview.validCount} dòng hợp lệ
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
