# Ổn định app, tăng tốc, hoá đơn PDF có QR, giá phí theo toà, giao diện Bạc hà — kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Hết "Application error", trang tải nhanh hơn, hoá đơn và phiếu thu xuất PDF có QR VietQR (ảnh vẽ từ PDF), giá phí dịch vụ chung có thể đặt riêng theo toà, và giao diện Bạc hà với bộ lọc Toà thay cho ô chọn cơ sở.

**Kiến trúc:** Giữ N-Layer: `app` → `features` → `server` → `domain`/`db`.
- Phần tính toán thuần đặt ở `src/domain`: VietQR, danh sách ngân hàng, chọn tài khoản nhận tiền, chọn giá phí.
- Bộ dựng PDF đặt ở `src/server/pdf/`, dùng `@react-pdf/renderer`.
- `exportDocument` rẽ sang bộ dựng PDF cho ba loại giấy tờ thu tiền. Các loại còn lại vẫn đi đường Word → Gotenberg như cũ.

**Công nghệ:** Next.js 16 App Router, React 19, Drizzle + Postgres, Vitest + PGlite, Playwright. Thư viện mới: `@react-pdf/renderer`, `qrcode`, `@types/qrcode`.

**Spec:** `docs/superpowers/specs/2026-11-17-on-dinh-giao-dien-hoa-don-pdf-design.md`

## Ràng buộc chung

- Trước khi viết code Next.js, đọc `node_modules/next/dist/docs/` (theo AGENTS.md).
- Import một chiều:
  - `domain` không import gì trong `src`.
  - `features` và `components` không import `db`.
  - Feature này không import feature khác.
  - Chỉ `app` import `features`.
- Service có dạng `(db, ctx, input)`. Kiểm quyền bằng `assertCan`/`can`. Input có kiểu `unknown`, parse bằng zod ngay trong service.
- Server action bọc service bằng `toActionResult` rồi gọi `revalidatePath`.
- Chữ trên giao diện, chú thích và commit viết tiếng Việt. Commit theo dạng `feat:` / `fix:` / `perf:` / `docs:`.
- Migration: sửa `src/db/schema/` rồi chạy `npm run db:generate`. Không sửa tay file trong `drizzle/`.
- Chỉ thêm ba thư viện `@react-pdf/renderer`, `qrcode`, `@types/qrcode`; người dùng đã duyệt cùng spec. Thêm thư viện nào khác phải hỏi trước.
- Font Be Vietnam Pro (TTF, giấy phép OFL) tải từ repo `google/fonts`. **Hỏi người dùng trước khi tải.**
- Màu Bạc hà:
  - Nền `#F3F7F5`, bề mặt `#FFFFFF`, chữ `#1C2B27`.
  - Chữ phụ `#4B5E58` / `#7A8B85`, viền `#E1EAE6`.
  - Màu chính `#0E9F6E`, cảnh báo `#F2A900`.
- Câu báo lỗi không lộ chi tiết kỹ thuật (không stack trace, không tên bảng).
- Chạy `npm test` + `npm run lint` + `npm run build` trước khi đóng mỗi task có code. Trước lần chạy e2e đầu tiên, chạy `node scripts/e2e-preflight.mjs`.

## Điểm cần soi kỹ

1. **Hoá đơn thanh lý** hiện đầy đủ như mẫu hoá đơn tháng: đầu trang, thông tin khách, mọi khoản (kể cả khoản trừ cọc), tổng, số tiền bằng chữ, khối thanh toán có thông tin tài khoản. Khách còn phải trả thì có QR như thường. Tổng âm (phải hoàn tiền cho khách) thì khối thanh toán vẫn hiện, chỉ thay chỗ QR bằng dòng "Số tiền hoàn cho khách: X ₫". → test ở Task 5.
2. **Trả một phần:** số tiền trong QR là số còn lại, không phải tổng. Trả đủ thì thay QR bằng "Đã thanh toán". → test ở Task 5.
3. **Tên khách hoặc địa chỉ có dấu, tên Nhật/Hàn** trong PDF: dấu tiếng Việt phải giữ nguyên, ký tự ngoài bảng font không được làm sập việc xuất. → test ở Task 5.
4. **`?toa=` chứa id toà người dùng không có quyền, hoặc id sai định dạng:** bỏ qua id đó, không báo lỗi, không lộ dữ liệu. → test ở Task 11.
5. **Chưa nhập tài khoản ngân hàng, hoặc toà có tài khoản riêng:** PDF vẫn xuất. Tài khoản riêng của toà được dùng thay tài khoản chung. → test ở Task 3 và Task 5.

---

## Giai đoạn 1 — Hết "Application error"

### Task 1: Màn hình báo lỗi và trang không tìm thấy

**Files:**
- Create: `src/app/(app)/error.tsx`, `src/app/global-error.tsx`, `src/app/(app)/not-found.tsx`
- Test: `tests/e2e/error-pages.spec.ts`

**Interfaces:**
- Produces: không có. Các file này chỉ là quy ước route của Next.

- [x] **Step 1: Viết test e2e cho đường dẫn sai**

```ts
test('mở phòng không tồn tại → báo "Không tìm thấy", menu vẫn còn', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/rooms/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang này' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Hoá đơn' })).toBeVisible()
  await expect(page.getByText('Application error')).toHaveCount(0)
})
```

