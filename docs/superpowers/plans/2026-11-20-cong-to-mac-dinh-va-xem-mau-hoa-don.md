# Công tơ mặc định, thay công tơ ước tính, chỉ số theo tháng, xem mẫu hoá đơn — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi phòng luôn có công tơ điện và nước; thay được công tơ hỏng với chỉ số cuối ước tính; có bảng chỉ số theo tháng theo toà; xem mẫu hoá đơn ngay từ bản PDF dựng sẵn lúc lưu.

**Architecture:** Giữ N-layer hiện có. Quy tắc thuần (gợi ý chỉ số ước tính, ghép ô theo tháng) ở `src/domain/`; truy vấn và ghi ở `src/server/meters/service.ts`, `src/server/rooms/service.ts`, `src/server/invoice-templates/service.ts`; giao diện ở `src/features/meters/components/` và `src/features/templates/components/`. Bản xem mẫu hoá đơn là PDF base64 lưu trong cột của `invoice_templates`, dựng lại khi bộ dựng đổi phiên bản.

**Tech Stack:** Next.js 16 App Router, Drizzle + Postgres (PGlite khi test), Vitest, `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-11-20-cong-to-mac-dinh-va-xem-mau-hoa-don-design.md` (đọc cả mục "Các điều đã làm rõ").

## Global Constraints

- Tiếng Việt cho giao diện, comment, commit (`feat:` / `fix:` / `docs:`); commit trên nhánh hiện tại, không commit vào `main`.
- Service nhận `(db, ctx, input)`; kiểm quyền bằng `assertCan(ctx, 'meters', facilityId)` cho công tơ, `'settings'` cho mẫu hoá đơn và phòng.
- Migration sinh bằng `npm run db:generate`, không sửa tay file trong `drizzle/`; migration dữ liệu dùng `npx drizzle-kit generate --custom --name=backfill_room_meters`.
- Không thêm nút xoá công tơ; không đổi cách tính tiền ngoài nhãn đoạn ước tính.
- Bố cục bảng theo CLAUDE.md: card `rounded-2xl border`, header 13px chữ thường, số căn phải `tabular-nums`, dưới `lg` thành dòng hai dòng; thiếu dữ liệu hiện "—".
- Tiền hiển thị bằng `formatVND`; không thêm dependency.
- Test: `tests/unit`, `tests/integration` (PGlite). Chạy test hẹp nhất chứng minh thay đổi; chạy toàn bộ `npm test` một lần ở cuối.

## Review Focus

1. Tạo phòng hàng loạt có mã trùng: phòng bị bỏ qua không được thêm công tơ, phòng mới có đủ hai công tơ (Task 2).
2. Chạy migration bổ sung công tơ lần hai, hoặc trên phòng đã có công tơ đang dùng: không tạo trùng (Task 1).
3. Phòng chỉ có công tơ đã gỡ: công tơ bổ sung bắt đầu từ chỉ số cuối cũ, không từ 0 (Task 1).
4. Gợi ý ước tính khi công tơ chưa có chỉ số nào hoặc chỉ có một chỉ số (Task 3, 4).
5. Chỉ số cuối ước tính nhỏ hơn chỉ số đã ghi phải bị từ chối như thay thường (Task 4).
6. Lưu mẫu hoá đơn khi dựng PDF lỗi: mẫu vẫn lưu được, bản xem dựng lại ở lần xem sau (Task 6).
7. Trang hợp đồng và hoá đơn gọi `listInvoiceTemplates` không được kéo theo PDF của mọi mẫu (Task 6).

---

### Task 1: Schema và migration bổ sung công tơ

**Files:**
- Modify: `src/db/schema/meters.ts`, `src/db/schema/templates.ts`
- Create: `drizzle/00NN_*.sql` (do `db:generate`), `drizzle/00NN_backfill_room_meters.sql` (do `--custom`)
- Test: `tests/integration/meter-backfill.test.ts`

**Interfaces:**
- Produces: cột `meters.final_reading_estimated boolean not null default false`, `meters.estimate_note text`; cột `invoice_templates.preview_pdf text`, `invoice_templates.preview_version integer` (Drizzle: `finalReadingEstimated`, `estimateNote`, `previewPdf`, `previewVersion`); migration dữ liệu chạy được lặp lại.

