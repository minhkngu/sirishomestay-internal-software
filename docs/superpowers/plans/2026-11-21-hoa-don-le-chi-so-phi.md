# Hoá đơn lẻ, trang Chỉ số, dọn phí — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo hoá đơn lẻ theo Toà → Phòng → Tháng với hạn thanh toán theo Cài đặt, gộp trang Chỉ số thành hai tab, sửa chỉ số điện nước ngay trong hoá đơn (ghi ngược về chỉ số), thêm phí ngoài bằng hộp thoại dùng chung với hợp đồng, bỏ "Nhập tay" và cho xoá loại phí.

**Architecture:** Mở rộng service hiện có (`src/server/invoices`, `meters`, `fees`, `settings`) và domain thuần (`due-date`). Giao diện theo tính năng trong `src/features/*`, hộp thoại dùng chung chuyển sang `src/components/`. Hoá đơn lẻ tái dùng đúng đường tính của sinh hàng loạt.

**Tech Stack:** Next.js 16 App Router, Drizzle + Postgres (PGlite khi test), zod, Vitest, Playwright, shadcn/`Select` của app.

**Spec:** `docs/superpowers/specs/2026-11-21-hoa-don-le-chi-so-phi-design.md`

## Global Constraints

- Đọc `node_modules/next/dist/docs/` trước khi viết code Next.js (AGENTS.md).
- Service nhận `(db, ctx, input)`, kiểm quyền bằng `assertCan`; action bọc `toActionResult` rồi `revalidatePath`; input `unknown` parse bằng zod trong service.
- Import một chiều: `domain` không import module nào trong `src`; `features`/`components` không import `db` và không import feature khác; chỉ `app` import `features`.
- Thêm mới luôn là popup (`FormDialog` / `RouteModal`); `Select` của app cho menu lọc; ô tiền dùng `MoneyInput`, hiển thị `formatVND`.
- Migration: sửa `src/db/schema/` rồi `npm run db:generate`, không sửa tay file trong `drizzle/` (migration dữ liệu dùng `drizzle-kit generate --custom`).
- Chuỗi giao diện, comment, commit viết tiếng Việt, commit dạng `feat:` / `fix:` / `refactor:`; commit kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Không commit trên `main`.
- Công thức hoá đơn giữ nguyên: tháng N = tiền phòng + phí cố định kỳ N (trả trước) + điện, nước, phí theo đồng hồ của tháng N−1 (trả sau).
- Không bỏ "Sinh hàng loạt".

## Review Focus

- Tháng 2 / `day` = 31: hạn "ngày X của tháng hoá đơn" phải kẹp về ngày cuối tháng (Task 1).
- Tạo hoá đơn lẻ cho kỳ đã được lập (đã trả trước) hoặc hợp đồng không hiệu lực: báo rõ, không tạo hoá đơn rỗng hay trùng (Task 2).
- Hai người tạo hoá đơn lẻ cùng phòng cùng tháng gần như đồng thời: không sinh trùng mã `HD` và không có hai nháp cùng kỳ (Task 2).
- Sửa chỉ số trên hoá đơn xuống thấp hơn số tháng trước hoặc cao hơn số tháng sau: bị từ chối, chỉ số không đổi (Task 7).
- Xoá loại phí đang dùng bởi hợp đồng, phí phát sinh hoặc đồng hồ: từ chối, dữ liệu nguyên vẹn (Task 5).

---

### Task 1: Hạn "ngày X của chính tháng hoá đơn"

**Files:**
- Modify: `src/domain/types.ts:5` (thêm vào `DueRule`), `src/domain/due-date.ts`, `src/server/settings/service.ts` (`dueRuleSchema`, `SETTINGS_DEFAULTS.dueRule`), `src/features/settings/components/settings-tabs.tsx`
- Test: `tests/unit/domain/billing.test.ts` (hoặc file mới `tests/unit/domain/due-date.test.ts`), `tests/integration/settings.test.ts`