Hàm `login` chép từ `tests/e2e/invoices.spec.ts`.

- [x] **Step 2: Chạy test, xác nhận FAIL**

Chạy: `node scripts/e2e-preflight.mjs && E2E_BASE_URL=$E2E_BASE_URL npx playwright test tests/e2e/error-pages.spec.ts`. Kỳ vọng: FAIL vì không có heading.

- [x] **Step 3: Viết `(app)/not-found.tsx`, `(app)/error.tsx`, `global-error.tsx`**

- `not-found.tsx`:
  - Heading "Không tìm thấy trang này".
  - Đoạn chữ "Đường dẫn không đúng hoặc dữ liệu đã bị xoá."
  - Link "Về trang Nhắc việc" trỏ tới `/`.
- `error.tsx` (`'use client'`, nhận `{ error, reset }`):
  - Heading "Trang này đang gặp lỗi".
  - Đoạn chữ "Thử lại sau giây lát. Nếu vẫn lỗi, gửi mã sau cho quản trị: {error.digest}". Chỉ hiện mã khi có `digest`.
  - Nút "Thử lại" gọi `reset()`.
  - Gọi `console.error(error)` trong `useEffect`.
- `global-error.tsx`: cùng nội dung như `error.tsx`, tự bọc `<html lang="vi"><body>`.

- [x] **Step 4: Chạy lại test, xác nhận PASS.**

- [x] **Step 5: Commit** — `feat: màn hình báo lỗi và trang không tìm thấy`

### Task 2: Mở mọi trang không gặp lỗi — tìm và sửa nguyên nhân gốc

**Files:**
- Create: `tests/e2e/smoke-pages.spec.ts`
- Modify: những file gây lỗi mà bước tìm kiếm phát hiện ra
- Test: mỗi lỗi có một test tái hiện ở `tests/integration` hoặc `tests/unit`

**Interfaces:**
- Consumes: `NAV_ITEMS` trong `src/components/app-shell/nav.ts`.

- [x] **Step 1: Viết test smoke**

Với tài khoản Admin, làm như sau cho mỗi `href` trong `NAV_ITEMS`:
- Mở trang, chờ `networkidle`.
- Kiểm tra `page.getByText(/Application error|Trang này đang gặp lỗi/)` có số lượng bằng 0.
- Nếu trang có link chi tiết đầu tiên (`main a[href*="/"]` khớp mẫu `/<segment>/<uuid>`), mở link đó và kiểm tra tương tự.

Lắng nghe `page.on('pageerror')` và kiểm tra mảng lỗi rỗng.

- [x] **Step 2: Chạy test trên bản production ở máy**

Chạy: `npm run build && npm start`. Sau đó chạy `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/smoke-pages.spec.ts`. Môi trường cần `NEXT_PUBLIC_DEMO_MODE=1` và dữ liệu `npm run db:seed`.

Ghi lại từng trang lỗi. Nếu người dùng đã cấp quyền Vercel MCP, đọc thêm `get_runtime_errors` của bản đã deploy và gộp vào danh sách.

- [x] **Step 3: Sửa từng lỗi theo `superpowers:systematic-debugging`**

Mỗi lỗi làm ba bước: viết test tái hiện (FAIL) → sửa → test PASS. Mỗi lỗi một commit dạng `fix: <trang> <mô tả>`.

- [x] **Step 4: Chạy lại smoke, xác nhận PASS mọi trang.**

---

## Giai đoạn 2 — Hoá đơn PDF có QR

### Task 3: VietQR, danh sách ngân hàng, chọn tài khoản nhận tiền (domain)

**Files:**
- Create: `src/domain/vietqr.ts`, `src/domain/banks.ts`
- Modify: `src/domain/types.ts`
- Test: `tests/unit/domain/vietqr.test.ts`, `tests/unit/domain/banks.test.ts`

**Interfaces:**
- Produces:
  - `type BankAccount = { bankBin: string; bankName: string; accountNumber: string; accountName: string }` (trong `types.ts`)
  - `crc16ccitt(input: string): string`: CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF), trả 4 ký tự hex viết hoa.
  - `toQrAddInfo(text: string): string`: bỏ dấu (NFD rồi xoá dấu; riêng `đ/Đ` → `D`), viết hoa, chỉ giữ `A-Z 0-9 - space`, cắt còn tối đa 25 ký tự.
  - `buildVietQrPayload(input: { bankBin: string; accountNumber: string; amount: number; addInfo: string }): string`
  - `VN_BANKS: readonly { bin: string; shortName: string; name: string }[]`
  - `resolveBankAccount(facilityAccount: BankAccount | null, shared: BankAccount | null): BankAccount | null`

- [x] **Step 1: Viết test**

