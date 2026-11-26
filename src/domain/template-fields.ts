export const PDF_DOC_TYPES = ['invoice_monthly', 'invoice_termination', 'receipt'] as const
export type PdfDocType = (typeof PDF_DOC_TYPES)[number]

import { formatDateVN } from './dates'
import { ASSET_CONDITION } from './asset-labels'
import { formatVND, numberToVietnameseWords } from './money'
import { TENANT_KIND_LABELS } from './tenant-kind'

export const DOC_TYPES = [
  'deposit_contract',
  'lease',
  'addendum_extension',
  'addendum_transfer',
  'addendum_assignment',
  'addendum_termination',
  'handover_check_in',
  'handover_check_out',
  'invoice_monthly',
  'invoice_termination',
  'receipt',
] as const
export type DocType = (typeof DOC_TYPES)[number]

/** Tám loại giấy tờ soạn từ mẫu trong app (hoá đơn, phiếu thu dựng PDF riêng). */
export type TemplateDocType = Exclude<DocType, PdfDocType>
export const TEMPLATE_DOC_TYPES: readonly TemplateDocType[] = DOC_TYPES.filter(
  (t): t is TemplateDocType => !(PDF_DOC_TYPES as readonly string[]).includes(t),
)

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  deposit_contract: 'Hợp đồng đặt cọc',
  lease: 'Hợp đồng thuê',
  addendum_extension: 'Phụ lục gia hạn',
  addendum_transfer: 'Phụ lục chuyển phòng',
  addendum_assignment: 'Phụ lục chuyển nhượng hợp đồng',
  addendum_termination: 'Phụ lục thanh lý',
  handover_check_in: 'Biên bản bàn giao check-in',
  handover_check_out: 'Biên bản bàn giao check-out',
  invoice_monthly: 'Hoá đơn tháng',
  invoice_termination: 'Hoá đơn thanh lý',
  receipt: 'Phiếu thu',
}

export type LoopField = { key: string; label: string; example: string }
export type Field = { key: string; label: string; example: string; loop?: { key: string; fields: LoopField[] } }

const f = (key: string, label: string, example: string): Field => ({ key, label, example })
const loop = (key: string, label: string, fields: LoopField[]): Field => ({
  key,
  label,
  example: '(danh sách các dòng)',
  loop: { key, fields },
})

