# Mẫu giấy tờ soạn trong app, xuất PDF và Word — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay mẫu Word (.docx + Gotenberg) bằng mẫu soạn trong app (HTML), xuất PDF và Word từ cùng một mẫu mà không cần dịch vụ ngoài.

**Architecture:** Mẫu lưu HTML trong `doc_templates.body`, kiểu trình bày trong `doc_templates.style` (`'formal'` | `'modern'`). Một hàm thuần đọc HTML thành cây tài liệu nhỏ và điền dữ liệu (`renderTemplate`); hai bộ dựng đọc cùng cây: PDF bằng `@react-pdf/renderer`, Word bằng `docx`. `exportDocument` đổi sang đường này; giao diện soạn là TipTap với chip chỗ điền và hàng bảng lặp.

**Tech Stack:** Next.js 16, Drizzle/Postgres, `@react-pdf/renderer` (đã có), `docx` (chuyển từ devDependency sang dependency), mới: `node-html-parser`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-table`, `@tiptap/extension-text-align`, `@tiptap/extension-underline`; Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-mau-giay-to-html-pdf-design.md`

## Global Constraints

- Thư viện mới chỉ gồm các gói liệt kê ở Tech Stack (đã được duyệt cùng thiết kế); không thêm gói khác.
- `@react-pdf/renderer` + phông `BeVietnamPro` ở `src/server/pdf/fonts.ts`; PDF A4, lề 2 cm, chữ 12 pt.
- Chỉ nhóm quyền `settings` tạo, sửa, xoá, đặt mặc định mẫu (như hiện nay).
- Hoá đơn, phiếu thu (`PDF_DOC_TYPES`) giữ nguyên đường `registerPdfLoader`; không dùng mẫu soạn.
- Hai kiểu trình bày `formal` (Trang trọng) và `modern` (Hiện đại) theo mô phỏng đã duyệt https://claude.ai/artifact/6Xdp6srj4P1RSkhAnhTyZx: chữ Be Vietnam Pro 10,5 pt, dòng cách 1,55, A4 lề 2 cm; `modern` dùng xanh `#0F6B4F` chỉ cho đường kẻ và số tóm tắt.
- Tám loại dùng mẫu: `deposit_contract`, `lease`, `addendum_extension`, `addendum_transfer`, `addendum_assignment`, `addendum_termination`, `handover_check_in`, `handover_check_out`.
- Danh sách chỗ điền và `buildTemplateData`, `sampleDataFor`, `TEMPLATE_FIELDS` giữ nguyên.
- Sửa schema ở `src/db/schema/`, rồi `npm run db:generate`; không sửa tay `drizzle/`.
- Chuỗi giao diện, comment, commit bằng tiếng Việt (`feat:`/`fix:`/`docs:`); thao tác "thêm mới" luôn là popup (`FormDialog`).
- Kiến trúc N-Layer: quy tắc thuần ở `src/domain`, dựng tệp ở `src/server`, giao diện ở `src/features/templates/components`; `features` không import `features` khác.

## Review Focus

1. Chữ tiếng Việt có dấu (kể cả hoa, "Đ") phải còn nguyên trong PDF và Word (Task 3, 2).
2. Giá trị dữ liệu chứa `<`, `&`, `{{`, xuống dòng hiện đúng chữ, không vỡ tài liệu (Task 1).
3. Hàng lặp với mảng rỗng: hàng biến mất, không để hàng trống; mảng dài hơn một trang: PDF ngắt sang trang sau, không mất dòng (Task 1, 3).
4. Mẫu Word cũ (chỉ có `fileId`, không có `body`) không có trong danh sách chọn và xuất báo rõ, không lỗi lạ (Task 4, 5).
5. Kéo thả: thả chip vào chỗ không hợp lệ (ngoài hộp soạn, vào trong chip khác, trường con ngoài hàng lặp) không làm mất nội dung đã soạn (Task 7).
6. Chưa có mẫu nào cho một loại: xuất tự dùng mẫu mặc định, hai yêu cầu cùng lúc không tạo hai bộ mẫu mặc định (Task 6).

---

### Task 1: Cây tài liệu và điền dữ liệu (thuần)