```ts
it('CRC chuẩn', () => expect(crc16ccitt('123456789')).toBe('29B1'))
it('dựng chuỗi VietQR có số tiền và nội dung', () => {
  const p = buildVietQrPayload({ bankBin: '970436', accountNumber: '0123456789', amount: 9_380_000, addInfo: 'TD-HD-202612-0001' })
  expect(p.startsWith('000201010212')).toBe(true)
  expect(p).toContain('38540010A0000007270124000697043601100123456789' + '0208QRIBFTTA')
  expect(p).toContain('53037045407938000058' + '02VN')
  expect(p).toContain('62210817TD-HD-202612-0001')
  expect(p.slice(-8, -4)).toBe('6304')
  expect(p.slice(-4)).toBe(crc16ccitt(p.slice(0, -4)))
})
it('nội dung bỏ dấu, viết hoa, tối đa 25 ký tự', () => {
  expect(toQrAddInfo('Phòng 301 – tháng 12/2026 Thảo Điền')).toBe('PHONG 301  THANG 122026 T')
})
it('amount phải là số nguyên dương', () => {
  expect(() => buildVietQrPayload({ bankBin: '970436', accountNumber: '1', amount: 0, addInfo: 'X' })).toThrow()
})
it('tài khoản riêng của toà thay cho tài khoản chung', () => {
  expect(resolveBankAccount(A, B)).toBe(A); expect(resolveBankAccount(null, B)).toBe(B); expect(resolveBankAccount(null, null)).toBeNull()
})
```

`banks.test.ts`: mọi `bin` gồm 6 chữ số và không trùng nhau; có `970436` (Vietcombank), `970418` (BIDV), `970415` (VietinBank), `970407` (Techcombank), `970422` (MB).

- [x] **Step 2: Chạy `npx vitest run tests/unit/domain/vietqr.test.ts tests/unit/domain/banks.test.ts`, xác nhận FAIL.**

- [x] **Step 3: Viết code**

Thứ tự trường TLV: `00`=`01`, `01`=`12`, `38`=[`00` `A000000727`, `01`=[`00` BIN, `01` số TK], `02` `QRIBFTTA`], `53`=`704`, `54`=số tiền, `58`=`VN`, `62`=[`08` nội dung], `63`=CRC. CRC tính trên toàn chuỗi kể cả `6304`.

`VN_BANKS` lấy từ danh sách công khai của NAPAS/VietQR, gồm khoảng 30 ngân hàng phổ biến.

- [x] **Step 4: Chạy lại test, xác nhận PASS.**

- [x] **Step 5: Commit** — `feat: dựng mã VietQR và danh sách ngân hàng`

### Task 4: Lưu tài khoản nhận tiền chung và riêng theo toà, kèm giao diện nhập

**Files:**
- Modify: `src/db/schema/facilities.ts`: thêm `bankAccount: jsonb('bank_account').$type<BankAccount | null>()`, cho phép null
- Generate: `npm run db:generate`
- Modify: `src/server/settings/service.ts`: thêm `bankAccount: null as BankAccount | null` vào `SETTINGS_DEFAULTS`, kèm zod cho patch
- Modify: `src/server/facilities/service.ts` (`updateFacility` nhận `bankAccount`), `src/server/facilities/schemas.ts` nếu có
- Modify: `src/features/settings/components/settings-tabs.tsx` (thêm tab "Tài khoản nhận tiền"), `src/features/facilities/components/facility-form.tsx` (thêm mục "Dùng tài khoản riêng")
- Test: `tests/integration/settings.test.ts`, `tests/integration/facilities-rooms.test.ts`

**Interfaces:**
- Consumes: `BankAccount`, `VN_BANKS` (Task 3).
- Produces:
  - `getSettings(db).bankAccount: BankAccount | null`
  - `Facility.bankAccount: BankAccount | null`
  - zod `bankAccountSchema` (trong `src/server/settings/schemas.ts`):
    - `bankBin` phải nằm trong `VN_BANKS`.
    - `accountNumber` gồm 6–19 chữ số.
    - `accountName` được trim, viết hoa, không rỗng.
    - `bankName` lấy từ `VN_BANKS` theo bin; không nhận giá trị client gửi lên.

- [x] **Step 1: Viết test**

- `it('lưu và đọc tài khoản chung; số TK có chữ → báo "Số tài khoản chỉ gồm 6–19 chữ số"')`
- `it('toà lưu tài khoản riêng rồi xoá về null')`
- `it('chỉ nhóm settings được sửa tài khoản chung')`

- [x] **Step 2: Chạy test, xác nhận FAIL.**

- [x] **Step 3: Sửa schema, chạy `npm run db:generate`, viết service.**

- [x] **Step 4: Làm giao diện**

- Tab "Tài khoản nhận tiền":
  - Ô chọn ngân hàng từ `VN_BANKS`, hiện `shortName — name`.
  - Hai ô nhập: số tài khoản, chủ tài khoản.
  - Nút "Lưu tài khoản".
- Form toà: công tắc "Dùng tài khoản riêng". Tắt công tắc thì lưu `null`.

- [x] **Step 5: Chạy `npm test && npm run lint && npm run build`, xác nhận PASS.**

- [x] **Step 6: Commit** — `feat: tài khoản nhận tiền chung và riêng theo toà`

### Task 5: Bộ dựng PDF hoá đơn và phiếu thu

**Files:**
- Install: `npm i @react-pdf/renderer qrcode && npm i -D @types/qrcode` (đã được duyệt)
- Add: `src/server/pdf/fonts/BeVietnamPro-{Regular,Medium,SemiBold,Bold}.ttf` (hỏi người dùng trước khi tải)
- Create: `src/server/pdf/types.ts`, `src/server/pdf/fonts.ts`, `src/server/pdf/invoice-pdf.tsx`, `src/server/pdf/receipt-pdf.tsx`, `src/server/pdf/index.ts`
- Modify: `next.config.ts`: thêm `@react-pdf/renderer` vào `serverExternalPackages` nếu build cần; thêm `outputFileTracingIncludes` cho thư mục font
- Test: `tests/integration/invoice-pdf.test.ts`