const PERSON: Field[] = [
  f('ten_khach', 'Họ tên khách (hoặc tên công ty)', 'John Miller'),
  f('loai_khach', 'Loại khách', 'Khách nước ngoài'),
  f('so_giay_to', 'Số passport / CCCD / mã số thuế', 'P1234567'),
  f('so_dien_thoai', 'Số điện thoại', '+84 90 123 4567'),
  f('email', 'Email', 'john@example.com'),
  f('ten_cong_ty', 'Tên công ty (nếu khách là công ty)', 'Công ty TNHH Ánh Dương'),
  f('ma_so_thue', 'Mã số thuế (nếu là công ty)', '0312345678'),
]
const SITE: Field[] = [
  f('co_so', 'Tên cơ sở', 'Thảo Điền'),
  f('dia_chi_co_so', 'Địa chỉ cơ sở', '12 Xuân Thuỷ, Thảo Điền, TP. Thủ Đức'),
  f('so_phong', 'Số phòng', '301'),
  f('ngay_lap', 'Ngày lập', '14/10/2026'),
]
const MONEY = (key: string, label: string, vnd: number): Field[] => [
  f(key, label, formatVND(vnd)),
  f(`${key}_bang_chu`, `${label} bằng chữ`, numberToVietnameseWords(vnd)),
]
const SERVICE_FEES = loop('phi_dich_vu', 'Danh sách phí dịch vụ', [
  { key: 'ten', label: 'Tên phí', example: 'Phí dịch vụ' },
  { key: 'don_vi', label: 'Đơn vị', example: 'người' },
  { key: 'so_luong', label: 'Số lượng', example: '2' },
  { key: 'don_gia', label: 'Đơn giá', example: '200.000' },
  { key: 'chi_so_dau', label: 'Chỉ số đầu', example: '1.200 (15/10/2026)' },
])
const OCCUPANTS = loop('nguoi_o', 'Danh sách người ở', [
  { key: 'ho_ten', label: 'Họ tên', example: 'John Miller' },
  { key: 'giay_to', label: 'Số giấy tờ', example: 'P1234567' },
])
const INVOICE_LINES = loop('dong', 'Các dòng hoá đơn', [
  { key: 'mo_ta', label: 'Mô tả', example: 'Tiền phòng tháng 12/2026' },
  { key: 'so_luong', label: 'Số lượng', example: '1' },
  { key: 'don_gia', label: 'Đơn giá', example: '9.000.000' },
  { key: 'thanh_tien', label: 'Thành tiền', example: '9.000.000' },
])
const HANDOVER_CHECK_IN: Field[] = [
  f('ma_hop_dong', 'Mã hợp đồng', 'TD-HĐ-2026-0001'),
  f('ngay_ban_giao', 'Ngày bàn giao', '15/10/2026'),
  loop('tai_san', 'Danh sách tài sản', [
    { key: 'ma', label: 'Mã tài sản', example: 'TS-0101' },
    { key: 'ten', label: 'Tên tài sản', example: 'Máy lạnh' },
    { key: 'tinh_trang', label: 'Tình trạng', example: ASSET_CONDITION.good },
  ]),
  loop('chi_so', 'Chỉ số điện nước', [
    { key: 'loai', label: 'Loại (điện/nước)', example: 'Điện' },
    { key: 'so_dong_ho', label: 'Số đồng hồ', example: 'E-301' },
    { key: 'chi_so', label: 'Chỉ số', example: '1200' },
  ]),
]
const HANDOVER: Field[] = [
  f('ma_hop_dong', 'Mã hợp đồng', 'TD-HĐ-2026-0001'),
  f('ngay_ban_giao', 'Ngày bàn giao', '15/10/2026'),
  loop('tai_san', 'Danh sách tài sản', [
    { key: 'ma', label: 'Mã tài sản', example: 'TS-0101' },
    { key: 'ten', label: 'Tên tài sản', example: 'Máy lạnh' },
    { key: 'tinh_trang', label: 'Tình trạng', example: ASSET_CONDITION.good },
    { key: 'phat', label: 'Tiền phạt', example: '0' },
  ]),
  loop('chi_so', 'Chỉ số điện nước', [
    { key: 'loai', label: 'Loại (điện/nước)', example: 'Điện' },
    { key: 'so_dong_ho', label: 'Số đồng hồ', example: 'E-301' },
    { key: 'chi_so', label: 'Chỉ số', example: '1200' },
  ]),
  f('tong_phat', 'Tổng tiền phạt', '0'),
]
const INVOICE: Field[] = [
  f('ma_hoa_don', 'Mã hoá đơn', 'TD-HD-202612-0001'),
  f('ky', 'Kỳ hoá đơn', '01/12/2026 – 31/12/2026'),
  f('ngay_lap', 'Ngày lập', '01/12/2026'),
  f('han_thanh_toan', 'Hạn thanh toán', '08/12/2026'),
  f('tong_tien', 'Tổng tiền', '9.380.000'),
  f('tong_tien_bang_chu', 'Tổng tiền bằng chữ', 'Chín triệu ba trăm tám mươi nghìn đồng'),
  f('ngan_hang', 'Ngân hàng nhận tiền', 'Vietcombank'),
  f('so_tai_khoan', 'Số tài khoản nhận tiền', '0123456789'),
  f('chu_tai_khoan', 'Chủ tài khoản', 'CONG TY SIRIS'),
  f('noi_dung_ck', 'Nội dung chuyển khoản', 'TD-HD-202612-0001'),
  f('ghi_chu', 'Ghi chú của hoá đơn', 'Chuyển khoản trước hạn để được giữ giá'),
  f('da_thanh_toan', 'Đã thanh toán', '0'),
  f('con_lai', 'Còn phải trả', '9.380.000'),
  f('ket_luan', 'Kết luận thanh toán (ai trả ai)', 'Khách phải thanh toán: 9.380.000 ₫'),
  f('ket_luan_bang_chu', 'Kết luận bằng chữ', 'Chín triệu ba trăm tám mươi nghìn đồng'),
  f('tom_tat_thanh_toan', 'Tóm tắt đã thanh toán, còn lại', 'Đã thanh toán: 0 ₫ · Còn phải trả: 9.380.000 ₫'),
  INVOICE_LINES,
]

