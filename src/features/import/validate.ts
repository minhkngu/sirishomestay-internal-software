import { normHeader, type ImportTarget } from './targets'
import { tenantInput, type TenantInput } from '../tenants/schemas'
import { roomInput } from '../rooms/schemas'
import { removeDiacritics } from '@/lib/text'

export const PLACEHOLDER_FACILITY_ID = '00000000-0000-4000-8000-000000000000'

export type RoomData = ReturnType<typeof roomInput.parse>
export type NormalizedRow =
  | { target: 'rooms'; row: number; facilityCode: string; facilityName: string | null; data: RoomData }
  | { target: 'tenants'; row: number; facilityCode: string; data: TenantInput }
export type ImportError = { row: number; field: string; message: string }

type Raw = Record<string, unknown>

const KIND_MAP: Record<string, 'foreign' | 'vietnamese' | 'company'> = {
  'nuoc ngoai': 'foreign', foreign: 'foreign', 'khach nuoc ngoai': 'foreign',
  'viet nam': 'vietnamese', vn: 'vietnamese', vietnamese: 'vietnamese', 'khach viet nam': 'vietnamese',
  'cong ty': 'company', company: 'company',
}

function isBlank(v: unknown) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}
function text(v: unknown): string | undefined {
  if (isBlank(v)) return undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}
/** Số nguyên VND từ số hoặc chuỗi như "5.500.000". */
function vnd(v: unknown): number | undefined {
  if (isBlank(v)) return undefined
  if (typeof v === 'number') return Math.round(v)
  const digits = String(v).replace(/[^\d]/g, '')
  return digits ? Number(digits) : NaN
}

const FIELD_OF_PATH: Record<string, string> = { code: 'roomCode', homeFacilityId: 'facilityCode' }

export function validateRows(
  target: ImportTarget,
  rows: Raw[],
  mapping: Record<string, string | null>,
): { valid: NormalizedRow[]; errors: ImportError[] } {
  const valid: NormalizedRow[] = []
  const errors: ImportError[] = []
  rows.forEach((raw, i) => {
    const rowNo = typeof raw.__row === 'number' ? raw.__row : i + 2
    const get = (key: string): unknown => (mapping[key] ? raw[mapping[key]!] : undefined)
    const err = (field: string, message: string) => errors.push({ row: rowNo, field, message })

    const facilityCode = text(get('facilityCode'))
    const before = errors.length
    if (!facilityCode) err('facilityCode', 'Nhập mã cơ sở')

    if (target === 'rooms') {
      const code = text(get('roomCode'))
      const price = vnd(get('listPrice'))
      const cap = vnd(get('capacity'))
      const area = isBlank(get('areaM2')) ? undefined : Number(String(get('areaM2')).replace(',', '.'))
      if (price !== undefined && Number.isNaN(price)) err('listPrice', 'Giá không hợp lệ')
      if (cap !== undefined && Number.isNaN(cap)) err('capacity', 'Sức chứa không hợp lệ')
      if (area !== undefined && Number.isNaN(area)) err('areaM2', 'Diện tích không hợp lệ')
      const r = roomInput.safeParse({
        facilityId: PLACEHOLDER_FACILITY_ID, code: code ?? '', floor: text(get('floor')), roomType: text(get('roomType')),
        areaM2: area, listPrice: price, capacity: cap,
      })
      if (!r.success) {
        for (const issue of r.error.issues) {
          const k = String(issue.path[0])
          err(FIELD_OF_PATH[k] ?? k, issue.message)
        }
      }
      if (errors.length === before && r.success && facilityCode) {
        valid.push({ target: 'rooms', row: rowNo, facilityCode, facilityName: text(get('facilityName')) ?? null, data: r.data })
      }
      return
    }

    // tenants
    const kindText = text(get('kind'))
    const kind = kindText ? KIND_MAP[normHeader(removeDiacritics(kindText))] : undefined
    if (!kind) {
      err('kind', kindText ? 'Loại khách không hợp lệ (nước ngoài / Việt Nam / công ty)' : 'Nhập loại khách')
    }
    const num = (k: string, pad?: (s: string) => string) => {
      const v = get(k)
      if (typeof v === 'number') return pad ? pad(String(Math.trunc(v))) : String(v)
      return text(v)
    }
    const input: Raw = {
      kind, homeFacilityId: PLACEHOLDER_FACILITY_ID,
      phone: num('phone', (s) => (/^[1-9]\d{8}$/.test(s) ? '0' + s : s)),
      email: text(get('email')), note: text(get('note')),
      fullName: text(get('fullName')), nationality: text(get('nationality')), passportNumber: text(get('passportNumber')),
      passportExpiry: get('passportExpiry'), visaType: text(get('visaType')), visaExpiry: get('visaExpiry'),
      idNumber: num('idNumber', (s) => s.padStart(12, '0')),
      idIssueDate: get('idIssueDate'), idIssuePlace: text(get('idIssuePlace')), dateOfBirth: get('dateOfBirth'),
      permanentAddress: text(get('permanentAddress')),
      companyName: text(get('companyName')), taxCode: num('taxCode', (s) => (s.length === 9 ? '0' + s : s)),
      companyAddress: text(get('companyAddress')), representative: text(get('representative')), contactPerson: text(get('contactPerson')),
    }
    if (kind) {
      const r = tenantInput.safeParse(input)
      if (!r.success) {
        for (const issue of r.error.issues) {
          const k = String(issue.path[0])
          err(FIELD_OF_PATH[k] ?? k, issue.message)
        }
      } else if (errors.length === before && facilityCode) {
        valid.push({ target: 'tenants', row: rowNo, facilityCode, data: r.data })
      }
    }
  })
  return { valid, errors }
}
