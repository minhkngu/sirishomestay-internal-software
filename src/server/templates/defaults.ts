import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { docTemplates } from '@/db'
import type { DB } from '@/db/client'
import { assertCan, type AccessContext } from '@/domain/access'
import { ValidationError } from '@/domain/errors'
import type { TemplateStyle } from '@/domain/doc-template'
import {
  DOC_TYPE_LABELS,
  TEMPLATE_DOC_TYPES,
  TEMPLATE_FIELDS,
  type DocType,
  type TemplateDocType,
} from '@/domain/template-fields'
import { recordAudit } from '@/server/audit'
import { isUsableTemplate, type DocTemplate } from './service'

// ---------------------------------------------------------------- nội dung khởi đầu của từng loại

/** Đoạn văn: `[khoá]` thành chỗ điền; chuỗi bắt đầu bằng `@bang:` là bảng lặp theo khoá; chuỗi bắt đầu bằng `<` giữ nguyên. */
type Article = { t: string; p: string[] }
type Content = {
  /** Chỗ điền in dưới tiêu đề: "Số: …" */
  code?: string
  summary: [label: string, value: string][]
  intro: string[]
  articles: Article[]
  sign: string[]
}

const BEN_A = '<strong>Bên A (bên cho thuê):</strong> Siris, cơ sở [co_so], địa chỉ [dia_chi_co_so].'
const BEN_B =
  '<strong>Bên B (bên thuê):</strong> [ten_khach] ([loai_khach]); số giấy tờ: [so_giay_to]; điện thoại: [so_dien_thoai]; email: [email].'
const SIGN_AB = ['Bên A (Siris)', 'Bên B (khách thuê)']
const GENERAL =
  'Hai bên cam kết thực hiện đúng các điều khoản trên. Hợp đồng lập thành hai bản, mỗi bên giữ một bản có giá trị như nhau.'
const KEEP = 'Các điều khoản khác của hợp đồng [ma_hop_dong] không thay đổi và tiếp tục có hiệu lực.'

