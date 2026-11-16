import ExcelJS from 'exceljs'

export type ParsedSheet = { name: string; headers: string[]; rows: Record<string, unknown>[] }

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue)
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String((v as { text: unknown }).text)
    if ('error' in v) return null
  }
  return v
}

/** Đọc .xlsx: dòng đầu là tiêu đề; bỏ dòng trống; mỗi dòng mang `__row` = số dòng trong Excel. */
export async function parseWorkbook(buf: ArrayBuffer): Promise<{ sheets: ParsedSheet[] }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const sheets: ParsedSheet[] = []
  for (const ws of wb.worksheets) {
    const headerRow = ws.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const text = String(cellValue(cell.value) ?? '').trim()
      if (text) headers[col - 1] = text
    })
    const rows: Record<string, unknown>[] = []
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const rec: Record<string, unknown> = { __row: r }
      let any = false
      headers.forEach((h, i) => {
        if (!h) return
        const v = cellValue(row.getCell(i + 1).value)
        if (v !== null && !(typeof v === 'string' && v.trim() === '')) any = true
        rec[h] = v
      })
      if (any) rows.push(rec)
    }
    sheets.push({ name: ws.name, headers: headers.filter(Boolean), rows })
  }
  return { sheets }
}