**Files:**
- Create: `src/domain/doc-template.ts`
- Test: `tests/unit/doc-template.test.ts`
- Modify: `package.json` (thêm `node-html-parser`)

**Interfaces:**
- Produces (dùng ở Task 2, 3, 5, 6):
  - `type TemplateStyle = 'formal' | 'modern'`
  - `type Align = 'left' | 'center' | 'right' | 'justify'`
  - `type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean } | { br: true }`
  - `type DocBlock = { type: 'heading'; level: 1 | 2 | 3; align?: Align; inlines: Inline[] } | { type: 'paragraph'; align?: Align; inlines: Inline[] } | { type: 'list'; ordered: boolean; items: Inline[][] } | { type: 'table'; rows: { cells: { inlines: Inline[]; header?: boolean }[] }[] } | { type: 'pageBreak' }`
  - `renderTemplate(html: string, data: Record<string, unknown>): { doc: DocBlock[]; warnings: string[] }`
  - `sampleTemplateHtml(docType: DocType): string` (tiêu đề + mỗi chỗ điền một đoạn, vòng lặp là bảng một hàng lặp; dùng cho test và làm mẫu tối thiểu)
- Quy ước HTML: thẻ `<div data-role="summary">` (khung tóm tắt kiểu `modern`, các ô nhãn/giá trị) và `<p data-role="kicker">` giữ trong cây thành block `{ type: 'summary'; cells: { label: string; value: Inline[] }[] }` (thêm vào `DocBlock`); chỗ điền `<span data-field="ten_khach">…</span>`; hàng lặp `<tr data-loop="nguoi_o">` (trong hàng, `data-field` lấy từ phần tử của mảng); ngắt trang `<hr data-page-break>`; thẻ lạ → giữ chữ bên trong.

- [ ] **Step 1: Cài `node-html-parser`** — `npm install node-html-parser`; chạy `npx tsc --noEmit` để chắc không lỗi.
- [ ] **Step 2: Viết test thất bại** `tests/unit/doc-template.test.ts` với các ca:
  - chỗ điền thay đúng: `'<p>Khách: <span data-field="ten_khach">x</span></p>'` + `{ ten_khach: 'Nguyễn Văn A' }` → đoạn có inlines `[{ text: 'Khách: ' }, { text: 'Nguyễn Văn A' }]`
  - chữ đậm/nghiêng/gạch chân (`<strong>`, `<em>`, `<u>`) thành cờ tương ứng; `<br>` thành `{ br: true }`
  - giá trị `'a < b & {{x}}\nd'` giữ nguyên chữ (xuống dòng thành `{ br: true }`)
  - hàng lặp: bảng có `<tr data-loop="nguoi_o">` với 2 phần tử → 2 hàng; mảng rỗng → không còn hàng nào (bảng chỉ giữ hàng tĩnh)
  - chỗ điền thiếu dữ liệu → text rỗng và tên vào `warnings` (không trùng)
  - `<h2>` thành `heading` mức 2; `style="text-align:center"` thành `align: 'center'`; `<ul>/<ol>`; `<hr data-page-break>` thành `pageBreak`
  - khối `<div data-role="summary"><div data-label="Phòng"><span data-field="so_phong">x</span></div>…</div>` thành block `summary` với `cells` có nhãn `'Phòng'` và giá trị đã điền
  - `sampleTemplateHtml('lease')` qua `renderTemplate(..., sampleDataFor('lease'))` không có `warnings`
- [ ] **Step 3: Chạy test, thấy thất bại** — `npx vitest run tests/unit/doc-template.test.ts` → FAIL (chưa có module).
- [ ] **Step 4: Cài đặt `renderTemplate` và `sampleTemplateHtml` trong `src/domain/doc-template.ts`** — đọc HTML bằng `node-html-parser`, duyệt thẻ theo bảng ánh xạ ở trên; giá trị dữ liệu luôn là chữ thuần (không bao giờ diễn giải thành HTML); số và chuỗi chuyển bằng `String`.
- [ ] **Step 5: Chạy test, thấy qua** — cùng lệnh → PASS.
- [ ] **Step 6: Commit** — `git add src/domain/doc-template.ts tests/unit/doc-template.test.ts package.json package-lock.json && git commit -m "feat: cây tài liệu và điền dữ liệu cho mẫu giấy tờ HTML"`

