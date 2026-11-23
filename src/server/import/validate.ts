import { normHeader, type ImportTarget } from './targets'
import { tenantInput, type TenantInput } from '@/modules/tenants'
import { roomInput } from '../rooms/schemas'
import { parseFlexibleDate } from '@/domain/dates'
import { removeDiacritics } from '@/domain/text'

export const PLACEHOLDER_FACILITY_ID = '00000000-0000-4000-8000-000000000000'

export type RoomData = ReturnType<typeof roomInput.parse>
export type NormalizedRow =
  | { target: 'rooms'; row: number; facilityCode: string; facilityName: string | null; data: RoomData }
  | { target: 'tenants'; row: number; facilityCode: string; data: TenantInput }
  | { target: OpsTarget; row: number; facilityCode: string; data: Record<string, string | number | undefined> }
export type OpsTarget = 'leases' | 'deposits' | 'debts' | 'meter_readings' | 'assets'
export const OPS_TARGETS: OpsTarget[] = ['leases', 'deposits', 'debts', 'meter_readings', 'assets']
export type ImportError = { row: number; field: string; message: string }

type Raw = Record<string, unknown>

const KIND_MAP: Record<string, 'foreign' | 'vietnamese' | 'company'> = {
  'nuoc ngoai': 'foreign',
  foreign: 'foreign',
  'khach nuoc ngoai': 'foreign',
  'viet nam': 'vietnamese',
  vn: 'vietnamese',
  vietnamese: 'vietnamese',
  'khach viet nam': 'vietnamese',
  'cong ty': 'company',
  company: 'company',
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

    if (target !== 'rooms' && target !== 'tenants') {
      const data: Record<string, string | number | undefined> = {}
      const money = (key: string, label: string, required = false, min = 0) => {
        const v = vnd(get(key))
        if (v === undefined) {
          if (required) err(key, `Nhập ${label}`)
          return
        }
        if (Number.isNaN(v) || v < min) err(key, `${label} không hợp lệ`)
        else data[key] = v
      }
      const day = (key: string, label: string, required = false) => {
        const raw = get(key)
        if (isBlank(raw)) {
          if (required) err(key, `Nhập ${label}`)
          return
        }
        const d = parseFlexibleDate(raw as string | number | Date)
        if (!d) err(key, `${label} không hợp lệ`)
        else data[key] = d
      }
      const str = (key: string, label: string, required = false) => {
        const v = typeof get(key) === 'number' ? String(get(key)) : text(get(key))
        if (!v) {
          if (required) err(key, `Nhập ${label}`)
          return
        }
        data[key] = v
      }
      const needRoomOrLegacy = () => {
        str('roomCode', 'mã phòng')
        str('legacyCode', 'mã hợp đồng cũ')
        if (!data.roomCode && !data.legacyCode) err('roomCode', 'Nhập mã phòng hoặc mã hợp đồng cũ')
      }
      if (target === 'leases') {
        str('roomCode', 'mã phòng', true)
        str('tenantDocument', 'giấy tờ khách')
        str('tenantPhone', 'SĐT khách')
        str('legacyCode', 'mã hợp đồng cũ')
        if (!data.tenantDocument && !data.tenantPhone)
          err('tenantDocument', 'Nhập giấy tờ hoặc số điện thoại của khách')
        day('startDate', 'ngày bắt đầu', true)
        day('endDate', 'ngày kết thúc', true)
        money('monthlyRent', 'giá thuê', true, 1)
        money('depositAmount', 'tiền cọc')
        if (data.startDate && data.endDate && String(data.endDate) < String(data.startDate))
          err('endDate', 'Ngày kết thúc phải sau ngày bắt đầu')
      } else if (target === 'deposits') {
        needRoomOrLegacy()
        money('amount', 'số dư cọc', true)
      } else if (target === 'debts') {
        needRoomOrLegacy()
        money('amount', 'số tiền nợ', true, 1)
      } else if (target === 'meter_readings') {
        str('roomCode', 'mã phòng', true)
        const u = text(get('utility'))
        const un = u ? normHeader(u) : ''
        if (/^(dien|electric)/.test(un)) data.utility = 'electric'
        else if (/^(nuoc|water)/.test(un)) data.utility = 'water'
        else err('utility', 'Loại phải là điện hoặc nước')
        const pr = get('period')
        const periodDate =
          typeof pr === 'string' && /^\d{4}-\d{2}$/.test(pr.trim())
            ? `${pr.trim()}-01`
            : typeof pr === 'string' && /^\d{1,2}\/\d{4}$/.test(pr.trim())
              ? `${pr.trim().split('/')[1]}-${pr.trim().split('/')[0].padStart(2, '0')}-01`
              : parseFlexibleDate(pr as string | number | Date)
        if (!periodDate) err('period', 'Kỳ không hợp lệ (tháng/năm)')
        else data.period = periodDate.slice(0, 7)
        money('value', 'chỉ số', true)
        day('readOn', 'ngày ghi')
      } else {
        str('code', 'mã tài sản', true)
        str('name', 'tên tài sản', true)
        str('category', 'nhóm')
        str('condition', 'tình trạng')
        str('roomCode', 'mã phòng')
        money('value', 'giá trị')
      }
      if (errors.length === before && facilityCode) valid.push({ target, row: rowNo, facilityCode, data })
      return
    }

    if (target === 'rooms') {
      const code = text(get('roomCode'))
      const price = vnd(get('listPrice'))
      const cap = vnd(get('capacity'))
      const area = isBlank(get('areaM2')) ? undefined : Number(String(get('areaM2')).replace(',', '.'))
      if (price !== undefined && Number.isNaN(price)) err('listPrice', 'Giá không hợp lệ')
      if (cap !== undefined && Number.isNaN(cap)) err('capacity', 'Sức chứa không hợp lệ')
      if (area !== undefined && Number.isNaN(area)) err('areaM2', 'Diện tích không hợp lệ')
      const r = roomInput.safeParse({
        facilityId: PLACEHOLDER_FACILITY_ID,
        code: code ?? '',
        floor: text(get('floor')),
        roomType: text(get('roomType')),
        areaM2: area,
        listPrice: price,
        capacity: cap,
      })
      if (!r.success) {
        for (const issue of r.error.issues) {
          const k = String(issue.path[0])
          err(FIELD_OF_PATH[k] ?? k, issue.message)
        }
      }
      if (errors.length === before && r.success && facilityCode) {
        valid.push({
          target: 'rooms',
          row: rowNo,
          facilityCode,
          facilityName: text(get('facilityName')) ?? null,
          data: r.data,
        })
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
      kind,
      homeFacilityId: PLACEHOLDER_FACILITY_ID,
      phone: num('phone', (s) => (/^[1-9]\d{8}$/.test(s) ? '0' + s : s)),
      email: text(get('email')),
      note: text(get('note')),
      fullName: text(get('fullName')),
      nationality: text(get('nationality')),
      passportNumber: text(get('passportNumber')),
      passportExpiry: get('passportExpiry'),
      visaType: text(get('visaType')),
      visaExpiry: get('visaExpiry'),
      idNumber: num('idNumber', (s) => s.padStart(12, '0')),
      idIssueDate: get('idIssueDate'),
      idIssuePlace: text(get('idIssuePlace')),
      dateOfBirth: get('dateOfBirth'),
      permanentAddress: text(get('permanentAddress')),
      companyName: text(get('companyName')),
      taxCode: num('taxCode', (s) => (s.length === 9 ? '0' + s : s)),
      companyAddress: text(get('companyAddress')),
      representative: text(get('representative')),
      contactPerson: text(get('contactPerson')),
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