**Interfaces:**
- Produces: `DueRule` có thêm `{ kind: 'day_of_invoice_month'; day: number }`; `computeDueDate(rule: DueRule, approvedOn: ISODate, invoiceMonth?: string): ISODate` (`invoiceMonth` dạng `YYYY-MM`; bắt buộc khi rule mới, bỏ qua với hai rule cũ).

- [ ] **Step 1: Test thất bại** — `computeDueDate({kind:'day_of_invoice_month',day:5}, '2026-06-20', '2026-07')` = `'2026-07-05'`; `day:31` với `'2026-02'` = `'2026-02-28'`; hai rule cũ cho kết quả như trước.
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/domain` → FAIL.
- [ ] **Step 3: Cài** nhánh mới trong `computeDueDate` (kẹp bằng `daysInMonth`), thêm vào `dueRuleSchema` (cùng thông báo "Ngày phải từ 1 đến 31"), đổi `SETTINGS_DEFAULTS.dueRule` thành `{ kind: 'day_of_invoice_month', day: 5 }`; sửa chỗ khai báo `valid.dueRule` trong `approveInvoice` cho nhận rule mới.
- [ ] **Step 4: Cài đặt** — trong `settings-tabs.tsx` thêm lựa chọn thứ ba "Ngày … của chính tháng hoá đơn" cạnh hai lựa chọn cũ; test `settings.test.ts` lưu và đọc lại rule mới.
- [ ] **Step 5: Chạy** `npx vitest run tests/unit/domain tests/integration/settings.test.ts` → PASS. Commit `feat: quy tắc hạn ngày X của tháng hoá đơn`.

---

### Task 2: Tạo hoá đơn lẻ (service)

**Files:**
- Modify: `src/server/invoices/service.ts` (tách logic tính theo hợp đồng khỏi `previewBatch`/`createDrafts`), `src/server/invoices/actions.ts`
- Test: `tests/integration/invoices.test.ts`

**Interfaces:**
- Consumes: `computeDueDate` (Task 1), `getSettings`.
- Produces:
  - `listInvoiceableLeases(db: DB, ctx: AccessContext, facilityId: string): Promise<Array<{ leaseId: string; roomCode: string; tenantName: string }>>` — hợp đồng thuê `active` của toà, quyền `billing`.
  - `previewLease(db: DB, ctx: AccessContext, input: { leaseId: string; period: string }): Promise<{ leaseId: string; lines: InvoiceLineInput[]; warnings: string[]; prepaidUntil: string | null; period: { start: string; end: string } | null }>` — cùng hình dạng một phần tử của `previewBatch`.
  - `createDraftForLease(db: DB, ctx: AccessContext, input: { leaseId: string; period: string }): Promise<InvoiceRow>`.
  - Actions: `listInvoiceableLeasesAction(facilityId)`, `previewLeaseAction(input)`, `createDraftForLeaseAction(input)` → `{ id }`.
  - `createDrafts` và `createDraftForLease` đặt `dueDate` ngay khi tạo **chỉ khi** rule hiệu lực (`lease.dueRule ?? settings.dueRule`) là `day_of_invoice_month`, tính bằng `computeDueDate(rule, todayVN(), period)`; hai rule cũ vẫn để `null` tới lúc duyệt. `approveInvoice` truyền `before.periodStart.slice(0,7)` làm `invoiceMonth` và giữ `dueDate` đã có nếu rule là rule mới.

- [ ] **Step 1: Test thất bại** (trong `invoices.test.ts`): (a) `createDraftForLease` cho kỳ `2026-07` tạo đúng một nháp có dòng tiền phòng, `dueDate = '2026-07-05'` với rule mặc định; (b) gọi lần hai cùng kỳ → `ValidationError` ("đã trả trước tới …"), vẫn chỉ một hoá đơn; (c) kỳ ngoài hiệu lực hợp đồng → `ValidationError`; (d) người không có `billing` → `ForbiddenError`; (e) hai lần gọi song song cùng phòng/tháng: một thành công, một `ValidationError`, mã hoá đơn không trùng; (f) `createDrafts` hàng loạt cũng đặt `dueDate` theo rule mới.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/invoices.test.ts -t "hoá đơn lẻ"` → FAIL.
- [ ] **Step 3: Cài** `previewLease` bằng cách tách phần thân `.map` của `previewBatch` thành hàm nội bộ dùng chung; `createDraftForLease` khoá cơ sở như `createDrafts` (`for update`) và dùng `nextInvoiceCode`. Hàng loạt gọi lại hàm dùng chung để hai đường ra cùng con số.
- [ ] **Step 4: Chạy** toàn `tests/integration/invoices.test.ts` → PASS (không hỏng test cũ).
- [ ] **Step 5: Commit** `feat: tạo hoá đơn lẻ và hạn theo tháng hoá đơn (service)`.