const CONTENT: Record<TemplateDocType, Content> = {
  deposit_contract: {
    summary: [
      ['Phòng', '[so_phong]'],
      ['Giá thuê', '[gia_thue]'],
      ['Tiền cọc', '[tien_coc]'],
      ['Vào ở dự kiến', '[ngay_vao_o_du_kien]'],
    ],
    intro: ['Hôm nay, ngày [ngay_lap], tại cơ sở [co_so], hai bên thoả thuận như sau:', BEN_A, BEN_B],
    articles: [
      { t: 'Mục đích đặt cọc', p: ['Bên B đặt cọc để giữ phòng [so_phong] tại cơ sở [co_so] nhằm thuê dài hạn.'] },
      {
        t: 'Tiền cọc và giá thuê',
        p: [
          'Tiền cọc giữ chỗ: [tien_coc] (bằng chữ: [tien_coc_bang_chu]).',
          'Giá thuê thoả thuận: [gia_thue] mỗi tháng (bằng chữ: [gia_thue_bang_chu]).',
        ],
      },
      {
        t: 'Ngày vào ở',
        p: ['Ngày vào ở dự kiến: [ngay_vao_o_du_kien]. Hai bên ký hợp đồng thuê chậm nhất vào ngày này.'],
      },
      {
        t: 'Xử lý tiền cọc',
        p: [
          'Khi hai bên ký hợp đồng thuê, tiền cọc giữ chỗ được chuyển thành một phần tiền cọc của hợp đồng thuê.',
          'Nếu Bên B không thuê mà không có lý do chính đáng, Bên A giữ lại tiền cọc. Nếu Bên A không giao được phòng, Bên A hoàn lại toàn bộ tiền cọc.',
        ],
      },
      { t: 'Điều khoản chung', p: [GENERAL] },
    ],
    sign: SIGN_AB,
  },
  lease: {
    code: 'ma_hop_dong',
    summary: [
      ['Phòng', '[so_phong]'],
      ['Giá thuê', '[gia_thue]'],
      ['Tiền cọc', '[tien_coc]'],
      ['Thời hạn', '[ngay_bat_dau] đến [ngay_ket_thuc]'],
    ],
    intro: [
      'Hôm nay, ngày [ngay_lap], tại cơ sở [co_so], hai bên ký hợp đồng thuê phòng với nội dung sau:',
      BEN_A,
      BEN_B,
    ],
    articles: [
      {
        t: 'Phòng thuê',
        p: ['Bên A cho Bên B thuê phòng [so_phong] tại cơ sở [co_so], địa chỉ [dia_chi_co_so], để ở.'],
      },
      { t: 'Thời hạn thuê', p: ['Từ ngày [ngay_bat_dau] đến ngày [ngay_ket_thuc].'] },
      {
        t: 'Giá thuê và thanh toán',
        p: [
          'Giá thuê: [gia_thue] mỗi tháng (bằng chữ: [gia_thue_bang_chu]).',
          'Bên B thanh toán theo hoá đơn hằng tháng do Bên A phát hành, đúng hạn ghi trên hoá đơn.',
        ],
      },
      {
        t: 'Tiền cọc',
        p: [
          'Tiền cọc: [tien_coc] (bằng chữ: [tien_coc_bang_chu]). Bên A hoàn lại khi hợp đồng chấm dứt, sau khi trừ các khoản Bên B còn nợ hoặc phải bồi thường.',
        ],
      },
      { t: 'Phí dịch vụ', p: ['Các khoản phí Bên B thanh toán thêm:', '@bang:phi_dich_vu'] },
      { t: 'Người ở', p: ['Những người được ở cùng trong phòng:', '@bang:nguoi_o'] },
      {
        t: 'Quyền và nghĩa vụ',
        p: [
          'Bên B giữ gìn tài sản, tuân thủ nội quy của cơ sở và không cho thuê lại khi chưa có đồng ý bằng văn bản của Bên A.',
          'Bên A bảo đảm phòng ở đúng tình trạng đã bàn giao và hỗ trợ sửa chữa trong phạm vi trách nhiệm của mình.',
        ],
      },
      {
        t: 'Chấm dứt hợp đồng',
        p: [
          'Mỗi bên báo trước cho bên kia bằng văn bản trước khi chấm dứt. Hai bên lập biên bản bàn giao và quyết toán khi trả phòng.',
        ],
      },
      { t: 'Điều khoản chung', p: [GENERAL] },
    ],
    sign: SIGN_AB,
  },
  addendum_extension: {
    code: 'ma_hop_dong',
    summary: [
      ['Hiệu lực từ', '[ngay_hieu_luc]'],
      ['Gia hạn đến', '[ngay_ket_thuc_moi]'],
      ['Giá thuê mới', '[gia_thue_moi]'],
      ['Tiền cọc mới', '[tien_coc_moi]'],
    ],
    intro: ['Căn cứ hợp đồng thuê [ma_hop_dong] đã ký, hai bên lập phụ lục gia hạn như sau:', BEN_A, BEN_B],
    articles: [
      {
        t: 'Gia hạn',
        p: ['Hợp đồng được gia hạn kể từ ngày [ngay_hieu_luc] đến ngày [ngay_ket_thuc_moi] đối với phòng [so_phong].'],
      },
      {
        t: 'Giá thuê và tiền cọc',
        p: [
          'Giá thuê mới: [gia_thue_moi] mỗi tháng (bằng chữ: [gia_thue_moi_bang_chu]).',
          'Tiền cọc mới: [tien_coc_moi] (bằng chữ: [tien_coc_moi_bang_chu]).',
        ],
      },
      { t: 'Hiệu lực', p: [KEEP] },
    ],
    sign: SIGN_AB,
  },
  addendum_transfer: {
    code: 'ma_hop_dong',
    summary: [
      ['Hiệu lực từ', '[ngay_hieu_luc]'],
      ['Phòng cũ', '[phong_cu]'],
      ['Phòng mới', '[phong_moi]'],
      ['Giá thuê mới', '[gia_thue_moi]'],
    ],
    intro: ['Căn cứ hợp đồng thuê [ma_hop_dong] đã ký, hai bên lập phụ lục chuyển phòng như sau:', BEN_A, BEN_B],
    articles: [
      {
        t: 'Chuyển phòng',
        p: ['Kể từ ngày [ngay_hieu_luc], Bên B chuyển từ phòng [phong_cu] sang phòng [phong_moi] tại cơ sở [co_so].'],
      },
      { t: 'Giá thuê', p: ['Giá thuê phòng mới: [gia_thue_moi] mỗi tháng (bằng chữ: [gia_thue_moi_bang_chu]).'] },
      { t: 'Bàn giao', p: ['Hai bên lập biên bản bàn giao phòng cũ và phòng mới vào ngày chuyển.'] },
      { t: 'Hiệu lực', p: [KEEP] },
    ],
    sign: SIGN_AB,
  },
  addendum_assignment: {
    code: 'ma_hop_dong',
    summary: [
      ['Hiệu lực từ', '[ngay_hieu_luc]'],
      ['Bên chuyển', '[ten_ben_chuyen]'],
      ['Bên nhận', '[ten_ben_nhan]'],
      ['Phòng', '[so_phong]'],
    ],
    intro: [
      'Căn cứ hợp đồng thuê [ma_hop_dong] đã ký, các bên lập phụ lục chuyển nhượng hợp đồng như sau:',
      BEN_A,
      '<strong>Bên chuyển nhượng:</strong> [ten_ben_chuyen]; số giấy tờ: [giay_to_ben_chuyen].',
      '<strong>Bên nhận chuyển nhượng:</strong> [ten_ben_nhan]; số giấy tờ: [giay_to_ben_nhan].',
    ],
    articles: [
      {
        t: 'Chuyển nhượng',
        p: [
          'Kể từ ngày [ngay_hieu_luc], bên chuyển nhượng chuyển toàn bộ quyền và nghĩa vụ thuê phòng [so_phong] tại cơ sở [co_so] cho bên nhận chuyển nhượng.',
        ],
      },
      {
        t: 'Tiền cọc và nghĩa vụ tài chính',
        p: [
          'Tiền cọc hiện có được giữ nguyên cho bên nhận. Hai bên tự thanh toán với nhau các khoản phát sinh trước ngày hiệu lực.',
        ],
      },
      { t: 'Hiệu lực', p: [KEEP] },
    ],
    sign: ['Bên chuyển nhượng', 'Bên nhận chuyển nhượng', 'Bên A (Siris)'],
  },
  addendum_termination: {
    code: 'ma_hop_dong',
    summary: [
      ['Trả phòng', '[ngay_tra_phong]'],
      ['Phòng', '[so_phong]'],
      ['Hoàn cho khách', '[tien_hoan_khach]'],
      ['Khách trả thêm', '[tien_khach_tra_them]'],
    ],
    intro: ['Căn cứ hợp đồng thuê [ma_hop_dong] đã ký, hai bên lập phụ lục thanh lý như sau:', BEN_A, BEN_B],
    articles: [
      {
        t: 'Thanh lý hợp đồng',
        p: ['Hai bên thống nhất chấm dứt hợp đồng thuê phòng [so_phong] kể từ ngày [ngay_tra_phong].'],
      },
      {
        t: 'Quyết toán',
        p: [
          'Số tiền Bên A hoàn lại cho Bên B: [tien_hoan_khach].',
          'Số tiền Bên B trả thêm cho Bên A: [tien_khach_tra_them].',
        ],
      },
      { t: 'Bàn giao phòng', p: ['Bên B trả phòng và tài sản theo biên bản bàn giao check-out.'] },
      {
        t: 'Hoàn tất nghĩa vụ',
        p: ['Sau khi hoàn tất quyết toán, hai bên không còn nghĩa vụ nào với nhau theo hợp đồng.'],
      },
    ],
    sign: SIGN_AB,
  },
  handover_check_in: {
    code: 'ma_hop_dong',
    summary: [
      ['Phòng', '[so_phong]'],
      ['Bên nhận', '[ten_khach]'],
      ['Ngày bàn giao', '[ngay_ban_giao]'],
      ['Tiền phạt', '[tong_phat]'],
    ],
    intro: [
      'Hôm nay, ngày [ngay_ban_giao], Bên A bàn giao phòng [so_phong] tại cơ sở [co_so] cho Bên B theo hợp đồng [ma_hop_dong].',
      BEN_A,
      BEN_B,
    ],
    articles: [
      { t: 'Tài sản bàn giao', p: ['@bang:tai_san'] },
      {
        t: 'Xác nhận',
        p: [
          'Hai bên đã cùng kiểm tra và thống nhất tình trạng tài sản như trên. Biên bản lập thành hai bản, mỗi bên giữ một bản.',
        ],
      },
    ],
    sign: ['Bên giao (Siris)', 'Bên nhận (khách thuê)'],
  },
  handover_check_out: {
    code: 'ma_hop_dong',
    summary: [
      ['Phòng', '[so_phong]'],
      ['Bên trả', '[ten_khach]'],
      ['Ngày bàn giao', '[ngay_ban_giao]'],
      ['Tiền phạt', '[tong_phat]'],
    ],
    intro: [
      'Hôm nay, ngày [ngay_ban_giao], Bên B trả lại phòng [so_phong] tại cơ sở [co_so] cho Bên A theo hợp đồng [ma_hop_dong].',
      BEN_A,
      BEN_B,
    ],
    articles: [
      { t: 'Tài sản khi trả phòng', p: ['@bang:tai_san'] },
      { t: 'Tiền phạt', p: ['Tổng tiền phạt do hư hỏng hoặc mất tài sản: [tong_phat].'] },
      {
        t: 'Xác nhận',
        p: [
          'Hai bên đã cùng kiểm tra và thống nhất tình trạng tài sản như trên. Biên bản lập thành hai bản, mỗi bên giữ một bản.',
        ],
      },
    ],
    sign: ['Bên nhận lại (Siris)', 'Bên trả (khách thuê)'],
  },
}