export const TEMPLATE_FIELDS: Record<DocType, Field[]> = {
  deposit_contract: [
    ...PERSON,
    ...SITE,
    ...MONEY('tien_coc', 'Tiền cọc giữ chỗ', 5_000_000),
    ...MONEY('gia_thue', 'Giá thuê thoả thuận', 9_000_000),
    f('ngay_vao_o_du_kien', 'Ngày vào ở dự kiến', '01/12/2026'),
  ],
  lease: [
    ...PERSON,
    ...SITE,
    f('ma_hop_dong', 'Mã hợp đồng', 'TD-HĐ-2026-0001'),
    f('ngay_bat_dau', 'Ngày bắt đầu', '15/10/2026'),
    f('ngay_ket_thuc', 'Ngày kết thúc', '14/10/2027'),
    ...MONEY('gia_thue', 'Giá thuê tháng', 9_000_000),
    ...MONEY('tien_coc', 'Tiền cọc', 9_000_000),
    SERVICE_FEES,
    OCCUPANTS,
  ],
  addendum_extension: [
    ...PERSON,
    ...SITE,
    f('ma_hop_dong', 'Mã hợp đồng', 'TD-HĐ-2026-0001'),
    f('ngay_hieu_luc', 'Ngày hiệu lực', '15/10/2027'),
    f('ngay_ket_thuc_moi', 'Ngày kết thúc mới', '14/10/2028'),
    ...MONEY('gia_thue_moi', 'Giá thuê mới', 10_000_000),
    ...MONEY('tien_coc_moi', 'Tiền cọc mới', 10_000_000),
  ],
  addendum_transfer: [
    ...PERSON,
    ...SITE,
    f('ma_hop_dong', 'Mã hợp đồng', 'TD-HĐ-2026-0001'),
    f('ngay_hieu_luc', 'Ngày hiệu lực', '15/11/2026'),
    f('phong_cu', 'Phòng cũ', '301'),
    f('phong_moi', 'Phòng mới', '402'),
    ...MONEY('gia_thue_moi', 'Giá thuê mới', 11_000_000),
  ],
  addendum_assignment: [
    ...SITE,
    f('ma_hop_dong', 'Mã hợp đồng', 'TD-HĐ-2026-0001'),
    f('ngay_hieu_luc', 'Ngày hiệu lực', '15/11/2026'),
    f('ten_ben_chuyen', 'Tên bên chuyển nhượng', 'Nguyễn Văn An'),
    f('giay_to_ben_chuyen', 'Giấy tờ bên chuyển nhượng', '012345678901'),
    f('ten_ben_nhan', 'Tên bên nhận chuyển nhượng', 'Trần Thị Bình'),
    f('giay_to_ben_nhan', 'Giấy tờ bên nhận chuyển nhượng', '012345678902'),
  ],
  addendum_termination: [
    ...PERSON,
    ...SITE,
    f('ma_hop_dong', 'Mã hợp đồng', 'TD-HĐ-2026-0001'),
    f('ngay_tra_phong', 'Ngày trả phòng', '20/11/2026'),
    f('tien_hoan_khach', 'Số tiền hoàn cho khách', '11.080.000'),
    f('tien_khach_tra_them', 'Số tiền khách trả thêm', '0'),
  ],
  handover_check_in: [...PERSON, ...SITE, ...HANDOVER_CHECK_IN],
  handover_check_out: [...PERSON, ...SITE, ...HANDOVER],
  invoice_monthly: [...PERSON, ...SITE.filter((x) => x.key !== 'ngay_lap'), ...INVOICE],
  invoice_termination: [
    ...PERSON,
    ...SITE.filter((x) => x.key !== 'ngay_lap'),
    ...INVOICE,
    f('tien_hoan_khach', 'Số tiền hoàn cho khách', '11.080.000'),
  ],
  receipt: [
    ...PERSON,
    ...SITE,
    f('ma_phieu', 'Mã phiếu thu', 'PT-0001'),
    f('ma_hoa_don', 'Mã hoá đơn', 'TD-HD-202612-0001'),
    f('ngay_thu', 'Ngày thu', '05/12/2026'),
    ...MONEY('so_tien', 'Số tiền thu', 5_000_000),
    f('hinh_thuc', 'Hình thức', 'Chuyển khoản'),
    f('nguoi_thu', 'Người thu', 'Lan'),
  ],
}

/** Dữ liệu mẫu dựng từ ví dụ của từng chỗ điền — dùng cho "Thử xuất với dữ liệu mẫu". */
export function sampleDataFor(docType: DocType): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of TEMPLATE_FIELDS[docType]) {
    out[field.key] = field.loop ? [Object.fromEntries(field.loop.fields.map((x) => [x.key, x.example]))] : field.example
  }
  return out
}

// ---------------------------------------------------------------- dựng dữ liệu từ thực thể