---

### Task 2: Bộ dựng Word

**Files:**
- Create: `src/server/word/build-docx.ts`
- Test: `tests/unit/build-docx.test.ts`
- Modify: `package.json` (chuyển `docx` từ `devDependencies` sang `dependencies`)

**Interfaces:**
- Consumes: `DocBlock` (Task 1).
- Produces: `type TemplateStyle = 'formal' | 'modern'` (đặt ở `src/domain/doc-template.ts`, Task 1); `buildDocx(doc: DocBlock[], style: TemplateStyle): Promise<Uint8Array>` (tệp .docx hợp lệ, A4, lề 2 cm, phông Be Vietnam Pro, cỡ 10,5 pt, ngắt trang thật cho `pageBreak`; `modern` tô xanh `#0F6B4F` ở chỗ HTML đánh dấu số tóm tắt và đường kẻ tiêu đề).

- [ ] **Step 1: Viết test thất bại** — dựng một `DocBlock[]` có heading, đoạn đậm, danh sách, bảng 2×2, `pageBreak`, chữ `'Đặng Thị Ỷ — HỢP ĐỒNG'`; mở kết quả bằng `pizzip` (đã có) và khẳng định `word/document.xml` chứa chữ đó, có `<w:tbl>`, có `w:br w:type="page"`, và kích thước trang A4 (`w:w="11906"`).
- [ ] **Step 2: Chạy test, thấy thất bại** — `npx vitest run tests/unit/build-docx.test.ts`.
- [ ] **Step 3: Cài đặt `buildDocx`** — ánh xạ từng `DocBlock` sang `Paragraph`/`Table`/danh sách đánh số của `docx`; `Packer.toBuffer`.
- [ ] **Step 4: Chạy test, thấy qua.**
- [ ] **Step 5: Commit** — `feat: dựng Word từ cây tài liệu`

---

### Task 3: Bộ dựng PDF (làm thử trước khi dựa vào)

**Files:**
- Create: `src/server/pdf/template-pdf.tsx`
- Test: `tests/unit/template-pdf.test.ts`

**Interfaces:**
- Consumes: `DocBlock` (Task 1), phông ở `src/server/pdf/fonts.ts`.
- Produces: `renderTemplatePdf(doc: DocBlock[], style: TemplateStyle): Promise<Uint8Array>` (PDF A4, lề 2 cm, chữ 10,5 pt, bảng không cắt giữa một hàng, `pageBreak` thật; chủ đề theo `style`: `formal` đen trắng, bảng kẻ ngang đậm ở đầu và cuối; `modern` bảng không kẻ dọc, tiêu đề đầu bảng xám nhỏ, xanh Siris ở đường kẻ và số tóm tắt).

- [ ] **Step 1: Viết test thất bại** — (a) tài liệu có `'Đặng Thị Ỷ — HỢP ĐỒNG THUÊ'` trả về byte bắt đầu bằng `%PDF`; (b) bảng 120 hàng cho ra ít nhất 2 trang (đếm bằng `pdfjs-dist` đã có: `getDocument(...).numPages`); (c) văn bản trích bằng `pdfjs-dist` của trang 1 chứa `HỢP ĐỒNG THUÊ` (kiểm dấu tiếng Việt còn nguyên).
- [ ] **Step 2: Chạy test, thấy thất bại** — `npx vitest run tests/unit/template-pdf.test.ts`.
- [ ] **Step 3: Cài đặt `renderTemplatePdf`** — `Document/Page/View/Text` của `@react-pdf/renderer` với `fontFamily: 'BeVietnamPro'`; bảng là `View` hàng ngang có `wrap={false}` cho từng hàng; `pageBreak` là `<View break />`; gọi `renderToBuffer`. Nếu (c) không trích được dấu do cách nhúng phông, ghi nhận trong commit và đổi phép kiểm sang so sánh số trang + `%PDF`, rồi xem tệp bằng mắt ở Task 8.
- [ ] **Step 4: Chạy test, thấy qua.**
- [ ] **Step 5: Commit** — `feat: dựng PDF từ cây tài liệu bằng react-pdf`