- [ ] **Step 1: Viết test thất bại** `tests/integration/meter-backfill.test.ts`. Hàm `runBackfill(db)` đọc file `drizzle/*_backfill_room_meters.sql` và chạy bằng `db.execute(sql.raw(...))` (tách theo `--> statement-breakpoint` nếu có). Các test: `'phòng chưa có công tơ nhận điện và nước, chỉ số đầu 0, ngày lắp là ngày tạo phòng'`; `'phòng đã có công tơ điện đang dùng chỉ nhận thêm công tơ nước'`; `'chạy lần hai không tạo thêm công tơ'` (đếm `meters` không đổi); `'phòng chỉ có công tơ điện đã gỡ nhận công tơ điện mới với startReading = finalReading và installedOn = removedOn của công tơ đã gỡ gần nhất'`; `'phòng ngừng sử dụng cũng được bổ sung'`; `'công tơ phí (utility fee) không làm phòng bị coi là đã có điện hoặc nước'`.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/meter-backfill.test.ts` — dự kiến FAIL (không tìm thấy file migration).
- [ ] **Step 3: Thêm bốn cột vào schema Drizzle** rồi chạy `npm run db:generate`.
- [ ] **Step 4: Sinh migration dữ liệu** bằng `npx drizzle-kit generate --custom --name=backfill_room_meters` và viết SQL thuần: với mỗi cặp (phòng, `electric`/`water`) chưa có dòng `meters` đang dùng (`removed_on IS NULL`) thì chèn một dòng; `start_reading`/`installed_on` lấy từ công tơ cùng loại đã gỡ gần nhất (`removed_on` lớn nhất, `final_reading`), nếu không có thì 0 và `rooms.created_at::date`.
- [ ] **Step 5: Chạy lại test** — dự kiến PASS; chạy `npx vitest run tests/integration/schema.test.ts` để chắc schema vẫn khớp.
- [ ] **Step 6: Commit** `feat: thêm cột ước tính, bản xem mẫu hoá đơn và migration bổ sung công tơ cho phòng`.

---

### Task 2: Tạo công tơ mặc định khi tạo phòng

**Files:**
- Modify: `src/server/meters/service.ts`, `src/server/rooms/service.ts` (`createRoom`, `createRoomsBulk`), `src/server/import/run.ts:110`
- Test: `tests/integration/meters.test.ts` (thêm), `tests/integration/facilities-rooms.test.ts` (thêm; sửa các assert đếm công tơ nếu có)

**Interfaces:**
- Produces: `createDefaultMeters(tx: DB, roomIds: string[], installedOn: string): Promise<void>` trong `src/server/meters/service.ts` — chèn một dòng `electric` và một dòng `water` (`startReading` 0, không seri) cho mỗi phòng.
- Consumes: bảng `meters` từ Task 1 (không cần cột mới).

- [ ] **Step 1: Viết test thất bại**: `'createRoom tạo sẵn một công tơ điện và một công tơ nước đang dùng'`; `'createRoomsBulk tạo đủ hai công tơ cho mỗi phòng mới và không tạo cho mã bị bỏ qua'` (dải có một mã đã tồn tại); `'nhập Excel tạo phòng mới cũng có đủ hai công tơ'` (dùng đường `run.ts` như `import-run.test.ts`); `'ghi chỉ số ngay sau khi tạo phòng không cần thay công tơ'` (gọi `saveReadings`, kỳ hiện tại, thành công).
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/meters.test.ts tests/integration/facilities-rooms.test.ts` — FAIL.
- [ ] **Step 3: Cài `createDefaultMeters`** (một lệnh `insert().values([...])` cho cả dải để không lặp theo phòng) và gọi trong cùng giao dịch ở `createRoom`, `createRoomsBulk` (chỉ cho phòng thật sự mới tạo), và nhánh `!existing` của `src/server/import/run.ts`. `installedOn` là ngày hiện tại theo giờ Việt Nam (dùng `todayVN()` từ `@/domain/dates`).
- [ ] **Step 4: Chạy lại** hai file test trên cộng `npx vitest run tests/integration/import-run.test.ts tests/integration/seed.test.ts` — PASS; sửa test cũ nào hỏng vì có thêm công tơ (không bỏ test).
- [ ] **Step 5: Commit** `feat: mỗi phòng mới có sẵn công tơ điện và nước`.

---

### Task 3: Quy tắc ước tính và nhãn trên hoá đơn

**Files:**
- Modify: `src/domain/types.ts` (`Meter`), `src/domain/meters.ts`, `src/domain/invoice-builder.ts` (dòng điện/nước, quanh dòng 124-130)
- Test: `tests/unit/domain/meters.test.ts` (thêm hoặc tạo), `tests/unit/domain/invoice-builder.test.ts` (thêm; dùng tên file hiện có nếu khác)

**Interfaces:**
- Produces: `suggestFinalReading(lastReading: number, monthlyUsages: number[]): { value: number; basis: 'average' | 'last' }`; `Meter.finalReadingEstimated?: boolean`; `MeterSegment.estimated?: boolean`.