---

### Task 3: Popup "Tạo hoá đơn lẻ"

**Files:**
- Create: `src/features/invoices/components/single-invoice-dialog.tsx`
- Modify: `src/app/(app)/invoices/page.tsx` (nút phụ outline cạnh "Tạo hoá đơn hàng loạt"), có thể `src/features/invoices/components/generate-wizard.tsx` (dùng chung hàm hiển thị dòng xem trước nếu trùng)
- Test: `tests/e2e/invoices.spec.ts`

**Interfaces:**
- Consumes: `listInvoiceableLeasesAction`, `previewLeaseAction`, `createDraftForLeaseAction` (Task 2).
- Produces: `SingleInvoiceDialog({ facilities }: { facilities: { id: string; name: string }[] })` — nút + `FormDialog` tự chứa.

- [ ] **Step 1: Cài** popup: `Select` Toà (đổi toà reset Phòng) → `Select` Phòng (từ `listInvoiceableLeasesAction`) → ô tháng; nút "Xem trước" hiện các dòng, tổng, cảnh báo, "đã trả trước tới …" (khoá nút tạo); nút "Tạo hoá đơn" gọi action rồi `router.push('/invoices/<id>')`; lỗi hiện trong hộp thoại; thiếu chỉ số thì liệt kê đồng hồ chưa chốt (cảnh báo `Chưa ghi chỉ số …` có sẵn).
- [ ] **Step 2: e2e** thêm test "tạo hoá đơn lẻ từ popup" vào `invoices.spec.ts`: chọn toà/phòng/tháng → xem trước → tạo → thấy trang chi tiết hoá đơn nháp có hạn 5 của tháng đó. Chạy `node scripts/e2e-preflight.mjs`, rồi `E2E_BASE_URL=… npx playwright test tests/e2e/invoices.spec.ts -g "hoá đơn lẻ"` → PASS.
- [ ] **Step 3: Commit** `feat: popup tạo hoá đơn lẻ`.

---

### Task 4: Bỏ "Nhập tay" khỏi loại phí

**Files:**
- Modify: `src/features/settings/components/fee-options.ts` (`QUANTITY_OPTIONS`), `fee-type-form.tsx` (kiểu và mặc định `quantityFrom`), `fee-type-card.tsx:47`, `src/server/fees/service.ts:19` (enum zod), `src/db/schema/fees.ts` (default `'period_input'`), `src/features/contracts/components/fee-picker-dialog.tsx` (`SOURCE_LABEL`, bộ lọc), `lease-wizard.tsx:76,96` và `lease-fees.tsx` (nhánh `manual`/`legacyFixed`)
- Create: migration dữ liệu `drizzle/0038_*.sql` (qua `drizzle-kit generate --custom`): `UPDATE fee_types SET quantity_from = 'period_input' WHERE quantity_from = 'manual'`
- Test: `tests/unit/settings/fee-options.test.ts`, `tests/integration/fees.test.ts`

**Interfaces:**
- Produces: `quantityFrom` chỉ còn `'occupants' | 'room' | 'meter' | 'period_input'` ở mọi nơi.

