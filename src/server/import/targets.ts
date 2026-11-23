import { removeDiacritics } from '@/domain/text'

export type ImportTarget = 'rooms' | 'tenants' | 'leases' | 'deposits' | 'debts' | 'meter_readings' | 'assets'
export type ImportField = { key: string; label: string; required: boolean; aliases: string[] }

export const IMPORT_TARGETS: Record<ImportTarget, { label: string; fields: ImportField[] }> = {
  rooms: {
    label: 'Cơ sở & phòng',
    fields: [
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'facilityName', label: 'Tên cơ sở', required: false, aliases: ['ten co so', 'ten toa'] },
      { key: 'roomCode', label: 'Mã phòng', required: true, aliases: ['ma phong', 'phong', 'so phong'] },
      { key: 'floor', label: 'Tầng', required: false, aliases: ['tang'] },
      { key: 'roomType', label: 'Loại phòng', required: false, aliases: ['loai phong', 'loai'] },
      { key: 'areaM2', label: 'Diện tích (m²)', required: false, aliases: ['dien tich', 'dien tich m2', 'm2'] },
      {
        key: 'listPrice',
        label: 'Giá niêm yết',
        required: false,
        aliases: ['gia niem yet', 'gia thue', 'gia', 'gia phong'],
      },
      { key: 'capacity', label: 'Sức chứa', required: false, aliases: ['suc chua', 'so nguoi'] },
    ],
  },
  tenants: {
    label: 'Khách thuê',
    fields: [
      { key: 'kind', label: 'Loại khách', required: true, aliases: ['loai khach', 'loai'] },
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'fullName', label: 'Họ tên', required: false, aliases: ['ho ten', 'ho va ten', 'ten khach', 'ten'] },
      {
        key: 'phone',
        label: 'Số điện thoại',
        required: false,
        aliases: ['sdt', 'so dien thoai', 'dien thoai', 'phone'],
      },
      { key: 'email', label: 'Email', required: false, aliases: ['email', 'mail'] },
      { key: 'nationality', label: 'Quốc tịch', required: false, aliases: ['quoc tich', 'nationality'] },
      {
        key: 'passportNumber',
        label: 'Số passport',
        required: false,
        aliases: ['so passport', 'passport', 'ho chieu', 'so ho chieu'],
      },
      {
        key: 'passportExpiry',
        label: 'Hết hạn passport',
        required: false,
        aliases: ['het han passport', 'han passport', 'ngay het han passport'],
      },
      { key: 'visaType', label: 'Loại visa', required: false, aliases: ['loai visa', 'visa'] },
      {
        key: 'visaExpiry',
        label: 'Hết hạn visa',
        required: false,
        aliases: ['het han visa', 'han visa', 'ngay het han visa'],
      },
      {
        key: 'idNumber',
        label: 'Số CCCD',
        required: false,
        aliases: ['so cccd', 'cccd', 'cmnd', 'so cmnd', 'can cuoc'],
      },
      { key: 'idIssueDate', label: 'Ngày cấp CCCD', required: false, aliases: ['ngay cap', 'ngay cap cccd'] },
      { key: 'idIssuePlace', label: 'Nơi cấp CCCD', required: false, aliases: ['noi cap', 'noi cap cccd'] },
      { key: 'dateOfBirth', label: 'Ngày sinh', required: false, aliases: ['ngay sinh', 'dob'] },
      {
        key: 'permanentAddress',
        label: 'Địa chỉ thường trú',
        required: false,
        aliases: ['dia chi thuong tru', 'thuong tru'],
      },
      { key: 'companyName', label: 'Tên công ty', required: false, aliases: ['ten cong ty', 'cong ty'] },
      { key: 'taxCode', label: 'Mã số thuế', required: false, aliases: ['ma so thue', 'mst'] },
      { key: 'companyAddress', label: 'Địa chỉ công ty', required: false, aliases: ['dia chi cong ty'] },
      { key: 'representative', label: 'Người đại diện', required: false, aliases: ['nguoi dai dien', 'dai dien'] },
      { key: 'contactPerson', label: 'Người liên hệ', required: false, aliases: ['nguoi lien he', 'lien he'] },
      { key: 'note', label: 'Ghi chú', required: false, aliases: ['ghi chu', 'note'] },
    ],
  },
  leases: {
    label: 'Hợp đồng thuê',
    fields: [
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'roomCode', label: 'Mã phòng', required: true, aliases: ['ma phong', 'phong', 'so phong'] },
      {
        key: 'tenantDocument',
        label: 'Giấy tờ khách (passport/CCCD/MST)',
        required: false,
        aliases: ['giay to', 'passport', 'cccd', 'mst', 'so giay to'],
      },
      {
        key: 'tenantPhone',
        label: 'SĐT khách',
        required: false,
        aliases: ['sdt khach', 'so dien thoai khach', 'sdt', 'so dien thoai'],
      },
      { key: 'startDate', label: 'Ngày bắt đầu', required: true, aliases: ['ngay bat dau', 'bat dau', 'tu ngay'] },
      {
        key: 'endDate',
        label: 'Ngày kết thúc',
        required: true,
        aliases: ['ngay ket thuc', 'ket thuc', 'den ngay', 'het han'],
      },
      { key: 'monthlyRent', label: 'Giá thuê', required: true, aliases: ['gia thue', 'tien phong', 'gia'] },
      { key: 'depositAmount', label: 'Tiền cọc', required: false, aliases: ['tien coc', 'coc'] },
      {
        key: 'legacyCode',
        label: 'Mã hợp đồng cũ',
        required: false,
        aliases: ['ma hop dong cu', 'ma hop dong', 'so hop dong', 'ma hd'],
      },
    ],
  },
  deposits: {
    label: 'Số dư cọc',
    fields: [
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'roomCode', label: 'Mã phòng', required: false, aliases: ['ma phong', 'phong', 'so phong'] },
      {
        key: 'legacyCode',
        label: 'Mã hợp đồng cũ',
        required: false,
        aliases: ['ma hop dong cu', 'ma hop dong', 'so hop dong', 'ma hd'],
      },
      { key: 'amount', label: 'Số dư cọc', required: true, aliases: ['so du coc', 'so tien', 'tien coc', 'coc'] },
    ],
  },
  debts: {
    label: 'Công nợ',
    fields: [
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'roomCode', label: 'Mã phòng', required: false, aliases: ['ma phong', 'phong', 'so phong'] },
      {
        key: 'legacyCode',
        label: 'Mã hợp đồng cũ',
        required: false,
        aliases: ['ma hop dong cu', 'ma hop dong', 'so hop dong', 'ma hd'],
      },
      { key: 'amount', label: 'Số tiền nợ', required: true, aliases: ['cong no', 'so tien no', 'so tien', 'no'] },
    ],
  },
  meter_readings: {
    label: 'Chỉ số điện nước',
    fields: [
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'roomCode', label: 'Mã phòng', required: true, aliases: ['ma phong', 'phong', 'so phong'] },
      { key: 'utility', label: 'Loại (điện/nước)', required: true, aliases: ['loai', 'dien nuoc', 'dien/nuoc'] },
      { key: 'period', label: 'Kỳ (tháng)', required: true, aliases: ['ky', 'thang', 'ky ghi'] },
      { key: 'value', label: 'Chỉ số', required: true, aliases: ['chi so', 'so dien', 'so'] },
      { key: 'readOn', label: 'Ngày ghi', required: false, aliases: ['ngay ghi', 'ngay'] },
    ],
  },
  assets: {
    label: 'Tài sản',
    fields: [
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'code', label: 'Mã tài sản', required: true, aliases: ['ma tai san', 'ma ts', 'ma'] },
      { key: 'name', label: 'Tên tài sản', required: true, aliases: ['ten tai san', 'ten ts', 'ten'] },
      { key: 'category', label: 'Nhóm', required: false, aliases: ['nhom', 'loai tai san', 'danh muc'] },
      { key: 'value', label: 'Giá trị', required: false, aliases: ['gia tri', 'gia'] },
      { key: 'condition', label: 'Tình trạng', required: false, aliases: ['tinh trang'] },
      {
        key: 'roomCode',
        label: 'Mã phòng (trống = khu chung)',
        required: false,
        aliases: ['ma phong', 'phong', 'so phong'],
      },
    ],
  },
}