// ---------------------------------------------------------------- dựng HTML

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function labelOf(docType: TemplateDocType, key: string): string {
  for (const f of TEMPLATE_FIELDS[docType]) {
    if (f.key === key) return f.label
    const inner = f.loop?.fields.find((x) => x.key === key)
    if (inner) return inner.label
  }
  throw new Error(`Chỗ điền "${key}" không có trong loại ${docType}`)
}

const chip = (docType: TemplateDocType, key: string) => `<span data-field="${key}">${esc(labelOf(docType, key))}</span>`
/** Thay `[khoá]` bằng chỗ điền; phần chữ còn lại giữ nguyên (đã là HTML của mẫu). */
const fill = (docType: TemplateDocType, s: string) => s.replace(/\[(\w+)\]/g, (_, k: string) => chip(docType, k))
const para = (docType: TemplateDocType, s: string, align?: string) =>
  s.startsWith('<table') ? s : `<p${align ? ` style="text-align:${align}"` : ''}>${fill(docType, s)}</p>`

function loopTable(docType: TemplateDocType, key: string): string {
  const loop = TEMPLATE_FIELDS[docType].find((f) => f.loop?.key === key)?.loop
  if (!loop) throw new Error(`Danh sách lặp "${key}" không có trong loại ${docType}`)
  const head = loop.fields.map((x) => `<th>${esc(x.label)}</th>`).join('')
  const row = loop.fields.map((x) => `<td>${chip(docType, x.key)}</td>`).join('')
  return `<table><tr>${head}</tr><tr data-loop="${key}">${row}</tr></table>`
}