- [ ] **Step 1: Test thất bại**: `QUANTITY_OPTIONS` không còn `manual`; `createFeeType` với `quantityFrom: 'manual'` → `ValidationError`; test migration: sau khi chạy migration, dòng `manual` cũ thành `period_input` (chèn dòng `manual` bằng SQL thô trước khi áp migration, hoặc gọi SQL của migration trên dữ liệu thử).
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/settings tests/integration/fees.test.ts` → FAIL.
- [ ] **Step 3: Cài** theo Files. Ở `lease-wizard`/`lease-fees`, xoá nhánh `manual`; chỉ xoá `legacyFixed` nếu `grep -rn legacyFixed src` cho thấy không còn nguồn đặt nó (hợp đồng đã tạo trước đó dùng `lease_fee_snapshots`, không bị đổi).
- [ ] **Step 4: Chạy** `npx vitest run tests/unit tests/integration/fees.test.ts tests/integration/contracts.test.ts` và `npm run lint` → PASS. Commit `refactor: bỏ cách tính "Nhập tay", gộp vào nhập lượng mỗi kỳ`.

---

### Task 5: Xoá loại phí

**Files:**
- Modify: `src/server/fees/service.ts`, `src/server/fees/actions.ts`, `src/features/settings/components/fee-type-card.tsx` (nút xoá + xác nhận), `fee-settings.tsx` nếu cần
- Test: `tests/integration/fees.test.ts`

**Interfaces:**
- Produces: `deleteFeeType(db: DB, ctx: AccessContext, id: string): Promise<void>` — quyền `settings`; `NotFoundError` nếu không có; `ValidationError('Loại phí đã được dùng trong hợp đồng, phí phát sinh hoặc đồng hồ, hãy lưu trữ thay vì xoá')` nếu có dòng tham chiếu trong `lease_fee_snapshots`, `one_off_charges` hoặc `meters` (cột `fee_type_id`); nếu không, xoá (giá và mặc định theo toà đã cascade), ghi audit `delete` `fee_type`. Action `deleteFeeTypeAction(id)`.

- [ ] **Step 1: Test thất bại**: xoá phí chưa dùng → biến mất khỏi `listFeeTypes({includeArchived:true})` và có audit; xoá phí đã gắn `leaseFeeSnapshots` / `oneOffCharges` / `meters` (mỗi loại một ca) → `ValidationError`, phí vẫn còn; thiếu quyền `settings` → `ForbiddenError`.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/fees.test.ts -t "xoá"` → FAIL.
- [ ] **Step 3: Cài** service, action (`revalidatePath('/settings')`), nút xoá trong thẻ phí với hộp xác nhận; khi lỗi "đã dùng" hiện thông báo kèm gợi ý Lưu trữ.
- [ ] **Step 4: Chạy** test trên → PASS. Commit `feat: xoá loại phí chưa dùng`.

---

### Task 6: Trang Chỉ số hai tab

**Files:**
- Modify: `src/app/(app)/meters/page.tsx` (bỏ tab `monthly`, đổi nhãn `Ghi chỉ số` → `Chốt chỉ số`, thêm `?view=history`), `src/server/meters/service.ts` (`MeterOverviewRow` thêm `lastReading: { value: number; readOn: string } | null`, `listMeterOverview` điền), `src/features/meters/components/meter-list.tsx` (cột "Chỉ số hiện tại" + ngày cạnh "Chỉ số đầu"), `reading-grid.tsx` (nhãn cột "Số cũ" / "Số chốt" / "Dùng"), `meter-filters.tsx` nếu đang tham chiếu tab `monthly`
- Test: `tests/integration/meters.test.ts`, `tests/e2e/chi-so.spec.ts`

**Interfaces:**
- Produces: `MeterOverviewRow.lastReading` (chỉ số `monthly`/`handover` mới nhất theo `readOn`, `null` nếu chưa có).