**Interfaces:**
- Consumes: `buildVietQrPayload`, `toQrAddInfo`, `BankAccount` (Task 3); `formatVND`, `numberToVietnameseWords` (có sẵn); `convertPdfToPng` (có sẵn, dùng để kiểm tra).
- Produces:

```ts
export type InvoicePdfData = {
  kind: 'monthly' | 'termination'
  code: string; issueDate: string; periodStart: string; periodEnd: string; dueDate: string | null
  facility: { name: string; address: string }
  room: string
  tenant: { name: string; phone: string | null }
  lines: { description: string; quantity: number; unitLabel: string; unitPrice: number; amount: number }[]
  total: number; paid: number
  bank: BankAccount | null
}
export type ReceiptPdfData = {
  code: string; invoiceCode: string; paidOn: string; amount: number; method: string; receivedBy: string
  facility: { name: string; address: string }; room: string; tenant: { name: string; phone: string | null }
}
export function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array>
export function renderReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array>
```

- [x] **Step 1: Viết test**

Tạo hàm phụ `textOf(pdf)` dùng `pdfjs-dist/legacy` để lấy chữ của trang 1.

- `it('hoá đơn tháng có tiêu đề, tổng, số bằng chữ, giữ dấu')`:
  - Dữ liệu: `kind: 'monthly'`, kỳ `2026-12-01…2026-12-31`, tổng 9.380.000, `paid: 0`, có `bank`.
  - Kỳ vọng chữ chứa `'Hoá đơn tháng 12/2026'`, `'9.380.000'`, `'Chín triệu ba trăm tám mươi nghìn đồng'`, `'Quét mã để chuyển khoản'`, `'TD-HD-202612-0001'`.
- `it('trả một phần → QR theo số còn lại')`:
  - Mock `qrcode.toDataURL` để bắt chuỗi payload.
  - `total 9_380_000, paid 4_000_000` → payload chứa `'54075380000'`.
- `it('trả đủ → "Đã thanh toán", không có QR')`
- `it('không có tài khoản → không có khối QR, vẫn ra PDF')`
- `it('thanh lý tổng dương → đủ các phần như hoá đơn tháng, tiêu đề "Hoá đơn thanh lý", có QR')`
- `it('thanh lý tổng âm → vẫn đủ bảng khoản, tổng, số bằng chữ, thông tin tài khoản; có "Số tiền hoàn cho khách: 1.200.000 ₫"; không có QR')`
- `it('tên Nhật/Hàn không làm sập: tenant "田中 由紀 / 김민지" vẫn trả về PDF hợp lệ')`: kiểm tra byte đầu là `%PDF`.
- `it('phiếu thu có mã phiếu, số tiền, hình thức, không có QR')`
- `it('PDF đổi được sang PNG')`: `convertPdfToPng(new Blob([pdf]))` trả về blob có type `image/png`.

- [x] **Step 2: Chạy `npx vitest run tests/integration/invoice-pdf.test.ts`, xác nhận FAIL.**

- [x] **Step 3: Viết bộ dựng theo bố cục mockup đã duyệt (spec §Phần 3 "Bố cục")**

- Khổ A4, lề 40pt.
- Tiêu đề: `kind === 'termination'` ghi `Hoá đơn thanh lý`; còn lại ghi `Hoá đơn tháng MM/YYYY`, lấy tháng từ `periodStart`.
- QR:
  - Chỉ vẽ khi `bank && total − paid > 0`.
  - Khối thanh toán (thông tin tài khoản) luôn hiện khi có `bank`, cả với hoá đơn thanh lý. Khi `total < 0`, chỗ QR thay bằng "Số tiền hoàn cho khách: {formatVND(−total)} ₫".
  - Tạo bằng `qrcode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 360 })`, hiển thị cỡ 96pt.
  - `addInfo = toQrAddInfo(code)`.
- Font: `Font.register` 4 độ đậm của Be Vietnam Pro. Thêm `Font.registerHyphenationCallback(w => [w])` để không ngắt chữ Việt.

- [x] **Step 4: Chạy lại test, xác nhận PASS. Chạy `npx next build --webpack`, xác nhận PASS (Turbopack bị chặn mở cổng cục bộ)** (font được đóng gói vào function).

- [x] **Step 5: Commit** — `feat: dựng PDF hoá đơn và phiếu thu có QR VietQR`

### Task 6: Nối PDF vào luồng xuất; hoá đơn bỏ Word

