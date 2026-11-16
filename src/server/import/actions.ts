'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { assertCan } from '@/domain/access'
import { getAccessContext } from '@/server/session'
import { runAction, UserError } from '@/lib/action-result'
import { parseWorkbook, type ParsedSheet } from '@/lib/excel'
import { findImportConflicts, findMissingFacilities, runImport } from './run'
import type { ImportTarget } from './targets'
import { validateRows, type ImportError } from './validate'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 5000

export async function parseWorkbookAction(formData: FormData) {
  const ctx = await getAccessContext()
  return runAction(async (): Promise<{ sheets: ParsedSheet[] }> => {
    assertCan(ctx, 'settings')
    const file = formData.get('file')
    if (!(file instanceof File)) throw new UserError('Chọn một file .xlsx')
    if (file.size > MAX_FILE_BYTES) throw new UserError('File quá lớn (tối đa 10MB)')
    if (!file.name.toLowerCase().endsWith('.xlsx')) throw new UserError('Chỉ nhận file .xlsx')
    let parsed
    try {
      parsed = await parseWorkbook(await file.arrayBuffer())
    } catch {
      throw new UserError('Không đọc được file Excel')
    }
    for (const s of parsed.sheets) if (s.rows.length > MAX_ROWS) throw new UserError(`Sheet "${s.name}" có quá ${MAX_ROWS} dòng`)
    return parsed
  })
}

type Payload = { target: ImportTarget; rows: Record<string, unknown>[]; mapping: Record<string, string | null> }

async function validateServerSide(ctx: Awaited<ReturnType<typeof getAccessContext>>, p: Payload) {
  assertCan(ctx, 'settings')
  if (p.rows.length > MAX_ROWS) throw new UserError(`Tối đa ${MAX_ROWS} dòng`)
  const { valid, errors } = validateRows(p.target, p.rows, p.mapping)
  const missing = await findMissingFacilities(db, valid)
  const missingRows = new Set(missing.map((m) => m.row))
  const present = valid.filter((v) => !missingRows.has(v.row))
  const conflicts = await findImportConflicts(db, present)
  const badRows = new Set(conflicts.map((m) => m.row))
  return {
    valid: present.filter((v) => !badRows.has(v.row)),
    errors: [...errors, ...missing, ...conflicts].sort((a, b) => a.row - b.row),
  }
}

export async function previewImportAction(p: Payload) {
  const ctx = await getAccessContext()
  return runAction(async (): Promise<{ validCount: number; errors: ImportError[] }> => {
    const { valid, errors } = await validateServerSide(ctx, p)
    return { validCount: valid.length, errors }
  })
}

export async function runImportAction(p: Payload) {
  const ctx = await getAccessContext()
  return runAction(async () => {
    const { valid } = await validateServerSide(ctx, p)
    const r = await runImport(db, ctx, p.target, valid)
    revalidatePath('/', 'layout')
    return r
  })
}