- [ ] **Step 1: Test thất bại** (`meters.test.ts`): `listMeterOverview` trả `lastReading` đúng số mới nhất sau khi `saveReadings` hai kỳ, và `null` khi chưa có; `startReading` không đổi sau khi lưu chỉ số.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/meters.test.ts` → FAIL.
- [ ] **Step 3: Cài** theo Files. Tab Chốt chỉ số có nút/menu "Xem nhiều tháng" (`?view=history`) hiển thị `MonthlyTable` thay lưới; URL cũ `?tab=monthly` chuyển sang `tab=readings&view=history`.
- [ ] **Step 4: e2e** cập nhật `chi-so.spec.ts` theo tab mới (hai tab, cột "Chỉ số hiện tại"); chạy `node scripts/e2e-preflight.mjs` rồi riêng file này → PASS.
- [ ] **Step 5: Commit** `feat: trang Chỉ số gồm Chốt chỉ số và Đồng hồ`.

---

### Task 7: Sửa chỉ số điện nước trong hoá đơn (ghi ngược về Chỉ số)

**Files:**
- Modify: `src/server/meters/service.ts` (tách lõi lưu một chỉ số của `saveReadings` thành `saveMonthlyReading(tx, ctx, meterId, period, value, readOn)` dùng lại, giữ nguyên các kiểm tra `DECREASE`, lớn hơn kỳ sau, đồng hồ đã gỡ), `src/server/invoices/service.ts`, `src/server/invoices/actions.ts`, `src/features/invoices/components/invoice-editor.tsx`, `src/app/(app)/invoices/[id]/page.tsx` (truyền dữ liệu đồng hồ cho editor)
- Test: `tests/integration/invoices.test.ts`

**Interfaces:**
- Consumes: logic tính dòng theo đồng hồ đang nằm trong `approveInvoice` (vòng lặp xoá/chèn dòng `meta.leaseFeeId`) — tách thành `refreshMeterLines(tx: DB, ctx, invoiceId: string): Promise<void>` dùng chung cho cả duyệt và sửa chỉ số.
- Produces: `updateInvoiceMeterReading(db: DB, ctx: AccessContext, invoiceId: string, input: { leaseFeeId: string; value: number }): Promise<void>` và `updateInvoiceMeterReadingAction(invoiceId, input)`. Quy tắc: quyền `billing` và `meters` theo toà; hoá đơn phải `draft` và `kind === 'monthly'`; đồng hồ lấy qua `leaseFeeMeters`; kỳ chỉ số = tháng trước kỳ hoá đơn; chỉ cho khi đồng hồ có đúng một đoạn trong tháng (không thay giữa tháng, không có chỉ số `handover` trong tháng) — ngược lại `ValidationError('Sửa ở tab Chỉ số')`; chặn nếu hoá đơn đã duyệt của tháng sau cùng đồng hồ phụ thuộc vào số này; lưu bằng `saveMonthlyReading` rồi `refreshMeterLines`; audit cho `meter_readings` và hoá đơn (số cũ → số mới).

- [ ] **Step 1: Test thất bại**: (a) hoá đơn nháp tháng 7, sửa chỉ số điện tháng 6 từ 1200 thành 1300 → dòng điện đổi lượng dùng và tiền, `listReadingSheet` kỳ 2026-06 thấy `current = 1300`; (b) giá trị thấp hơn số tháng 5 → `ValidationError`, chỉ số không đổi; (c) cao hơn số tháng 7 → `ValidationError`; (d) hoá đơn đã duyệt → `ValidationError`; (e) đồng hồ thay giữa tháng → `ValidationError`; (f) duyệt hoá đơn sau khi sửa vẫn giữ đúng số; (g) thiếu quyền `meters` → `ForbiddenError`.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/invoices.test.ts -t "chỉ số trong hoá đơn"` → FAIL.
- [ ] **Step 3: Cài** theo Interfaces. Dòng theo đồng hồ trong `InvoiceEditor` (nháp) hiện "chỉ số cũ → mới" (lấy từ `meta.segments`, xem `src/domain/meter-fee-usage.ts`) với ô nhập số mới và nút lưu gọi action rồi `router.refresh()`; đồng hồ không đủ điều kiện hiện chú thích "Sửa ở tab Chỉ số" kèm liên kết. `updateLines` vẫn khoá các dòng phí hợp đồng.
- [ ] **Step 4: Chạy** toàn `tests/integration/invoices.test.ts` và `meters.test.ts` → PASS. Commit `feat: sửa chỉ số điện nước ngay trong hoá đơn, ghi ngược về chỉ số`.

---

### Task 8: Hộp thoại chọn phí dùng chung và nút "Thêm phí" trên hoá đơn