const EXAMPLES: Record<string, string> = {
  facilityCode: 'TD',
  facilityName: 'Thảo Điền',
  roomCode: '101',
  floor: '1',
  roomType: 'Studio',
  areaM2: '25',
  listPrice: '5.500.000',
  capacity: '2',
  kind: 'Nước ngoài',
  fullName: 'Nguyễn Văn A',
  phone: '0901234567',
  email: 'a@example.com',
  nationality: 'Mỹ',
  passportNumber: 'X1234567',
  visaExpiry: '31/12/2026',
  idNumber: '012345678901',
  companyName: 'Công ty ABC',
  taxCode: '0100000001',
  tenantDocument: 'X1234567',
  tenantPhone: '0901234567',
  startDate: '01/01/2026',
  endDate: '31/12/2026',
  monthlyRent: '9.000.000',
  depositAmount: '9.000.000',
  legacyCode: 'HD-001',
  amount: '9.000.000',
  utility: 'Điện',
  period: '11/2026',
  value: '1250',
  readOn: '30/11/2026',
  code: 'TV-001',
  name: 'Tivi',
  category: 'Điện tử',
  condition: 'Tốt',
}
/** Tiêu đề (nhãn tiếng Việt) và dòng ví dụ của file mẫu cho từng loại dữ liệu. */
export function templateColumns(target: ImportTarget) {
  const fields = IMPORT_TARGETS[target].fields.filter(
    (f) => f.required || ['legacyCode', 'roomCode', 'depositAmount'].includes(f.key),
  )
  return { headers: fields.map((f) => f.label), example: fields.map((f) => EXAMPLES[f.key] ?? '') }
}

export const normHeader = (s: string) => removeDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim()

/** Gợi ý ghép cột: trường → tên cột trong file (hoặc null). Mỗi cột chỉ ghép một lần. */
export function suggestMapping(headers: string[], target: ImportTarget): Record<string, string | null> {
  const used = new Set<string>()
  const out: Record<string, string | null> = {}
  const normalized = headers.map((h) => ({ h, n: normHeader(h) }))
  for (const f of IMPORT_TARGETS[target].fields) {
    const names = [f.key.toLowerCase(), normHeader(f.label), ...f.aliases]
    const hit = normalized.find((x) => !used.has(x.h) && names.includes(x.n))
    out[f.key] = hit ? hit.h : null
    if (hit) used.add(hit.h)
  }
  return out
}