- [ ] **Step 1: Viết test thất bại**: `suggestFinalReading(1000, [100, 120, 110])` → `{ value: 1110, basis: 'average' }`; `suggestFinalReading(500, [])` → `{ value: 500, basis: 'last' }`; `suggestFinalReading(0, [10, 11])` → `value` 11 (làm tròn); `meterUsage` với công tơ gỡ trong kỳ có `finalReadingEstimated: true` trả đoạn có `estimated: true`, công tơ thường không có cờ; dòng điện của hoá đơn có đoạn ước tính có `description` kết thúc bằng `' — có chỉ số ước tính'`, dòng không ước tính giữ nguyên mô tả cũ.
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/domain` — FAIL.
- [ ] **Step 3: Cài** `suggestFinalReading` (trung bình các số dùng, `Math.round`, tối đa 3 phần tử gần nhất do người gọi truyền), thêm cờ vào `meterUsage` (đoạn lấy `finalReading` của công tơ có cờ thì `estimated: true`) và nối hậu tố vào `description` ở `invoice-builder.ts` khi `u.segments.some((s) => s.estimated)`.
- [ ] **Step 4: Chạy lại** `npx vitest run tests/unit/domain tests/integration/invoices.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat: quy tắc gợi ý chỉ số ước tính và nhãn trên dòng hoá đơn`.

---

### Task 4: Thay công tơ với chỉ số cuối ước tính

**Files:**
- Modify: `src/server/meters/service.ts` (`replaceMeter`, `toMeter`, `listMeterOverview`, `MeterOverviewRow`), `src/server/meters/actions.ts`, `src/features/meters/components/replace-meter-dialog.tsx`, `src/features/meters/components/meter-list.tsx`
- Test: `tests/integration/meters.test.ts`

**Interfaces:**
- Consumes: `suggestFinalReading` (Task 3), cột mới (Task 1).
- Produces: `replaceMeter(db, ctx, roomId, utility, input: { removedOn: string; finalReading: number; newSerial?: string; startReading: number; estimated?: boolean; note?: string })`; `suggestMeterFinalReading(db: DB, ctx: AccessContext, roomId: string, utility: Utility): Promise<{ value: number; basis: 'average' | 'last' }>`; `suggestFinalReadingAction(roomId, utility)`; `MeterOverviewRow.finalReadingEstimated: boolean` và `estimateNote: string | null`.

- [ ] **Step 1: Viết test thất bại**: `'thay công tơ ước tính lưu cờ và lý do trên công tơ cũ'`; `'ước tính mà thiếu lý do bị từ chối với lỗi ở trường note'`; `'chỉ số cuối ước tính nhỏ hơn chỉ số đã ghi bị từ chối'`; `'suggestMeterFinalReading dùng chỉ số gần nhất cộng trung bình mức dùng 3 tháng gần nhất'` (4 chỉ số tháng); `'suggestMeterFinalReading khi chưa có chỉ số nào trả chỉ số đầu với basis last'`; `'người không có quyền meters của toà không gợi ý được (ForbiddenError)'`; `'listMeterOverview trả cờ ước tính của công tơ đã gỡ'`.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/meters.test.ts` — FAIL.
- [ ] **Step 3: Cài phía server.** `replaceMeter` ghi `finalReadingEstimated`/`estimateNote` cho công tơ cũ, bắt buộc `note` khi `estimated`, giữ các kiểm tra cũ, thêm cờ và lý do vào `recordAudit`. `suggestMeterFinalReading` lấy tối đa 4 chỉ số `monthly` gần nhất của công tơ đang dùng, tính hiệu liên tiếp làm `monthlyUsages`, gọi `suggestFinalReading`. Cập nhật `toMeter` để mang cờ. Thêm hai action tương ứng.
- [ ] **Step 4: Cài giao diện.** `replace-meter-dialog.tsx`: ô chọn "Không đọc được, ước tính"; khi bật, gọi `suggestFinalReadingAction` để điền sẵn chỉ số cuối (sửa được), hiện ô "Lý do" bắt buộc, lỗi `note` hiện cạnh ô. Ô tiền/số không dùng `type="number"`. `meter-list.tsx`: cột Trạng thái hiện "Đã gỡ {ngày} · chỉ số cuối ước tính" kèm lý do (thuộc tính `title`) khi có cờ.
- [ ] **Step 5: Chạy lại** `npx vitest run tests/integration/meters.test.ts` và `npm run lint -- src/features/meters src/server/meters` — PASS.
- [ ] **Step 6: Commit** `feat: thay công tơ với chỉ số cuối ước tính`.

