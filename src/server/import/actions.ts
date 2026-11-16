'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { toActionResult,  } from '@/lib/action-result'
import { ValidationError } from '@/domain/errors'
import { buildTemplateWorkbook, parseWorkbook, type ParsedSheet } from '@/lib/excel'
import { findImportConflicts, findMissingFacilities, runImport } from './run'
import { IMPORT_TARGETS, templateColumns, type ImportTarget } from './targets'
import { previewOpsRows } from './ops'
import { OPS_TARGETS, validateRows, type ImportError, type NormalizedRow, type OpsTarget } from './validate'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 5000

export async function parseWorkbookAction(formData: FormData) {
  const ctx = await getAccessContext()
  return toActionResult(async (): Promise<{ sheets: ParsedSheet[] }> => {
    assertCan(ctx, 'settings')
    const file = formData.get('file')
    if (!(file instanceof File)) throw new ValidationError('Chọn một file .xlsx')
    if (file.size > MAX_FILE_BYTES) throw new ValidationError('File quá lớn (tối đa 10MB)')
    if (!file.name.toLowerCase().endsWith('.xlsx')) throw new ValidationError('Chỉ nhận file .xlsx')
    let parsed
    try {
      parsed = await parseWorkbook(await file.arrayBuffer())
    } catch {
      throw new ValidationError('Không đọc được file Excel')
    }
    for (const s of parsed.sheets) if (s.rows.length > MAX_ROWS) throw new ValidationError(`Sheet "${s.name}" có quá ${MAX_ROWS} dòng`)
    return parsed
  })
}

type Payload = { target: ImportTarget; rows: Record<string, unknown>[]; mapping: Record<string, string | null> }

async function validateServerSide(ctx: Awaited<ReturnType<typeof getAccessContext>>, p: Payload) {
  assertCan(ctx, 'settings')
  if (p.rows.length > MAX_ROWS) throw new ValidationError(`Tối đa ${MAX_ROWS} dòng`)
  const { valid, errors } = validateRows(p.target, p.rows, p.mapping)
  const missing = await findMissingFacilities(db, valid)
  const missingRows = new Set(missing.map((m) => m.row))
  const present = valid.filter((v) => !missingRows.has(v.row))
  const conflicts = (OPS_TARGETS as string[]).includes(p.target)
    ? (await previewOpsRows(db, ctx, present as Extract<NormalizedRow, { target: OpsTarget }>[])).errors
    : await findImportConflicts(db, present)
  const badRows = new Set(conflicts.map((m) => m.row))
  return {
    valid: present.filter((v) => !badRows.has(v.row)),
    errors: [...errors, ...missing, ...conflicts].sort((a, b) => a.row - b.row),
  }
}

export async function previewImportAction(p: Payload) {
  const ctx = await getAccessContext()
  return toActionResult(async (): Promise<{ validCount: number; errors: ImportError[] }> => {
    const { valid, errors } = await validateServerSide(ctx, p)
    return { validCount: valid.length, errors }
  })
}

export async function runImportAction(p: Payload) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const { valid } = await validateServerSide(ctx, p)
    const r = await runImport(db, ctx, p.target, valid)
    revalidatePath('/', 'layout')
    return r
  })
}

/** Tải file mẫu: tiêu đề cột đúng tên gợi ý ghép cột, kèm một dòng ví dụ. */
export async function sampleWorkbookAction(target: ImportTarget) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    assertCan(ctx, 'settings')
    if (!(target in IMPORT_TARGETS)) throw new ValidationError('Loại dữ liệu không hợp lệ')
    const { headers, example } = templateColumns(target)
    const buf = await buildTemplateWorkbook(IMPORT_TARGETS[target].label, headers, example)
    return { base64: Buffer.from(buf).toString('base64'), name: `mau-${target}.xlsx` }
  })
}