---

### Task 4: Cột `body`, dịch vụ mẫu và bộ lọc mẫu dùng được

**Files:**
- Modify: `src/db/schema/templates.ts`, `src/server/templates/service.ts` (`DocTemplate`, `createTemplate`, mới `updateTemplate`), `src/server/contracts/service.ts` (hai chỗ kiểm mẫu hợp lệ ở dòng ~170 và ~483), các chỗ lọc `fileId` ở `src/app/(app)/handovers/[id]/page.tsx`, `src/app/(app)/contracts/new-contract.tsx`, `src/app/(app)/contracts/contract-detail.tsx`, `src/server/contracts/actions.ts`, `src/app/(app)/templates/page.tsx`
- Create: `drizzle/` (sinh bằng `npm run db:generate`)
- Test: `tests/integration/templates.test.ts` (thêm ca), `tests/integration/contracts.test.ts` (sửa ca mẫu hợp lệ)

**Interfaces:**
- Produces: cột `doc_templates.body text` (nullable) và `doc_templates.style text not null default 'formal'`; `type DocTemplate` có `body: string | null` và `style: TemplateStyle`; `updateTemplate(db: DB, ctx: AccessContext, id: string, input: { name?: string; body?: string; style?: TemplateStyle }): Promise<DocTemplate>` (quyền `settings`; `body` ≤ 200000 ký tự; phải đọc được bằng `renderTemplate(body, {})` không ném lỗi; ghi audit; mẫu đầu tiên có `body` của một loại tự thành mặc định); `createTemplate(db, ctx, { docType, name, body?, style? })` nhận thêm `body` và `style`; `style` ngoài `'formal' | 'modern'` bị `ValidationError('Kiểu trình bày không hợp lệ')`; `isUsableTemplate(t: { body: string | null }): boolean` (= `!!t.body`).
- Mọi nơi chọn mẫu (`.filter(t => t.fileId)`) đổi thành `isUsableTemplate`; kiểm tra mẫu hợp lệ khi lập hợp đồng đổi từ "có tệp đã xác nhận" sang "có `body`", thông báo giữ nguyên.

- [ ] **Step 1: Viết test thất bại** (thêm vào `tests/integration/templates.test.ts`): `updateTemplate` đặt `body` và tên; nhân viên không có `settings` bị `ForbiddenError`; `body` quá dài hoặc rỗng-chỉ-khoảng-trắng bị `ValidationError`; mẫu đầu tiên có body của loại thành mặc định; trong `contracts.test.ts`: lập hợp đồng với `contractTemplateId` trỏ mẫu không có `body` → `'Mẫu hợp đồng không hợp lệ hoặc chưa sẵn sàng'`, mẫu có `body` → thành công.
- [ ] **Step 2: Chạy test, thấy thất bại** — `npx vitest run tests/integration/templates.test.ts tests/integration/contracts.test.ts`.
- [ ] **Step 3: Thêm cột `body` và `style` vào schema rồi `npm run db:generate`**; kiểm tra tệp migration sinh ra chỉ có hai câu `ALTER TABLE ... ADD COLUMN` (`body` text, `style` text not null default 'formal').
- [ ] **Step 4: Cài đặt `updateTemplate`, mở rộng `createTemplate`, thêm `isUsableTemplate`; đổi các bộ lọc và hai chỗ kiểm mẫu hợp lệ trong contracts.**
- [ ] **Step 5: Chạy test, thấy qua** — lệnh ở Step 2, kèm `npx tsc --noEmit`.
- [ ] **Step 6: Commit** — `feat: cột body cho mẫu giấy tờ và dịch vụ cập nhật mẫu`

---

### Task 5: Đổi `exportDocument` sang mẫu HTML, bỏ Word/Gotenberg khỏi đường xuất