export type DocEntities = {
  now?: string
  oldTenant?: { name: string; idDocument?: string | null }
  newTenant?: { name: string; idDocument?: string | null }
  tenant?: {
    kind: 'foreign' | 'vietnamese' | 'company'
    fullName?: string | null
    companyName?: string | null
    idDocument?: string | null
    taxCode?: string | null
    phone?: string | null
    email?: string | null
  }
  occupants?: { fullName: string; idDocument?: string | null }[]
  facility?: { name: string; address?: string | null }
  room?: { code: string; oldCode?: string }
  lease?: { code: string; startDate: string; endDate: string; monthlyRent: number; depositAmount: number }
  deposit?: { depositAmount: number; agreedRent: number; expectedMoveIn: string }
  addendum?: {
    effectiveDate: string
    newEndDate?: string | null
    newMonthlyRent?: number | null
    newDepositAmount?: number | null
    newRoomCode?: string | null
  }
  fees?: { name: string; unit: string; quantity: number; unitPrice: number; initialReading?: string }[]
  invoice?: {
    code: string
    periodStart: string
    periodEnd: string
    dueDate?: string | null
    note?: string
    paid?: number
    bank?: { bankName: string; accountNumber: string; accountName: string } | null
    lines: { description: string; quantity: number; unitPrice: number; amount: number }[]
  }
  /** `readings`: chỉ số chốt trong ngày bàn giao (thanh lý); rỗng khi ngày đó không chốt chỉ số. */
  handover?: {
    date: string
    items: { code: string; name: string; condition: string; penalty?: number }[]
    readings?: { kind: 'electric' | 'water' | 'fee'; label?: string; serial: string; value: number }[]
  }
  payment?: { code: string; paidOn: string; amount: number; method: string; receivedBy: string }
}

const d = (iso?: string | null) => (iso ? formatDateVN(iso) : '')
const m = (n?: number | null) => (n == null ? '' : formatVND(n))
const w = (n?: number | null) => (n == null ? '' : numberToVietnameseWords(n))