**Files:**
- Modify: `src/domain/template-fields.ts`: thêm `export const PDF_DOC_TYPES = ['invoice_monthly', 'invoice_termination', 'receipt'] as const`
- Modify: `src/server/convert/index.ts`: `assertFormatAllowed` chặn `docx` với `PDF_DOC_TYPES` (báo `'Hoá đơn và phiếu thu chỉ xuất PDF hoặc ảnh'`); `png` cho phép đúng các loại trong `PDF_DOC_TYPES`
- Modify: `src/server/templates/service.ts` (`exportDocument`): với `PDF_DOC_TYPES`, định dạng mặc định là `'pdf'`; lấy bytes từ `pdfLoaders[docType]`, `png` thì qua `convertPdfToPng`; phần lưu file và ghi bảng `files` dùng chung với nhánh cũ
- Modify: `src/server/invoices/service.ts`: đăng ký `registerPdfLoader` cho 3 loại; bỏ `registerDocLoader('invoice_monthly' | 'receipt')`
- Modify: `src/server/templates/actions.ts`, `src/server/invoices/actions.ts` (`exportReceiptAction` mặc định `'pdf'`)
- Modify: `src/features/invoices/components/invoice-export.tsx`: nút "Tải PDF" (chính) và "Tải ảnh"; `docType` lấy theo `invoice.kind`
- Modify: `src/app/(app)/invoices/[id]/page.tsx`: truyền `kind`
- Modify: `src/features/templates/components/*` (`TemplatesManager`): ẩn `PDF_DOC_TYPES`
- Modify: `docs/operations/gotenberg.md`: Gotenberg chỉ còn dùng cho hợp đồng, phụ lục, biên bản
- Test: `tests/integration/invoice-pdf-export.test.ts`; sửa `tests/integration/convert.test.ts` và `templates.test.ts` chỗ đang xuất `invoice_monthly` bằng Word

**Interfaces:**
- Consumes: `renderInvoicePdf`, `renderReceiptPdf`, `InvoicePdfData`, `ReceiptPdfData` (Task 5); `resolveBankAccount` (Task 3); `getSettings().bankAccount`, `Facility.bankAccount` (Task 4).
- Produces:
  - `registerPdfLoader(docType: PdfDocType, loader: (db, ctx, id) => Promise<{ facilityId: string; baseName: string; render: () => Promise<Uint8Array> }>)`
  - `type PdfDocType = (typeof PDF_DOC_TYPES)[number]`

- [x] **Step 1: Viết test (không đặt `GOTENBERG_URL`; `fetch` bị spy và không được gọi)**

- `it('xuất hoá đơn tháng không truyền format → file application/pdf tên <mã>.pdf')`
- `it('format png → image/png, không gọi Gotenberg')`
- `it('format docx → lỗi "Hoá đơn và phiếu thu chỉ xuất PDF hoặc ảnh"')`
- `it('hoá đơn thanh lý xuất bằng docType invoice_termination')`
- `it('phiếu thu xuất PDF')`
- `it('toà có tài khoản riêng → QR dùng số TK của toà')`: spy `qrcode.toDataURL`.
- `it('người không có quyền billing ở toà đó → ForbiddenError')`
- `it('hợp đồng vẫn xuất Word như cũ')`

- [x] **Step 2: Chạy test, xác nhận FAIL.**

- [x] **Step 3: Viết code theo phần Files.**

- [x] **Step 4: Chạy `npm test && npm run lint && npx next build --webpack`, xác nhận PASS.**

- [x] **Step 5: Sửa e2e `tests/e2e/invoices.spec.ts`**

Bấm "Tải PDF" → bắt sự kiện `download`, tên file kết thúc bằng `.pdf`. Bấm "Tải ảnh" → tên file kết thúc bằng `.png`. Chạy riêng spec này.

- [x] **Step 6: Commit** — `feat: hoá đơn và phiếu thu xuất PDF mặc định, ảnh từ PDF, bỏ Word`

---

## Giai đoạn 3 — Giá phí chung, toà nào cần thì đặt riêng

### Task 7: Bảng giá theo toà và service

**Files:**
- Modify: `src/db/schema/fees.ts`: thêm `feeTypePrices = pgTable('fee_type_prices', { feeTypeId → fee_types (cascade), facilityId → facilities (cascade), price integer notNull, createdAt, updatedAt })`, ràng buộc unique `(fee_type_id, facility_id)`
- Generate: `npm run db:generate`
- Create: `src/domain/fee-price.ts`
- Modify: `src/server/fees/service.ts`, `src/server/fees/actions.ts`
- Test: `tests/unit/domain/fee-price.test.ts`, `tests/integration/fees.test.ts`

**Interfaces:**
- Produces:
  - `resolveFeePrice(defaultPrice: number, facilityPrices: Record<string, number> | undefined, facilityId: string | null): number`
  - `listFeeTypePrices(db, ctx): Promise<Record<string /*feeTypeId*/, Record<string /*facilityId*/, number>>>`
  - `setFeeTypePrice(db, ctx, input: unknown /* { feeTypeId, facilityId, price } */): Promise<void>`: upsert, có audit
  - `removeFeeTypePrice(db, ctx, input: unknown /* { feeTypeId, facilityId } */): Promise<void>`
  - Actions `setFeeTypePriceAction`, `removeFeeTypePriceAction`, đều `revalidatePath('/settings')`

- [x] **Step 1: Viết test**

- Domain:
  - toà có giá riêng → trả giá riêng;
  - không có → trả giá chung;
  - `facilityId` null → trả giá chung;
  - giá riêng bằng 0 → trả 0 (0 là giá hợp lệ, không coi là "chưa đặt").
- Integration:
  - đặt giá riêng rồi đặt lại → chỉ còn một dòng với giá mới;
  - xoá → `listFeeTypePrices` không còn dòng đó;
  - giá âm → báo `'Đơn giá không hợp lệ'`;
  - người không có quyền `settings` → `ForbiddenError`;
  - xoá toà hoặc loại phí → các dòng giá riêng liên quan bị xoá theo.

