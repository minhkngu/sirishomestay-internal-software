import type { TemplateStyle } from './doc-template'
import { TEMPLATE_FIELDS } from '@/domain/template-fields'

const LABEL = new Map(TEMPLATE_FIELDS.invoice_termination.map((f) => [f.key, f.label]))
const LINE_LABEL = new Map(
  TEMPLATE_FIELDS.invoice_termination.flatMap((f) => f.loop?.fields ?? []).map((f) => [f.key, f.label]),
)
/** `[khoá]` thành chỗ điền (nhãn lấy từ danh sách chỗ điền của hoá đơn). */
const chips = (text: string) =>
  text.replace(
    /\[(\w+)\]/g,
    (_, k: string) => `<span data-field="${k}">${LABEL.get(k) ?? LINE_LABEL.get(k) ?? k}</span>`,
  )
const p = (text: string, attrs = '') => `<p${attrs}>${chips(text)}</p>`

const LINES = `<table><tr><th>Khoản</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr><tr data-loop="dong">${['mo_ta', 'so_luong', 'don_gia', 'thanh_tien'].map((k) => `<td><p>${chips(`[${k}]`)}</p></td>`).join('')}</tr></table>`
const PAYMENT = [
  p('<strong>Thanh toán</strong>'),
  p('Ngân hàng: [ngan_hang]'),
  p('Số tài khoản: [so_tai_khoan]'),
  p('Chủ tài khoản: [chu_tai_khoan]'),
  p('Nội dung chuyển khoản: [noi_dung_ck]'),
  p('Hạn thanh toán: [han_thanh_toan]'),
  '<div data-role="qr"></div>',
]

/** Hai mẫu hoá đơn khởi đầu: Trang trọng và Hiện đại; dùng chung cho hoá đơn tháng và hoá đơn thanh lý. */
export const DEFAULT_INVOICE_TEMPLATES: Record<TemplateStyle, { name: string; html: string }> = {
  formal: {
    name: 'Hoá đơn (Trang trọng)',
    html: [
      '<h1 style="text-align:center">HOÁ ĐƠN</h1>',
      p('Số: [ma_hoa_don]', ' style="text-align:center"'),
      p('<strong>[co_so]</strong> · [dia_chi_co_so]'),
      p('Khách thuê: [ten_khach]'),
      p('Phòng: [so_phong] · Điện thoại: [so_dien_thoai]'),
      p('Kỳ: [ky] · Ngày lập: [ngay_lap]'),
      LINES,
      p('<strong>Tổng cộng: [tong_tien] ₫</strong>', ' style="text-align:right"'),
      p('Bằng chữ: [tong_tien_bang_chu]', ' style="text-align:right"'),
      p('Đã thanh toán: [da_thanh_toan] ₫ · Còn phải trả: [con_lai] ₫', ' style="text-align:right"'),
      p('[ghi_chu]'),
      ...PAYMENT,
    ].join(''),
  },
  modern: {
    name: 'Hoá đơn (Hiện đại)',
    html: [
      '<h1>HOÁ ĐƠN</h1>',
      p('<strong>[co_so]</strong> · [dia_chi_co_so]'),
      p('Số: [ma_hoa_don] · Ngày lập: [ngay_lap]'),
      '<div data-role="summary">' +
        [
          ['Phòng', '[so_phong]'],
          ['Kỳ', '[ky]'],
          ['Hạn thanh toán', '[han_thanh_toan]'],
          ['Tổng cộng', '[tong_tien] ₫'],
        ]
          .map(([l, v]) => `<div data-label="${l}">${chips(v)}</div>`)
          .join('') +
        '</div>',
      p('Khách thuê: [ten_khach] · Điện thoại: [so_dien_thoai]'),
      LINES,
      p('Bằng chữ: [tong_tien_bang_chu]', ' style="text-align:right"'),
      p('Đã thanh toán: [da_thanh_toan] ₫ · Còn phải trả: [con_lai] ₫', ' style="text-align:right"'),
      p('[ghi_chu]'),
      ...PAYMENT,
    ].join(''),
  },
}

export const DEFAULT_INVOICE_HTML: Record<TemplateStyle, string> = {
  formal: DEFAULT_INVOICE_TEMPLATES.formal.html,
  modern: DEFAULT_INVOICE_TEMPLATES.modern.html,
}