**Files:**
- Modify: `src/server/templates/service.ts` (`exportDocument`), `src/server/templates/actions.ts` (thay `trialExportAction`), `src/server/convert/index.ts`, `tests/integration/templates.test.ts`, `tests/integration/contracts.test.ts`, `tests/integration/contract-documents.test.ts`, `tests/integration/invoices.test.ts`, `tests/integration/convert.test.ts`
- Create: `tests/helpers/templates.ts`

**Interfaces:**
- Consumes: `renderTemplate`, `sampleTemplateHtml` (Task 1), `buildDocx` (Task 2), `renderTemplatePdf` (Task 3), `updateTemplate`/`createTemplate` (Task 4).
- Produces: `exportDocument(db, ctx, storage, { docType, entityId, templateId?, format?, auto? })` cho loại dùng mẫu: lấy `body` và `style` của mẫu được chọn (hoặc mặc định có `body`), `renderTemplate(body, buildTemplateData(docType, entities))`, rồi `buildDocx(doc, style)` (format `docx`, mặc định) hoặc `renderTemplatePdf(doc, style)` (format `pdf`); `previewDocumentAction(input: { docType: DocType; entityId: string; templateId?: string }): Promise<ActionResult<{ base64: string; name: string; mime: string; warnings: string[] }>>` dựng PDF của giấy tờ thật bằng mẫu chọn, không lưu tệp, kiểm quyền như xuất; trả `{ fileId, warnings }` như cũ; không có mẫu dùng được → `ValidationError('Chưa có mẫu cho loại giấy tờ này')`; mẫu chỉ có `fileId` (Word cũ) → `ValidationError('Mẫu Word cũ không còn dùng được, hãy soạn lại mẫu trong Cài đặt')`. `previewTemplateAction(input: { docType: DocType; body: string; style: TemplateStyle; format: 'pdf' | 'docx' })` (quyền `settings`) trả `{ base64: string; name: string; mime: string; warnings: string[] }` dựng bằng `sampleDataFor`, không lưu. `addHtmlTemplate(db: DB, admin: AccessContext, docType: DocType, opts?: { name?: string; html?: string }): Promise<DocTemplate>` ở `tests/helpers/templates.ts` (tạo mẫu có `body` = `html ?? sampleTemplateHtml(docType)`).
- `src/server/convert/index.ts` chỉ còn `ExportFormat`, `FORMAT_EXT`, `assertFormatAllowed`, `convertPdfToPng` (xem Task 8 về tách PNG khỏi `gotenberg.ts`); bỏ `convertDocx`.

- [ ] **Step 1: Viết `tests/helpers/templates.ts` và sửa test hiện có** thay mọi chỗ `buildSampleTemplate` + tệp `.docx` + `attachTemplateFile` bằng `addHtmlTemplate`; bỏ `vi.mock('@/server/convert')` trong `contract-documents.test.ts`. Thêm ca: `previewDocumentAction` cho `lease` thật trả PDF (`%PDF`) và không tạo dòng nào trong `files`; hai mẫu cùng nội dung khác `style` cho ra PDF khác nhau (byte khác nhau); xuất `lease` định dạng `docx` ra tệp mở được bằng `pizzip`, định dạng `pdf` ra byte bắt đầu `%PDF`; mẫu chỉ có `fileId` bị từ chối bằng thông báo Word cũ; xuất hoá đơn/phiếu thu không đổi.
- [ ] **Step 2: Chạy test, thấy thất bại** — `npx vitest run tests/integration/templates.test.ts tests/integration/contracts.test.ts tests/integration/contract-documents.test.ts tests/integration/invoices.test.ts tests/integration/convert.test.ts`.
- [ ] **Step 3: Cài đặt đường xuất mới trong `exportDocument` và `previewTemplateAction`; bỏ `trialExportAction`, `convertDocx`, và import `renderDocx`.**
- [ ] **Step 4: Chạy test, thấy qua** — cùng lệnh, kèm `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat: xuất hợp đồng, phụ lục, biên bản từ mẫu HTML ra PDF và Word`

---

### Task 6: Mẫu mặc định và tự tạo khi thiếu

**Files:**
- Create: `src/server/templates/defaults.ts`
- Modify: `src/server/templates/service.ts` (`exportDocument` gọi `ensureDefaultTemplate`), `src/server/templates/actions.ts`
- Test: `tests/integration/template-defaults.test.ts`