**Files:**
- Move: `src/features/contracts/components/fee-picker-dialog.tsx` → `src/components/fee-picker-dialog.tsx`; chuyển cùng `BareSelect` (từ `contract-form-ui.tsx:134`) và kiểu `FeeOption` (từ `lease-fees.tsx:11`) sang `src/components/` (ví dụ `src/components/bare-select.tsx`, `src/components/fee-option.ts`) và đổi import ở hợp đồng; giữ re-export tạm ở chỗ cũ nếu nhiều nơi dùng
- Modify: `src/features/invoices/components/invoice-editor.tsx`, `src/app/(app)/invoices/[id]/page.tsx` (nạp `feeTypes: FeeOption[]` bằng đúng hàm đã dùng cho `feeData` của sửa hợp đồng, và `usedTypeIds` là các `feeTypeId` của phí hợp đồng; đồng hồ theo `quantityFrom === 'meter'` không đưa vào danh sách), `renderCreateFee` do tầng route cấp như ở hợp đồng
- Test: `tests/e2e/invoices.spec.ts`, kiểm `npm run lint` (quy tắc boundaries)

**Interfaces:**
- Produces: `FeePickerDialog` giữ nguyên props hiện có, import từ `@/components/fee-picker-dialog`.
- Consumes: `updateLinesAction` có sẵn; `onPick(id)` thêm một dòng `{ type: 'one_off', description: '<tên> (<đơn vị>)', quantity: 1, unitPrice: <giá theo toà qua resolveFeePrice>, meta: { feeTypeId: id } }` vào state của editor, lưu bằng nút "Lưu" hiện có.

- [ ] **Step 1: Di chuyển** và đổi import; chạy `npm run lint` và `npx vitest run tests/unit tests/integration/contracts.test.ts` → PASS (không đổi hành vi hợp đồng).
- [ ] **Step 2: Cài** nút "Thêm phí" (chỉ khi hoá đơn nháp) mở `FeePickerDialog`; loại phí đã có trong hợp đồng hiện "Đã thêm".
- [ ] **Step 3: e2e**: thêm phí ngoài vào hoá đơn nháp → dòng mới xuất hiện, lưu, tổng đổi; loại phí đã có trong hợp đồng không chọn được. Chạy riêng test → PASS.
- [ ] **Step 4: Commit** `refactor: dùng chung hộp thoại chọn phí`, rồi `feat: thêm phí ngoài vào hoá đơn`.

---

### Task 9: Hiện hệ số trên dòng tiền phòng, phí cố định

**Files:**
- Modify: `src/domain/invoice-builder.ts` (`rentAndFixedLines`: thêm `meta.coefficient`), `src/features/invoices/components/invoice-editor.tsx` (hiện "× hệ số" cạnh mô tả dòng có `meta.coefficient`)
- Test: `tests/unit/domain/billing.test.ts`

**Interfaces:**
- Produces: dòng `rent` và `fee` cố định có `meta.coefficient: number` (đã `round4`), `quantity`/`amount` không đổi.

- [ ] **Step 1: Test thất bại**: hợp đồng bắt đầu 11/07, `actual_days`, hoá đơn tháng 7 → dòng tiền phòng có `meta.coefficient` bằng `21/31` (làm tròn 4 chữ số) và `amount` như trước; tháng đủ → `1`.
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/domain/billing.test.ts` → FAIL; **Step 3: Cài**; **Step 4: Chạy** → PASS. Commit `feat: hiện hệ số kỳ trên dòng hoá đơn`.

---

### Task 10: Kiểm tra toàn bộ

- [ ] **Step 1:** `npm run lint`, `npx tsc --noEmit`, `npm test` → tất cả PASS.
- [ ] **Step 2:** `npm run build` → thành công.
- [ ] **Step 3:** `node scripts/e2e-preflight.mjs`, rồi chạy cả bộ e2e một lần: `E2E_BASE_URL=<môi trường thử> npm run test:e2e`; chỉ chạy lại các test hỏng.
- [ ] **Step 4:** Báo cáo: đã đổi gì, đã chạy lệnh nào ra kết quả gì, phần chưa kiểm tra (nếu có).