- [x] **Step 2: Chạy test, xác nhận FAIL. → Step 3: Viết code. → Step 4: Chạy lại, xác nhận PASS.**

- [x] **Step 5: Commit** — `feat: giá phí riêng theo toà`

### Task 8: Dùng giá theo toà khi tạo hợp đồng, phụ lục; giao diện Cài đặt

**Files:**
- Modify: `src/app/(app)/contracts/new/page.tsx`: truyền `facilityId` trong mỗi `roomOption` và `prices` trong mỗi `FeeOption`
- Modify: `src/features/contracts/components/lease-wizard.tsx`: thêm `FeeOption.prices: Record<string, number>`. Khi đổi phòng, đặt lại `price` của mọi phí **chưa bật** thành `resolveFeePrice(f.defaultPrice, f.prices, room.facilityId)`. Phí đã bật giữ nguyên giá nhân viên đã sửa.
- Modify: `src/server/addenda/service.ts:300`: `fees` trả `defaultPrice` đã resolve theo toà của hợp đồng (`row.facilityId`)
- Modify: `src/features/settings/components/settings-tabs.tsx`: mỗi dòng loại phí mở được danh sách "Giá riêng theo toà" (chọn toà, nhập giá, nút "Lưu giá", nút "Xoá")
- Test: `tests/integration/addenda.test.ts`, `tests/unit/domain/fee-price.test.ts`

**Interfaces:**
- Consumes: `resolveFeePrice`, `listFeeTypePrices`, các action ở Task 7.

- [x] **Step 1: Viết test** — `it('ngữ cảnh chuyển phòng trả giá phí theo toà của hợp đồng')`: toà A có giá riêng 250.000, giá chung 200.000 → `fees[0].defaultPrice === 250000`.

- [x] **Step 2: FAIL → sửa → PASS.**

- [x] **Step 3: Chạy `npm test && npm run lint && npx next build --webpack`, xác nhận PASS.**

Mở trang tạo hợp đồng trong preview: chọn phòng ở toà có giá riêng → ô giá phí đổi đúng. Chụp màn hình làm bằng chứng.

- [x] **Step 4: Commit** — `feat: điền sẵn giá phí theo toà khi tạo hợp đồng và phụ lục`

---

## Giai đoạn 4 — Giao diện Bạc hà và lọc theo toà

### Task 9: Màu, font, bo góc; khung app; trang đăng nhập

**Files:**
- Modify: `src/app/globals.css`: các token `:root` và `.dark` theo bảng màu ở phần Ràng buộc chung. `--primary` là `#0E9F6E`, `--sidebar` là `#FFFFFF`, `--sidebar-primary` là `#0E9F6E`, `--radius` là `0.625rem`.
- Modify: `src/components/app-shell/{app-shell,sidebar,topbar}.tsx`:
  - Menu trắng, mỗi mục có biểu tượng (`NAV_ITEMS[].icon`).
  - Mục đang chọn: nền `primary`, chữ trắng, đậm 600.
  - Trên điện thoại, nút ☰ thay bằng biểu tượng `Menu` của lucide.
  - Thanh trên chỉ còn tên người dùng và nút "Đăng xuất".
- Delete: `src/components/app-shell/facility-switcher.tsx` (ô chọn này chỉ lưu state, không lọc gì). `AppShell` bỏ prop `facilities`; `src/app/(app)/layout.tsx` bỏ `listFacilities`.
- Modify: `src/app/login/page.tsx` theo phong cách mới
- Test: `tests/e2e/smoke-pages.spec.ts` (đã có)

- [x] **Step 1: Sửa token và khung app.**

- [x] **Step 2: Chạy `npm run lint && npx next build --webpack`, xác nhận PASS.** Chạy preview, chụp màn hình trang Nhắc việc ở cỡ desktop và mobile (375px), so với mockup A. Kiểm tra viền focus bàn phím còn thấy rõ.

- [x] **Step 3: Chạy lại `smoke-pages.spec.ts`, xác nhận PASS.**

- [x] **Step 4: Commit** — `feat: giao diện Bạc hà cho khung app và đăng nhập`

### Task 10: Thành phần dùng chung cho trang danh sách

**Files:**
- Create: `src/lib/facility-filter.ts`
- Create: `src/components/list/{page-header,filter-chips,facility-filter,status-dot,empty-state}.tsx`
- Test: `tests/unit/lib/facility-filter.test.ts`

**Interfaces:**
- Produces:
  - `parseFacilityFilter(value: string | string[] | undefined): string[]`: nhận `?toa=a,b`, `?toa=a&toa=b` hoặc giá trị rỗng; bỏ id không phải uuid; bỏ trùng.
  - `PageHeader({ title, action?: ReactNode })`
  - `FilterChips({ items: { label: string; count?: number; href: string; active: boolean }[] })`
  - `FacilityFilter({ facilities: { id: string; name: string }[]; selected: string[] })`: client component, chọn nhiều toà, ghi lại `?toa=` bằng `router.replace` và giữ các query khác. Chưa chọn toà nào nghĩa là "Tất cả toà".
  - `StatusDot({ tone: 'ok' | 'warn' | 'muted' | 'danger'; children })`
  - `EmptyState({ title: string; action?: ReactNode })`

