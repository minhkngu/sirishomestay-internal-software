import { removeDiacritics } from '@/domain/text'

export type ImportTarget = 'rooms' | 'tenants'
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
      { key: 'listPrice', label: 'Giá niêm yết', required: false, aliases: ['gia niem yet', 'gia thue', 'gia', 'gia phong'] },
      { key: 'capacity', label: 'Sức chứa', required: false, aliases: ['suc chua', 'so nguoi'] },
    ],
  },
  tenants: {
    label: 'Khách thuê',
    fields: [
      { key: 'kind', label: 'Loại khách', required: true, aliases: ['loai khach', 'loai'] },
      { key: 'facilityCode', label: 'Mã cơ sở', required: true, aliases: ['ma co so', 'co so', 'ma toa', 'toa'] },
      { key: 'fullName', label: 'Họ tên', required: false, aliases: ['ho ten', 'ho va ten', 'ten khach', 'ten'] },
      { key: 'phone', label: 'Số điện thoại', required: false, aliases: ['sdt', 'so dien thoai', 'dien thoai', 'phone'] },
      { key: 'email', label: 'Email', required: false, aliases: ['email', 'mail'] },
      { key: 'nationality', label: 'Quốc tịch', required: false, aliases: ['quoc tich', 'nationality'] },
      { key: 'passportNumber', label: 'Số passport', required: false, aliases: ['so passport', 'passport', 'ho chieu', 'so ho chieu'] },
      { key: 'passportExpiry', label: 'Hết hạn passport', required: false, aliases: ['het han passport', 'han passport', 'ngay het han passport'] },
      { key: 'visaType', label: 'Loại visa', required: false, aliases: ['loai visa', 'visa'] },
      { key: 'visaExpiry', label: 'Hết hạn visa', required: false, aliases: ['het han visa', 'han visa', 'ngay het han visa'] },
      { key: 'idNumber', label: 'Số CCCD', required: false, aliases: ['so cccd', 'cccd', 'cmnd', 'so cmnd', 'can cuoc'] },
      { key: 'idIssueDate', label: 'Ngày cấp CCCD', required: false, aliases: ['ngay cap', 'ngay cap cccd'] },
      { key: 'idIssuePlace', label: 'Nơi cấp CCCD', required: false, aliases: ['noi cap', 'noi cap cccd'] },
      { key: 'dateOfBirth', label: 'Ngày sinh', required: false, aliases: ['ngay sinh', 'dob'] },
      { key: 'permanentAddress', label: 'Địa chỉ thường trú', required: false, aliases: ['dia chi thuong tru', 'thuong tru'] },
      { key: 'companyName', label: 'Tên công ty', required: false, aliases: ['ten cong ty', 'cong ty'] },
      { key: 'taxCode', label: 'Mã số thuế', required: false, aliases: ['ma so thue', 'mst'] },
      { key: 'companyAddress', label: 'Địa chỉ công ty', required: false, aliases: ['dia chi cong ty'] },
      { key: 'representative', label: 'Người đại diện', required: false, aliases: ['nguoi dai dien', 'dai dien'] },
      { key: 'contactPerson', label: 'Người liên hệ', required: false, aliases: ['nguoi lien he', 'lien he'] },
      { key: 'note', label: 'Ghi chú', required: false, aliases: ['ghi chu', 'note'] },
    ],
  },
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
