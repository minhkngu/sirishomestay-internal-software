# Cài đặt gọn: bỏ tab Cơ sở, phí theo toà dùng popup — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ tab "Cơ sở" khỏi Cài đặt và đưa phần chọn toà / giá riêng của thẻ phí vào popup để thẻ không dài ra theo số toà.

**Architecture:** Chỉ đổi giao diện trong `src/features/settings/` và `settings/page.tsx`. Logic lưu giữ nguyên (các server action hiện có, lưu ngay mỗi lần tick/lưu giá). Popup dùng `src/components/ui/dialog.tsx` sẵn có; chuỗi tóm tắt và lọc toà là hàm thuần trong `fee-options.ts` để unit test (vitest chạy môi trường node, không test component).

**Tech Stack:** Next.js 16, React 19, shadcn/ui (`@base-ui/react` Dialog), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-cai-dat-gon-phi-theo-toa-design.md`

## Global Constraints

- Giao diện, commit, comment viết tiếng Việt; commit dạng `feat:` / `fix:` / `test:`.
- Không đổi server action, schema DB, `expectedInvoiceDay` trong DB/schema/nhắc việc. Chỉ bỏ ô sửa trên giao diện.
- Mỗi lần tick toà hoặc lưu/xoá giá riêng vẫn gọi ngay `setFeeDefaultAction` / `setFeeTypePriceAction` / `removeFeeTypePriceAction`.
- Ô tìm toà chỉ hiện khi có từ 8 toà trở lên (`FACILITY_SEARCH_MIN = 8`).
- Import theo quy tắc `CLAUDE.md`: feature không import `db`, không import feature khác.
- Không commit lên `main`; làm trên nhánh `claude/settings-cost-ui-a68194`.

## Review Focus

- 0 toà trong hệ thống: popup hiện thông báo trống, tóm tắt "Chưa áp dụng toà nào", không lỗi.
- Tìm toà không có kết quả: hiện "Không có toà phù hợp", ô tick đã chọn ở toà bị lọc ẩn vẫn giữ trạng thái.
- Tick bị server từ chối: ô tick hoàn lại như cũ (hành vi hiện có, giữ nguyên trong popup).
- Ô giá riêng gõ chữ/âm: nút Lưu bị khoá (`isPriceInput`).
- Đóng popup rồi mở lại: số liệu tóm tắt trên thẻ khớp với những gì vừa lưu.

---

### Task 1: Bỏ tab "Cơ sở" khỏi Cài đặt

**Files:**
- Modify: `src/features/settings/components/settings-tabs.tsx`
- Modify: `src/app/(app)/settings/page.tsx:23-24`
- Test: `tests/e2e/chi-so.spec.ts:27-32`

**Interfaces:**
- Produces: `SettingsTabs` props `facilities: { id: string; name: string }[]` (thay cho kiểu `Fac` cũ); các tab còn lại theo thứ tự `['Chung', 'Phí dịch vụ', 'Tài khoản nhận tiền']`.

- [ ] **Step 1: Sửa e2e `tab Cài đặt theo thứ tự và không còn Đơn giá điện nước`**: kỳ vọng `allInnerTexts()` bằng `['Chung', 'Phí dịch vụ', 'Tài khoản nhận tiền']`, thêm `expect(page.getByRole('tab', { name: 'Cơ sở' })).toHaveCount(0)`. Đổi tên test thành `tab Cài đặt theo thứ tự, không còn Cơ sở và Đơn giá điện nước`.
- [ ] **Step 2: Chạy preflight rồi test để thấy FAIL**: `node scripts/e2e-preflight.mjs` rồi `E2E_BASE_URL=<môi trường thử> npx playwright test tests/e2e/chi-so.spec.ts -g "tab Cài đặt"`. Mong đợi: FAIL vì vẫn còn tab Cơ sở.
- [ ] **Step 3: Sửa `settings-tabs.tsx`**: xoá `FacilitiesTab`, `TabsTrigger`/`TabsContent` "facilities", kiểu `Fac`, import `createFacilityAction`/`updateFacilityAction`; đổi `Props.facilities` thành `{ id: string; name: string }[]`.
- [ ] **Step 4: Sửa `page.tsx`**: `facilities.map((f) => ({ id: f.id, name: f.name }))`.
- [ ] **Step 5: Chạy `npx tsc --noEmit` và `npm run lint`**. Mong đợi: không lỗi (nhất là không còn biến/import thừa).
- [ ] **Step 6: Chạy lại test ở Step 2**. Mong đợi: PASS.
- [ ] **Step 7: Commit** `feat: bỏ tab Cơ sở khỏi Cài đặt`.

### Task 2: Hàm thuần cho tóm tắt và lọc toà

**Files:**
- Modify: `src/features/settings/components/fee-options.ts`
- Test: `tests/unit/settings/fee-options.test.ts`

**Interfaces:**
- Produces:
  - `export const FACILITY_SEARCH_MIN = 8`
  - `export function feeApplicationSummary(appliedCount: number, priceCount: number): string`
  - `export function filterFacilitiesByName<T extends { name: string }>(facilities: T[], query: string): T[]`

- [ ] **Step 1: Viết test (FAIL trước)** trong `fee-options.test.ts`:
  - `feeApplicationSummary(0, 0)` → `'Chưa áp dụng toà nào'`
  - `feeApplicationSummary(3, 1)` → `'Áp dụng 3 toà · 1 giá riêng'`
  - `feeApplicationSummary(3, 0)` → `'Áp dụng 3 toà'`
  - `filterFacilitiesByName([{name:'Thảo Điền'},{name:'Quận 1'}], 'thao')` → chỉ `Thảo Điền` (không phân biệt hoa thường và dấu); `''` hoặc toàn khoảng trắng → trả đủ danh sách.
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/settings/fee-options.test.ts`. Mong đợi: FAIL vì hàm chưa có.
- [ ] **Step 3: Cài đặt ba export trên** trong `fee-options.ts`. Lọc bằng cách bỏ dấu (`normalize('NFD')` + xoá dấu tổ hợp, thay `đ`→`d`) rồi so `includes` chữ thường.
- [ ] **Step 4: Chạy lại test**. Mong đợi: PASS.
- [ ] **Step 5: Commit** `feat: hàm tóm tắt và lọc toà cho thẻ phí`.