const body = (docType: TemplateDocType, p: string) =>
  p.startsWith('@bang:') ? loopTable(docType, p.slice(6)) : para(docType, p)

function signTable(labels: string[]): string {
  const cell = (l: string) =>
    `<td><p style="text-align:center"><strong>${esc(l)}</strong></p><p style="text-align:center">(Ký, ghi rõ họ tên)</p><p> </p><p> </p><p style="text-align:center">………………………</p></td>`
  return `<table><tr>${labels.map(cell).join('')}</tr></table>`
}

function build(docType: TemplateDocType, style: TemplateStyle): string {
  const c = CONTENT[docType]
  const title = esc(DOC_TYPE_LABELS[docType].toUpperCase())
  const code = c.code ? `Số: ${chip(docType, c.code)}` : ''
  const out: string[] = []
  if (style === 'formal') {
    out.push('<p style="text-align:center"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></p>')
    out.push('<p style="text-align:center"><strong>Độc lập – Tự do – Hạnh phúc</strong></p>')
    out.push(`<h1 style="text-align:center">${title}</h1>`)
    if (code) out.push(`<p style="text-align:center">${code}</p>`)
    for (const s of c.intro) out.push(para(docType, s, 'justify'))
    c.articles.forEach((a, i) => {
      out.push(`<p><strong>Điều ${i + 1}. ${esc(a.t)}</strong></p>`)
      for (const p of a.p) out.push(p.startsWith('@bang:') ? body(docType, p) : para(docType, p, 'justify'))
    })
  } else {
    out.push(`<h1>${title}</h1>`)
    out.push(`<p>Cơ sở ${chip(docType, 'co_so')}, lập ngày ${chip(docType, 'ngay_lap')}${code ? `. ${code}` : ''}</p>`)
    out.push(
      `<div data-role="summary">${c.summary.map(([l, v]) => `<div data-label="${esc(l)}">${fill(docType, v)}</div>`).join('')}</div>`,
    )
    for (const s of c.intro) out.push(para(docType, s))
    c.articles.forEach((a, i) => {
      out.push(`<h2>${i + 1}. ${esc(a.t)}</h2>`)
      for (const p of a.p) out.push(body(docType, p))
    })
  }
  out.push(signTable(c.sign))
  return out.join('')
}