**Interfaces:**
- Produces: `type TemplateDocType = Exclude<DocType, PdfDocType>` (tám loại dùng mẫu, đặt ở `src/domain/template-fields.ts`); `DEFAULT_TEMPLATES: Record<TemplateDocType, Record<TemplateStyle, { name: string; html: string }>>` (mười sáu mẫu, tên dạng `Hợp đồng thuê (Trang trọng)` / `Hợp đồng thuê (Hiện đại)`; kiểu `formal` theo mô phỏng: quốc hiệu, tiêu đề căn giữa, `Điều N.` in đậm; kiểu `modern`: tiêu đề căn trái, khối `data-role="summary"` với phòng, giá thuê, tiền cọc, thời hạn (phụ lục: hiệu lực từ, gia hạn thêm, giá/cọc mới; biên bản: phòng, bên nhận, số tài sản, điện/nước), điều khoản đánh số bên lề; bố cục hợp đồng: tiêu đề căn giữa, căn cứ, các bên, điều khoản dùng đủ chỗ điền của loại đó, bảng người ở/phí/tài sản bằng hàng lặp, chỗ ký hai bên; nội dung pháp lý là bản khởi đầu để nhân viên sửa); `ensureDefaultTemplate(db: DB, ctx: AccessContext, docType: DocType): Promise<DocTemplate>` (nếu loại đã có mẫu có `body` thì trả mẫu mặc định hiện có, không tạo mới; nếu chưa thì tạo cả hai mẫu từ `DEFAULT_TEMPLATES`, đặt mẫu `formal` làm mặc định; chạy trong giao dịch có khoá để hai yêu cầu cùng lúc chỉ tạo một mẫu); `restoreDefaultTemplatesAction()` tạo lại các mẫu mặc định chưa có (không ghi đè mẫu đã sửa, quyền `settings`).
- `exportDocument` gọi `ensureDefaultTemplate` khi loại chưa có mẫu dùng được, trước khi trả lỗi "Chưa có mẫu".

- [ ] **Step 1: Viết test thất bại** — mỗi trong tám loại và mỗi kiểu (16 tổ hợp): `renderTemplate(DEFAULT_TEMPLATES[t][style].html, sampleDataFor(t))` không có `warnings`; sau `ensureDefaultTemplate` mỗi loại có đúng hai mẫu và mẫu mặc định là `formal` (mọi chỗ điền đều tồn tại); xuất `lease` khi chưa có mẫu nào ra được PDF và đã tạo đúng một mẫu mặc định; gọi `ensureDefaultTemplate` song song 5 lần chỉ ra một mẫu; loại đã có mẫu riêng thì không tạo thêm.
- [ ] **Step 2: Chạy test, thấy thất bại** — `npx vitest run tests/integration/template-defaults.test.ts`.
- [ ] **Step 3: Viết `DEFAULT_TEMPLATES` (mười sáu mẫu), `ensureDefaultTemplate`, nối vào `exportDocument`, thêm `restoreDefaultTemplatesAction`.**
- [ ] **Step 4: Chạy test, thấy qua.**
- [ ] **Step 5: Commit** — `feat: mười sáu mẫu giấy tờ mặc định (hai kiểu), tự tạo khi chưa có mẫu`

---

### Task 7: Giao diện soạn mẫu

**Files:**
- Create: `src/features/templates/components/template-editor.tsx`, `src/features/templates/components/field-palette.ts`, `src/features/templates/components/editor-extensions.ts`, `src/features/templates/components/field-drag.ts`, `tests/unit/field-palette.test.ts`, `tests/unit/field-drag.test.ts`, `tests/e2e/template-editor.spec.ts`
- Modify: `src/features/templates/components/templates-manager.tsx`, `src/app/(app)/templates/page.tsx`, `src/features/contracts/components/contract-edit-actions.tsx` (nút Xem trước), `package.json` (gói TipTap)