### Task 3: Popup "Áp dụng theo toà" và thẻ phí gọn

**Files:**
- Create: `src/features/settings/components/fee-facilities-dialog.tsx`
- Modify: `src/features/settings/components/fee-type-card.tsx`
- Test: `tests/e2e/contract-create-one-page.spec.ts:244-270` (test `phí mặc định theo cơ sở...`)

**Interfaces:**
- Consumes: `feeApplicationSummary`, `filterFacilitiesByName`, `FACILITY_SEARCH_MIN`, `isPriceInput` (Task 2 / sẵn có); `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger` từ `@/components/ui/dialog`.
- Produces: `FeeFacilitiesDialog` với props `{ fee: { id: string; name: string; defaultPrice: number }; facilities: { id: string; name: string }[]; selected: Record<string, boolean>; prices: Record<string, number>; onSelectedChange: (next: Record<string, boolean>) => void }` — popup tự gọi server action; `selected`/`prices` do thẻ giữ để tóm tắt luôn khớp.

- [ ] **Step 1: Sửa e2e trước (FAIL)**: trong test `phí mặc định theo cơ sở...`, thay `Sửa phí` + checkbox trong thẻ bằng: click `card.getByRole('button', { name: 'Áp dụng theo toà' })`, thao tác checkbox `Thảo Điền` qua `page.getByRole('dialog')`, kiểm tra `toBeChecked`/`toBeEnabled`, đóng popup (Escape), rồi `expect(card).toContainText('Áp dụng 1 toà')`. Chạy riêng test này, mong đợi FAIL (chưa có nút).
- [ ] **Step 2: Tạo `FeeFacilitiesDialog`** theo thiết kế: nội dung popup rộng (`sm:max-w-2xl`), phần bảng `max-h-[60vh] overflow-y-auto` với tiêu đề cột cố định; mỗi dòng: checkbox có tên accessible là tên toà, ô giá riêng (`aria-label` `Giá riêng ${fee.name} tại ${f.name}`, placeholder `Theo giá chung ${formatVND(fee.defaultPrice)}`, chỉ bật khi toà đã tick), nút Lưu (khoá khi `!isPriceInput` hoặc giá không đổi) và Xoá (chỉ khi có giá riêng). Ô tìm toà hiện khi `facilities.length >= FACILITY_SEARCH_MIN`. Rỗng: "Chưa có cơ sở nào"; lọc không ra: "Không có toà phù hợp". Dời logic `setDefault`/`savePrice`/`removePrice` từ `fee-type-card.tsx` sang đây (gọi đúng 3 server action hiện có, hoàn tác ô tick khi lỗi), dùng `useRun` + `Msg` cho thông báo trong popup.
- [ ] **Step 3: Sửa `fee-type-card.tsx`**: bỏ hai khối "Mặc định cho cơ sở" và "Giá riêng theo toà" khỏi chế độ sửa; giữ `selected` và `prices` ở thẻ; thay khối tóm tắt cũ bằng dòng `feeApplicationSummary(appliedFacilities.length, priceEntries.length)` (hiện cả khi đang sửa) cộng nút `Áp dụng theo toà` mở `FeeFacilitiesDialog`; giữ dòng liệt kê tên toà/giá riêng nếu ≤ 3 toà để không mất thông tin, nếu hơn thì chỉ hiện tóm tắt.
- [ ] **Step 4: Chạy `npx tsc --noEmit` và `npm run lint`**. Mong đợi: không lỗi.
- [ ] **Step 5: Chạy lại e2e ở Step 1** và `npx vitest run tests/unit/settings`. Mong đợi: PASS.
- [ ] **Step 6: Xem trên trình duyệt** (`npm run dev`, vào `/settings` → Phí dịch vụ): thẻ giữ độ dài khi có nhiều toà, popup cuộn được, tick và lưu giá riêng cập nhật dòng tóm tắt sau khi đóng popup, màn hình hẹp không tràn ngang.
- [ ] **Step 7: Chạy `npm test`** rồi **commit** `feat: popup áp dụng theo toà cho thẻ phí dịch vụ`.