const STYLE_NAME: Record<TemplateStyle, string> = { formal: 'Trang trọng', modern: 'Hiện đại' }
const STYLES: readonly TemplateStyle[] = ['formal', 'modern']

/** Mười sáu mẫu khởi đầu (tám loại × hai kiểu); nội dung pháp lý là bản mở đầu để nhân viên chỉnh lại. */
export const DEFAULT_TEMPLATES = Object.fromEntries(
  TEMPLATE_DOC_TYPES.map((t) => [
    t,
    Object.fromEntries(STYLES.map((s) => [s, { name: `${DOC_TYPE_LABELS[t]} (${STYLE_NAME[s]})`, html: build(t, s) }])),
  ]),
) as Record<TemplateDocType, Record<TemplateStyle, { name: string; html: string }>>

// ---------------------------------------------------------------- tạo mẫu mặc định

const isTemplateDocType = (t: string): t is TemplateDocType => (TEMPLATE_DOC_TYPES as readonly string[]).includes(t)

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

/**
 * Tạo các mẫu mặc định còn thiếu của một loại (so theo tên, không ghi đè mẫu đã sửa).
 * `onlyIfNone`: bỏ qua khi loại đã có mẫu dùng được. Trả số mẫu đã tạo.
 */
async function seed(tx: Tx, ctx: AccessContext, docType: TemplateDocType, onlyIfNone: boolean): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`doc_templates:${docType}`}))`)
  const rows = (await tx
    .select()
    .from(docTemplates)
    .where(eq(docTemplates.docType, docType))
    .orderBy(asc(docTemplates.createdAt))) as DocTemplate[]
  const usable = rows.filter(isUsableTemplate)
  if (onlyIfNone && usable.length) return 0
  let hasDefault = usable.some((t) => t.isDefault)
  let created = 0
  for (const style of STYLES) {
    const { name, html } = DEFAULT_TEMPLATES[docType][style]
    if (usable.some((t) => t.name === name)) continue
    const makeDefault = !hasDefault
    const [t] = await tx
      .insert(docTemplates)
      .values({ docType, name, body: html, style, isDefault: makeDefault })
      .returning()
    if (makeDefault)
      await tx
        .update(docTemplates)
        .set({ isDefault: false })
        .where(and(eq(docTemplates.docType, docType), ne(docTemplates.id, t.id)))
    hasDefault = true
    created++
    await recordAudit(tx, ctx, {
      action: 'create',
      entity: 'doc_template',
      entityId: t.id,
      summary: `Tạo mẫu mặc định ${name}`,
      after: { ...t, body: '(mặc định)' },
    })
  }
  return created
}

/**
 * Bảo đảm loại giấy tờ có mẫu dùng được: chưa có thì tạo cả hai mẫu mặc định (Trang trọng là mặc định) rồi trả mẫu mặc định.
 * Không cần quyền cài đặt — việc xuất giấy tờ tự gọi. Khoá theo loại nên hai yêu cầu cùng lúc chỉ tạo một bộ.
 */
export async function ensureDefaultTemplate(db: DB, ctx: AccessContext, docType: DocType): Promise<DocTemplate> {
  if (!isTemplateDocType(docType)) throw new ValidationError('Loại giấy tờ này không dùng mẫu')
  return db.transaction(async (tx) => {
    await seed(tx, ctx, docType, true)
    const rows = (await tx
      .select()
      .from(docTemplates)
      .where(eq(docTemplates.docType, docType))
      .orderBy(asc(docTemplates.createdAt))) as DocTemplate[]
    const usable = rows.filter(isUsableTemplate)
    return usable.find((t) => t.isDefault) ?? usable[0]
  })
}

/** Tạo lại mọi mẫu mặc định còn thiếu (theo tên); trả số mẫu đã tạo. Chỉ nhóm quyền `settings`. */
export async function restoreDefaultTemplates(db: DB, ctx: AccessContext): Promise<number> {
  assertCan(ctx, 'settings')
  return db.transaction(async (tx) => {
    let n = 0
    for (const t of TEMPLATE_DOC_TYPES) n += await seed(tx, ctx, t, false)
    return n
  })
}