**Interfaces:**
- Consumes: `updateTemplateAction(id: string, input: { name?: string; body?: string; style?: TemplateStyle })` (thêm trong `src/server/templates/actions.ts`, bọc `updateTemplate`), `createTemplateAction` (nhận `body`), `previewTemplateAction`, `previewDocumentAction`, `restoreDefaultTemplatesAction`, `TEMPLATE_FIELDS`.
- Produces: `fieldGroups(docType: DocType): { label: string; fields: { key: string; label: string }[]; loops: { key: string; label: string; fields: { key: string; label: string }[] }[] }` ở `field-palette.ts` (nhóm chỗ điền thường và vòng lặp theo `TEMPLATE_FIELDS`); `field-drag.ts` xuất `FIELD_DRAG_MIME = 'application/x-siris-field'`, `encodeFieldDrag(p: { kind: 'field'; key: string; label: string } | { kind: 'loop'; key: string }): string` và `decodeFieldDrag(raw: string): { kind: 'field'; key: string; label: string } | { kind: 'loop'; key: string } | null` (dữ liệu sai hoặc lạ trả `null`); `TemplateEditor({ docType, initialHtml, onChange })` (TipTap với thanh công cụ: đậm, nghiêng, gạch chân, tiêu đề 1–3, danh sách, bảng, căn lề, ngắt trang; nút chèn chỗ điền dạng chip `data-field` **và kéo thả**: mỗi mục trong bảng chỗ điền kéo được (`draggable`, đặt dữ liệu bằng `encodeFieldDrag` vào `FIELD_DRAG_MIME`), thả vào hộp soạn thì chèn chip đúng vị trí thả (xử lý trong `handleDrop` của TipTap, dùng `view.posAtCoords`); chip trong mẫu là nút `draggable` để dời chỗ; kéo nhóm vòng lặp thả vào mẫu thì chèn bảng một hàng `data-loop` chứa chip các trường con; thả vào chỗ không hợp lệ (ví dụ chỗ điền con của vòng lặp ngoài hàng lặp tương ứng) bị bỏ qua và hiện thông báo ngắn; lệnh đặt "hàng lặp theo…" cho hàng bảng hiện tại (`data-loop`); trong hàng lặp chỉ chèn được chỗ điền của vòng lặp đó); quản lý mẫu: danh sách mẫu mỗi loại (dòng "Mẫu Word cũ, cần soạn lại" cho mẫu chỉ có `fileId`), nút "Soạn mẫu mới" và "Sửa" mở `FormDialog` cỡ `xl` chứa tên, hộp soạn, bảng chỗ điền cạnh bên, chọn kiểu trình bày (Trang trọng / Hiện đại), nút "Xem trước PDF" (mở PDF dữ liệu mẫu trong tab mới) và "Tải Word thử", nút "Lưu"; trong popup sửa hợp đồng, cạnh ô "Mẫu hợp đồng" có nút "Xem trước" gọi `previewDocumentAction` và mở PDF của hợp đồng đang sửa bằng mẫu đang chọn; nút "Khôi phục mẫu mặc định"; đặt mặc định, xoá như cũ. Bỏ phần tải `.docx`.