/** Dựng dữ liệu điền mẫu: tiền 1.500.000, ngày dd/mm/yyyy, số tiền bằng chữ; thiếu dữ liệu → chuỗi rỗng. */
export function buildTemplateData(docType: DocType, e: DocEntities): Record<string, unknown> {
  const t = e.tenant
  const invoiceTotal = e.invoice?.lines.reduce((s, l) => s + l.amount, 0)
  const refund = invoiceTotal != null && invoiceTotal < 0 ? -invoiceTotal : 0
  const penaltyTotal = e.handover?.items.reduce((s, i) => s + (i.penalty ?? 0), 0) ?? 0
  const data: Record<string, unknown> = {
    ten_khach: (t?.kind === 'company' ? t.companyName : t?.fullName) ?? '',
    loai_khach: t ? TENANT_KIND_LABELS[t.kind] : '',
    so_giay_to: (t?.kind === 'company' ? t.taxCode : t?.idDocument) ?? '',
    so_dien_thoai: t?.phone ?? '',
    email: t?.email ?? '',
    ten_cong_ty: t?.kind === 'company' ? (t.companyName ?? '') : '',
    ma_so_thue: t?.kind === 'company' ? (t.taxCode ?? '') : '',
    co_so: e.facility?.name ?? '',
    dia_chi_co_so: e.facility?.address ?? '',
    so_phong: e.room?.code ?? '',
    ngay_lap: d(e.now),
    ma_hop_dong: e.lease?.code ?? '',
    ngay_bat_dau: d(e.lease?.startDate),
    ngay_ket_thuc: d(e.lease?.endDate),
    gia_thue: m(e.lease?.monthlyRent ?? e.deposit?.agreedRent),
    gia_thue_bang_chu: w(e.lease?.monthlyRent ?? e.deposit?.agreedRent),
    tien_coc: m(e.lease?.depositAmount ?? e.deposit?.depositAmount),
    tien_coc_bang_chu: w(e.lease?.depositAmount ?? e.deposit?.depositAmount),
    ngay_vao_o_du_kien: d(e.deposit?.expectedMoveIn),
    phi_dich_vu: (e.fees ?? []).map((x) => ({
      ten: x.name,
      don_vi: x.unit,
      so_luong: x.quantity,
      don_gia: formatVND(x.unitPrice),
      chi_so_dau: x.initialReading ?? '',
    })),
    nguoi_o: (e.occupants ?? []).map((x) => ({ ho_ten: x.fullName, giay_to: x.idDocument ?? '' })),
    // phụ lục
    ten_ben_chuyen: e.oldTenant?.name ?? '',
    giay_to_ben_chuyen: e.oldTenant?.idDocument ?? '',
    ten_ben_nhan: e.newTenant?.name ?? '',
    giay_to_ben_nhan: e.newTenant?.idDocument ?? '',
    ngay_hieu_luc: d(e.addendum?.effectiveDate),
    ngay_ket_thuc_moi: d(e.addendum?.newEndDate),
    gia_thue_moi: m(e.addendum?.newMonthlyRent),
    gia_thue_moi_bang_chu: w(e.addendum?.newMonthlyRent),
    tien_coc_moi: m(e.addendum?.newDepositAmount),
    tien_coc_moi_bang_chu: w(e.addendum?.newDepositAmount),
    phong_cu: e.room?.oldCode ?? e.room?.code ?? '',
    phong_moi: e.addendum?.newRoomCode ?? '',
    ngay_tra_phong: d(e.addendum?.effectiveDate),
    // hoá đơn
    ma_hoa_don: e.invoice?.code ?? '',
    ky: e.invoice ? `${d(e.invoice.periodStart)} – ${d(e.invoice.periodEnd)}` : '',
    han_thanh_toan: d(e.invoice?.dueDate),
    ghi_chu: e.invoice?.note ?? '',
    tong_tien: m(invoiceTotal),
    tong_tien_bang_chu: w(invoiceTotal),
    ngan_hang: e.invoice?.bank?.bankName ?? '',
    so_tai_khoan: e.invoice?.bank?.accountNumber ?? '',
    chu_tai_khoan: e.invoice?.bank?.accountName ?? '',
    noi_dung_ck: e.invoice?.code ?? '',
    // Tổng dương: khách trả Siris; tổng âm: Siris hoàn trả khách (đã hoàn thì paid âm)
    ket_luan:
      invoiceTotal == null
        ? ''
        : invoiceTotal < 0
          ? `Siris hoàn trả khách: ${m(-invoiceTotal)} ₫`
          : invoiceTotal > 0
            ? `Khách phải thanh toán: ${m(invoiceTotal)} ₫`
            : 'Không phát sinh khoản phải thanh toán',
    ket_luan_bang_chu: invoiceTotal == null ? '' : w(Math.abs(invoiceTotal)),
    tom_tat_thanh_toan:
      invoiceTotal == null
        ? ''
        : invoiceTotal < 0
          ? `Đã hoàn: ${m(-(e.invoice?.paid ?? 0))} ₫ · Còn phải hoàn: ${m(Math.max((e.invoice?.paid ?? 0) - invoiceTotal, 0))} ₫`
          : `Đã thanh toán: ${m(e.invoice?.paid ?? 0)} ₫ · Còn phải trả: ${m(Math.max(invoiceTotal - (e.invoice?.paid ?? 0), 0))} ₫`,
    da_thanh_toan: m(e.invoice?.paid ?? 0),
    con_lai: m(invoiceTotal == null ? null : invoiceTotal - (e.invoice?.paid ?? 0)),
    tien_hoan_khach: m(refund),
    tien_khach_tra_them: m(invoiceTotal != null && invoiceTotal > 0 ? invoiceTotal : 0),
    dong: (e.invoice?.lines ?? []).map((l) => ({
      mo_ta: l.description,
      so_luong: l.quantity,
      don_gia: formatVND(l.unitPrice),
      thanh_tien: formatVND(l.amount),
    })),
    // bàn giao
    ngay_ban_giao: d(e.handover?.date),
    tai_san: (e.handover?.items ?? []).map((i) => ({
      ma: i.code,
      ten: i.name,
      tinh_trang: i.condition,
      phat: formatVND(i.penalty ?? 0),
    })),
    chi_so: (e.handover?.readings ?? []).map((r) => ({
      loai: r.label ?? (r.kind === 'electric' ? 'Điện' : r.kind === 'water' ? 'Nước' : 'Đồng hồ'),
      so_dong_ho: r.serial,
      chi_so: r.value,
    })),
    tong_phat: formatVND(penaltyTotal),
    // phiếu thu
    ma_phieu: e.payment?.code ?? '',
    ngay_thu: d(e.payment?.paidOn),
    so_tien: m(e.payment?.amount),
    so_tien_bang_chu: w(e.payment?.amount),
    hinh_thuc: e.payment?.method ?? '',
    nguoi_thu: e.payment?.receivedBy ?? '',
  }
  void docType
  return data
}