- [x] **Step 1: Viết test** cho `parseFacilityFilter`:
  - `'a,b'` với hai uuid hợp lệ → hai id;
  - mảng có id trùng → id chỉ còn một lần;
  - `'abc'` → `[]`;
  - `undefined` → `[]`.

- [x] **Step 2: FAIL → viết code → PASS.**

- [x] **Step 3: Commit** — `feat: thành phần dùng chung cho trang danh sách và bộ lọc toà`

### Task 11: Service nhận nhiều toà; áp dụng giao diện mới và bộ lọc Toà cho mọi trang danh sách

**Files:**
- Modify service (thêm `facilityIds?: string[]`; tham số `facilityId` cũ vẫn giữ):
  - `src/server/tenants/service.ts` (`searchTenants`)
  - `src/server/contracts/service.ts` (`listLeases`)
  - `src/server/invoices/service.ts` (`listInvoices`)
  - `src/server/assets/service.ts` (`listAssets`)
  - `src/server/incidents/service.ts` (`listIncidents`)
  - `src/server/rooms/service.ts` (`listRoomsWithStatus`)
- Modify các trang: `tenants`, `contracts`, `invoices`, `assets`, `incidents`, `facilities/page.tsx` (danh sách phòng gộp mọi toà). Mỗi trang đọc `?toa=` bằng `parseFacilityFilter`, dùng `PageHeader`, `FacilityFilter`, `FilterChips`, `StatusDot`, `EmptyState`, và hiện cột "Toà" khi người dùng thấy được hơn một toà.
- Trang `meters`: việc nhập chỉ số cần đúng một toà (`listReadingSheet(facilityId)`), nên giữ ô chọn một toà, chỉ đổi giao diện. Bỏ `?facility=` cũ ở `tenants`.
- Test: các file integration tương ứng

**Interfaces:**
- Consumes: `parseFacilityFilter` và các thành phần ở Task 10.

- [x] **Step 1: Viết test cho mỗi service**

Ví dụ với `listInvoices`:
- Có toà A, B, C; người dùng có quyền A, B.
- `facilityIds: [A, C]` → chỉ trả hoá đơn của A (C nằm ngoài quyền nên bị bỏ qua, không báo lỗi).
- `facilityIds: []` → trả hoá đơn của A và B.
- Admin với `[C]` → trả hoá đơn của C.

- [x] **Step 2: FAIL → sửa service (giao `facilityIds` với phạm vi quyền) → PASS.**

- [x] **Step 3: Đổi từng trang.** Chạy `npm run lint && npx next build --webpack`. Chụp màn hình trang Hoá đơn và Khách thuê ở cỡ desktop và mobile.

- [x] **Step 4: Thêm e2e vào `smoke-pages.spec.ts`**

Ở `/invoices`, chọn một toà trong bộ lọc → URL chứa `toa=`. Tải lại trang → toà đó vẫn đang được chọn.

- [x] **Step 5: Commit** — `feat: hiện chung mọi toà, lọc theo toà trên các trang danh sách`

### Task 12: Trang chi tiết, form, hộp thoại, trang Nhắc việc

**Files:**
- Modify: các trang `[id]` (rooms, tenants, contracts, invoices, facilities, incidents, handovers); `src/features/dashboard/components/*`; các form và dialog trong `src/features/*/components`
- Test: `tests/e2e/smoke-pages.spec.ts` và các e2e có sẵn

- [x] **Step 1: Đổi giao diện các nhóm trang.** Các thay đổi trình bày dùng chung được gom trong một commit; không đổi props của server action hay luồng dữ liệu.

- [x] **Step 2: Chạy lint và bản dựng production Webpack.** Chụp màn hình desktop và mobile, rồi tự soát: một điểm nhấn, không thẻ trùng lặp vô nghĩa, focus rõ, chữ đủ tương phản. Turbopack bị môi trường chặn mở cổng cục bộ.

- [x] **Step 3: Chạy lại smoke và các e2e liên quan.**

## Giai đoạn 5 — Tải nhanh hơn (làm sau cùng)

### Task 13: Đo thời gian tải từng trang

**Files:**
- Create: `tests/e2e/perf.spec.ts`, `docs/operations/toc-do.md`

- [x] **Step 1: Viết `perf.spec.ts`**

Với mỗi `href` trong `NAV_ITEMS`:
- Mở trang 3 lần.
- Lấy `responseStart − requestStart` (TTFB) và `loadEventEnd` qua `performance.getEntriesByType('navigation')`.
- Ghi bảng ra console bằng `console.table`.

Không assert; spec này chỉ để đo.

- [x] **Step 2a: Đo bản production trên máy trước và sau tối ưu, và đo preview sau tối ưu.** Kết quả trong `docs/operations/toc-do.md`.

- [ ] **Step 2b: Đo preview trước tối ưu trên bản tương ứng.** Chưa có số đo cùng phiên bản và dữ liệu để so sánh.

- [x] **Step 3: Commit số đo local ban đầu** — `docs: ghi số đo tốc độ trang trên máy`

### Task 14: Sửa N+1 ở trang tài sản và trang tạo hợp đồng

**Files:**
- Modify: `src/app/(app)/assets/page.tsx:18-19`, `src/app/(app)/contracts/new/page.tsx` (đang gọi `listRoomsWithStatus` cho từng toà)
- Modify: `src/server/rooms/service.ts`
- Test: `tests/integration/facilities-rooms.test.ts`