- [ ] **Step 1: Cài gói TipTap** — `npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-text-align @tiptap/extension-underline`; `npx tsc --noEmit`.
- [ ] **Step 2: Viết test thất bại `tests/unit/field-palette.test.ts` và `tests/unit/field-drag.test.ts`** — `encodeFieldDrag`/`decodeFieldDrag` khứ hồi đúng cho chỗ điền và vòng lặp, chuỗi rỗng, JSON sai, và khoá không phải chuỗi đều cho `null`; `fieldGroups('lease')` có nhóm vòng lặp `nguoi_o` và `phi_dich_vu` với đúng trường con; chỗ điền thường không chứa khoá của vòng lặp; mọi khoá trong `TEMPLATE_FIELDS.lease` xuất hiện đúng một lần.
- [ ] **Step 3: Chạy test, thấy thất bại** — `npx vitest run tests/unit/field-palette.test.ts tests/unit/field-drag.test.ts`.
- [ ] **Step 4: Cài đặt `field-palette.ts`, rồi `editor-extensions.ts`** (nút chip và thuộc tính `data-loop` cho hàng bảng, đọc và xuất đúng quy ước HTML ở Task 1) **và `template-editor.tsx`, nối vào `templates-manager.tsx`, thêm `updateTemplateAction`.**
- [ ] **Step 5: Chạy test, thấy qua** — lệnh ở Step 3.
- [ ] **Step 6: Viết e2e `tests/e2e/template-editor.spec.ts`** — vào Cài đặt → Mẫu giấy tờ, "Soạn mẫu mới" loại hợp đồng thuê, gõ một dòng, bấm chip "Tên khách", **kéo chip "Giá thuê" từ bảng chỗ điền thả vào đoạn văn và thấy chip xuất hiện trong mẫu**, chọn kiểu Hiện đại, bấm "Xem trước PDF" thấy PDF mở, "Lưu" thấy mẫu trong danh sách. (Chạy sau khi `node scripts/e2e-preflight.mjs` đạt; không chạy được thì ghi rõ trong báo cáo.)
- [ ] **Step 7: Thử bằng trình duyệt** (server `siris-e2e`): mở popup soạn mẫu, chèn chip và hàng lặp, xem trước, kiểm tra không lỗi console.
- [ ] **Step 8: Commit** — `feat: soạn mẫu giấy tờ trong app bằng hộp soạn trực quan, kéo thả chỗ điền, hai kiểu trình bày`

---

### Task 8: Dọn Word/Gotenberg, mẫu mặc định cho dữ liệu mẫu, kiểm tra bằng mắt

**Files:**
- Delete: `src/lib/docx.ts`, `scripts/build-sample-templates.ts`, `tests/unit/docx.test.ts`, `docs/operations/gotenberg.md`, `public/templates/*.docx` (nếu có)
- Modify: `src/server/convert/gotenberg.ts` → tách `convertPdfToPng` sang `src/server/convert/png.ts` rồi xoá `gotenberg.ts`, `src/server/convert/index.ts`, `scripts/seed/templates.ts`, `.env.example`, `package.json` (gỡ `docxtemplater`, `pizzip`), `docs/review/checklist.md`, `CLAUDE.md` (mục Stack và Commands nhắc Gotenberg)

**Interfaces:**
- Consumes: `DEFAULT_TEMPLATES` (Task 6). `scripts/seed/templates.ts` tạo mười sáu mẫu mặc định có `body` (tám loại × hai kiểu, `isDemo: true`) thay vì tệp Word.

- [ ] **Step 1: Sửa test còn nhắc Gotenberg hay `renderDocx`** (`tests/integration/convert.test.ts` chỉ còn kiểm PNG và `assertFormatAllowed`); tìm sót bằng `grep -rn "gotenberg\|GOTENBERG\|renderDocx\|docxtemplater\|pizzip\|build-sample-templates" src tests scripts docs CLAUDE.md package.json .env.example`.
- [ ] **Step 2: Làm các thay đổi ở danh sách tệp phía trên** rồi `npm install` để cập nhật `package-lock.json`.
- [ ] **Step 3: Chạy toàn bộ kiểm tra** — `npx tsc --noEmit`, `npm run lint`, `npm test`; kỳ vọng tất cả qua, không còn tham chiếu Gotenberg (lệnh `grep` ở Step 1 không ra dòng nào ngoài tài liệu thiết kế và kế hoạch).
- [ ] **Step 4: Thử bằng mắt với dữ liệu thật** — trên `siris-e2e`: lưu một hợp đồng hiện hữu có biên bản check-in, thấy hai bản PDF trong "Văn bản đã lưu", mở xem từng trang (dấu tiếng Việt, bảng người ở và phí, chỗ ký); bấm "Xuất Word", mở bằng ứng dụng đọc `.docx`; dựng PDF của cả mười sáu mẫu mặc định bằng "Xem trước PDF" và xem từng trang; kiểm tra thêm hai kiểu trên cùng một hợp đồng thật bằng nút "Xem trước" trong popup sửa hợp đồng. Ghi lại điều chưa đạt (nếu có) vào báo cáo cuối.
- [ ] **Step 5: Commit** — `chore: gỡ Word mẫu và Gotenberg, mẫu mặc định cho dữ liệu mẫu`
