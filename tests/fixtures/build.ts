import ExcelJS from 'exceljs'

/** Tạo file .xlsx trong bộ nhớ: dòng 1 là tiêu đề, các dòng sau là dữ liệu. */
export async function buildXlsx(sheets: Record<string, unknown[][]>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name)
    for (const r of rows) ws.addRow(r)
  }
  const buf = await wb.xlsx.writeBuffer()
  const u8 = new Uint8Array(buf as ArrayBuffer)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

export const TENANT_HEADERS = ['Loại khách', 'Mã cơ sở', 'Họ tên', 'Số điện thoại', 'Số passport', 'Hết hạn visa', 'Số CCCD', 'Công ty', 'Mã số thuế']

export async function tenantsWorkbook(over: { phone2?: string } = {}) {
  return buildXlsx({
    Khách: [
      TENANT_HEADERS,
      ['Nước ngoài', 'A', 'John Smith', '+1 415 555 0100', 'X1234567', '05/03/2027', null, null, null],
      ['Việt Nam', 'A', 'Nguyễn Văn A', over.phone2 ?? '0901 234 567', null, null, '012345678901', null, null],
      [],
      ['Công ty', 'A', null, null, null, null, null, 'Công ty ABC', '0100000001'],
    ],
  })
}

export async function roomsWorkbook() {
  return buildXlsx({
    Phòng: [
      ['Mã cơ sở', 'Tên cơ sở', 'Mã phòng', 'Tầng', 'Loại phòng', 'Giá niêm yết', 'Sức chứa'],
      ['A', 'Cơ sở A', '101', '1', 'Studio', 5500000, 2],
      ['A', 'Cơ sở A', '102', '1', 'Studio', '5.500.000', 2],
      ['B', 'Cơ sở B', '201', '2', null, null, null],
    ],
  })
}