**Interfaces:**
- Produces:
  - `listRooms(db, ctx, opts: { facilityId?: string })`: không có `facilityId` thì trả mọi phòng trong phạm vi quyền, kèm `facilityId`.
  - `listRoomsWithStatus(db, ctx, opts: { facilityId?: string })`: tương tự.
  - Nếu chữ ký hiện tại bắt buộc `facilityId`, đổi thành tuỳ chọn. Nếu Task 11 đã làm phần này cho `listRoomsWithStatus` thì chỉ còn `listRooms`.

- [x] **Step 1: Viết test**

`it('listRooms không truyền toà → trả phòng của mọi toà người dùng có quyền, không trả toà khác')`:
- Tạo 3 toà A, B, C.
- Người dùng chỉ có `facilityIds = {A, B}`.
- Kỳ vọng các mã phòng trả về đúng bằng phòng của A và B.

Viết test tương tự cho `listRoomsWithStatus`.

- [x] **Step 2: Chạy `npx vitest run tests/integration/facilities-rooms.test.ts`, xác nhận PASS vì các service đã hỗ trợ phạm vi từ Task 11.**

- [x] **Step 3: Sửa service theo test**

Các service đã lọc theo phạm vi từ Task 11; truy vấn trạng thái vẫn cần dữ liệu hợp đồng, cọc và cài đặt.

- [x] **Step 4: Cập nhật hai trang:** gọi service một lần rồi gom phòng theo `facilityId` ở phía trang.

- [x] **Step 5: Chạy `npm test && npm run lint && npx next build --webpack`, xác nhận PASS.**

- [x] **Step 6: Commit** — `perf: gộp truy vấn phòng ở trang tài sản và tạo hợp đồng`

### Task 15: Sửa các trang chậm nhất theo số đo, thêm khung chờ

**Files:**
- Create: `src/components/page-skeleton.tsx`, và `loading.tsx` trong các thư mục `tenants`, `contracts`, `invoices`, `meters`, `assets`, `incidents`, `facilities`, `invoices/[id]`, `contracts/[id]`
- Modify: các service mà bảng đo ở Task 13 chỉ ra là chậm nhất (tối đa 3 trang)
- Test: test integration của service đã sửa

**Interfaces:**
- Produces: `PageSkeleton({ rows?: number }): JSX.Element`. Gồm thanh tiêu đề, hàng chip và `rows` dòng bảng (mặc định 8), dùng `Skeleton` của shadcn.

- [x] **Step 1: Kiểm tra hành vi hiện có của trang Nhắc việc và bổ sung trường hợp trả một phần**

Test phải trả về đúng dữ liệu như cũ, kể cả khi đổi sang truy vấn song song hoặc gộp truy vấn.

- [x] **Step 2: Sửa:**
  - Gom truy vấn độc lập vào `Promise.all`.
  - Bỏ N+1.
  - Không thêm index khi chưa có bằng chứng cần thiết.
  - Giữ `DATABASE_POOL_MAX` mặc định và ghi lý do vào `docs/operations/toc-do.md`.

- [x] **Step 3: Thêm các `loading.tsx` render `<PageSkeleton />`.**

- [x] **Step 4: Chạy `npm test && npm run lint && npx next build --webpack`, xác nhận PASS.** Đo lại bằng `perf.spec.ts` và ghi bảng "sau" cạnh bảng "trước".

- [x] **Step 5: Commit** — `perf: tăng tốc các trang chậm, thêm khung chờ`

---

---

## Kết thúc

### Task 16: Kiểm tra cuối và cập nhật tài liệu

**Files:**
- Modify: `CLAUDE.md`: thêm `@react-pdf/renderer`, `qrcode` vào mục Stack; ghi rõ hoá đơn và phiếu thu dựng PDF trong app, Gotenberg chỉ dùng cho hợp đồng, phụ lục, biên bản
- Modify: `docs/review/checklist.md`: thay dòng "Xuất PDF … Ảnh (chỉ hoá đơn)" theo luồng mới
- Modify: `docs/operations/toc-do.md`: bảng trước/sau

- [x] **Step 1: Chạy `npm test && npm run lint && npx next build --webpack`.** 362 test đạt, lint không lỗi (12 cảnh báo), bản dựng đạt.

- [x] **Step 2a: Chạy lượt e2e đầy đủ trên preview.** Commit `51fed67`: 30/34 đạt; lưu kết quả và nguyên nhân các trường hợp chưa đạt.

- [x] **Step 2b: Kiểm tra lại hai luồng vật tư/tài sản và luồng sự cố.** Chọn cơ sở mẫu có phòng; cả ba đã đạt khi chạy lại sau lỗi giới hạn kết nối.

- [ ] **Step 2c: Xác nhận xuất PDF và ảnh trên preview mới nhất.** Các commit `2fa3a65`, `6e11ddc`, `391ec48` đã bổ sung font và thư viện chuyển ảnh vào bản dựng; chưa xác nhận được bản cuối vì session pooler đã chạm giới hạn 15 kết nối.

- [ ] **Step 2d: Chạy lại toàn bộ e2e và xác nhận tất cả đạt.**

- [x] **Step 3: Commit** — `docs: cập nhật stack, checklist và số đo tốc độ`