---

### Task 5: Tab "Theo tháng"

**Files:**
- Create: `src/domain/meters-monthly.ts`, `src/features/meters/components/monthly-table.tsx`
- Modify: `src/server/meters/service.ts`, `src/app/(app)/meters/page.tsx`
- Test: `tests/unit/domain/meters-monthly.test.ts`, `tests/integration/meters.test.ts`

**Interfaces:**
- Consumes: `meterUsage` (`src/domain/meters.ts`), `Meter.finalReadingEstimated` (Task 3).
- Produces: `type MonthlyCell = { period: string; values: number[]; usage: number | null; replaced: boolean; estimated: boolean; gapBefore: boolean; handover: number[] }`; `buildMonthlyCells(periods: string[], meters: Meter[], readings: MeterReading[]): MonthlyCell[]` (một công tơ-loại của một phòng, `values` rỗng nghĩa là chưa ghi); `listMonthlyReadings(db: DB, ctx: AccessContext, facilityId: string, endPeriod: string, months?: number): Promise<{ periods: string[]; rows: Array<{ roomId: string; roomCode: string; floor: string | null; electric: MonthlyCell[]; water: MonthlyCell[] }> }>` (mặc định `months = 6`, tối đa 12).

- [ ] **Step 1: Viết test thất bại (unit)**: `'tháng có chỉ số monthly cho value và usage so với chỉ số gần nhất trước đó'`; `'tháng trống giữa hai tháng có số: usage của tháng sau tính từ chỉ số cũ và gapBefore là true'`; `'tháng đổi công tơ có hai giá trị (chỉ số cuối cũ, chỉ số mới) và replaced true'`; `'công tơ gỡ có cờ ước tính cho estimated true'`; `'chỉ số bàn giao vào handover của tháng, không thành value'`; `'chỉ số giảm cho usage null thay vì ném lỗi'`.
- [ ] **Step 2: Viết test thất bại (integration)**: `'listMonthlyReadings trả 6 kỳ kết thúc ở endPeriod, phòng thiếu công tơ có ô rỗng'`; `'chỉ trả phòng đang dùng của toà được chọn'`; `'người không có quyền toà đó nhận ForbiddenError'`; `'toà không có phòng trả rows rỗng'`; `'kỳ không hợp lệ bị từ chối'`.
- [ ] **Step 3: Chạy** `npx vitest run tests/unit/domain/meters-monthly.test.ts tests/integration/meters.test.ts` — FAIL.
- [ ] **Step 4: Cài** `buildMonthlyCells` (tái dùng `meterUsage` cho từng tháng có chỉ số, bắt `ValidationError` thành `usage: null`) và `listMonthlyReadings` (kiểm quyền `meters`; truy vấn gộp cho cả toà theo cách của `listReadingSheet`: chỉ số trong cửa sổ tháng cộng chỉ số gần nhất trước cửa sổ của mỗi công tơ; không truy vấn từng phòng).
- [ ] **Step 5: Cài giao diện.** Thêm mục "Theo tháng" (`tab=monthly`) vào thanh mục ở `page.tsx`, bộ lọc kỳ cuối dùng chung ô "Kỳ ghi"; `monthly-table.tsx` là bảng chỉ xem: một dòng mỗi phòng, hai nhóm cột Điện/Nước (hai bảng con hoặc nhóm cột, do người xây chọn), ô hiện chỉ số, mức dùng, hai chỉ số khi đổi công tơ, nhãn "ước tính", "—" khi trống; dưới `lg` chuyển thành dòng hai dòng không tràn ngang.
- [ ] **Step 6: Kiểm tra bằng trình duyệt**: chạy `siris-dev`, mở `/meters?tab=monthly`, chụp màn hình rộng và thu hẹp (`resize_window` mobile), đọc console không có lỗi.
- [ ] **Step 7: Chạy lại test và lint, commit** `feat: bảng chỉ số theo tháng theo toà`.

---

### Task 6: Bản xem mẫu hoá đơn dựng sẵn

**Files:**
- Modify: `src/server/invoice-templates/service.ts`, `src/server/invoice-templates/defaults.ts`, `src/app/(app)/templates/page.tsx`, `src/features/templates/components/templates-view.tsx`, `src/features/templates/components/invoice-templates-manager.tsx`
- Create: `src/components/pdf-inline.tsx`
- Test: `tests/integration/invoice-templates.test.ts` (thêm), `tests/integration/invoice-html-templates.test.ts` (thêm nếu hợp hơn)

**Interfaces:**
- Consumes: cột `previewPdf`, `previewVersion` (Task 1); hàm dựng hiện có trong `previewInvoiceTemplateById`.
- Produces: `INVOICE_PREVIEW_VERSION = 1` (export từ service); `getInvoiceTemplatePreview(db: DB, templateId: string): Promise<string>` (base64; dựng và lưu nếu thiếu hoặc khác phiên bản); `listInvoiceTemplatePreviews(db: DB, ctx: AccessContext): Promise<Record<string, string>>`; `listInvoiceTemplates` không còn trả hai cột preview; component `PdfInline({ base64, title }: { base64: string; title: string })`.

- [ ] **Step 1: Viết test thất bại**: `'tạo mẫu lưu sẵn previewPdf và previewVersion hiện hành'`; `'sửa nội dung mẫu đổi previewPdf'`; `'restoreDefaultInvoiceTemplates lưu bản xem cho mẫu mới tạo'`; `'getInvoiceTemplatePreview dựng lại khi previewVersion cũ hơn INVOICE_PREVIEW_VERSION và ghi lại'`; `'getInvoiceTemplatePreview dựng cho mẫu cũ chưa có bản xem'`; `'listInvoiceTemplates không có khoá previewPdf'`; `'lưu mẫu vẫn thành công khi dựng PDF lỗi'` (mock `@/server/pdf` ném lỗi; `previewPdf` còn null).
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/invoice-templates.test.ts tests/integration/invoice-html-templates.test.ts` — FAIL.
- [ ] **Step 3: Cài service.** Tách hàm dựng từ `previewInvoiceTemplateById` để dùng chung. Sau khi `createInvoiceTemplate`, `updateInvoiceTemplate` và `restoreDefaultInvoiceTemplates` ghi xong, dựng và `update` hai cột, bọc `try/catch` để lỗi dựng không làm hỏng việc lưu. `listInvoiceTemplates` chọn tường minh các cột trừ hai cột preview. `listInvoiceTemplatePreviews` đảm bảo mọi mẫu có bản xem hiện hành rồi trả bản đồ `id → base64`.
- [ ] **Step 4: Cài giao diện.** `templates/page.tsx` gọi `listInvoiceTemplatePreviews` và truyền xuống; `PdfInline` dựng blob URL như `PdfBlobDialog`, hiện trong `iframe` cao `h-[60vh]`, thu hồi URL khi huỷ. `InvoiceTemplatesManager`: bỏ nút "Xem" và popup, mỗi mẫu hiện tiêu đề + nhãn + nút (Sửa, Đặt mặc định, Xoá) rồi bản xem ngay dưới; hằng số `TOGGLE_FROM = 4`: từ 4 mẫu trở lên mỗi mẫu là mục bấm để mở (mẫu mặc định mở sẵn, trạng thái mở giữ trong state), dưới 4 mẫu hiện hết. Mẫu cũ chưa có `body` giữ nhãn "Mẫu cũ, nên soạn lại".
- [ ] **Step 5: Kiểm tra bằng trình duyệt**: mở `/templates?tab=invoice` với 2 mẫu rồi với từ 4 mẫu (tạo mẫu thử qua "Soạn mẫu mới", xoá sau khi kiểm tra), xác nhận bản xem hiện ngay, mục toggle đóng/mở đúng, mạng không có lời gọi server khi mở mục (đọc `read_network_requests`).
- [ ] **Step 6: Chạy lại test và lint, commit** `feat: bản xem mẫu hoá đơn dựng sẵn khi lưu`.

---

### Task 7: Xác minh toàn bộ

**Files:** không sửa mã (chỉ sửa nếu phát hiện lỗi).

- [ ] **Step 1: Chạy** `npm run lint`, `npm test`, `npm run build`; đọc kết quả, báo đúng số test pass/fail.
- [ ] **Step 2: Kiểm tra e2e liên quan**: `node scripts/e2e-preflight.mjs`, rồi chỉ chạy các test e2e đụng tới công tơ và mẫu hoá đơn (tìm bằng `grep -l "chỉ số\|meters\|mẫu hoá đơn" tests/e2e`); cập nhật test nếu giao diện đổi (nút "Xem" mẫu hoá đơn không còn).
- [ ] **Step 3: Chạy tay một vòng**: tạo phòng mới → ghi chỉ số ngay → thay công tơ ước tính → tạo hoá đơn có đoạn ước tính, xem nhãn → mở tab "Theo tháng".
- [ ] **Step 4: Cập nhật CLAUDE.md** nếu cần: một dòng ghi rằng phòng luôn có công tơ điện/nước mặc định. Commit `docs: ghi quy tắc công tơ mặc định`.
