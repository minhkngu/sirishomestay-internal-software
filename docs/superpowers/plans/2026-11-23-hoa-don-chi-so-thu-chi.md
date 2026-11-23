# Hoá đơn, chỉ số, Thu chi — Kế hoạch hoàn thiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) hoặc superpowers:executing-plans để làm từng task. Theo CLAUDE.md: viết test nhưng **không chạy** cho tới Task 6; kiểm bằng dev server.

**Goal:** Đưa code nhánh `claude/hoa-don-tai-chinh` khớp đúng spec duy nhất và có test cho các hành vi mới.

**Architecture:** Phần lớn đã làm. Còn: (1) khoá hành vi tính tiêu thụ sau khi bỏ ngày lắp, (2) test cho hoá đơn đầu giữ số riêng và chỉ số ban đầu, (3) sửa/xoá mọi khoản thu, chi ở tab Thu chi (spec mục 9 mới thêm), (4) chạy test, sửa e2e, cập nhật PR.

**Tech Stack:** Next.js server actions, Drizzle, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-hoa-don-chi-so-thu-chi-design.md`

## Global Constraints
- Service `(db, ctx, input)`; action bọc `toActionResult` + `revalidatePath`; `features`/`components` không import `db`; `domain` thuần.
- Chuỗi giao diện, comment, commit tiếng Việt; commit `feat:`/`fix:`/`test:`/`docs:`, tiêu đề ≤ 72 ký tự, kết thúc `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Chỉ số độc lập: sửa một lần ghi không đổi hoá đơn nào đã tạo; ràng buộc duy nhất là số đầu ≤ số cuối của cùng lần ghi.
- Không đổi công thức tính hoá đơn; không merge PR.

## Review Focus
- Ngày lắp không chặn việc ghi chỉ số, không đòi chỉ số lúc ký hợp đồng; vẫn đòi khi thay đồng hồ hoặc chuyển phòng giữa kỳ.
- Sửa chỉ số ban đầu ở hợp đồng không đổi hoá đơn đầu đã tạo (kể cả nháp); xoá hoá đơn rồi tạo lại thì dùng số mới.
- Sửa số tiền khoản thu tiền thuê không vượt phần còn nợ của hoá đơn; xoá thì dư nợ tăng lại.
- Xoá hoặc sửa cọc làm "Cọc đang giữ" tính lại đúng; khoản `deduct`/`forfeit` không hiện ở sổ quỹ.
- Người không có quyền `billing` của cơ sở không sửa/xoá được khoản của cơ sở đó.

### Task 1: Khoá hành vi tính tiêu thụ không phụ thuộc ngày lắp
**Files:** Modify `src/domain/meter-fee-usage.ts` (thụt lề sai ở dòng `const boundary`), Test `tests/unit/domain/meter-fee-usage.test.ts`, `tests/integration/meters.test.ts`.

**Interfaces:** Consumes `meterFeeUsage(input)` hiện có. Produces: không đổi chữ ký.

- [ ] **Step 1: Viết test** trong `meter-fee-usage.test.ts`:
  - `đồng hồ lắp sau ngày bắt đầu hợp đồng vẫn chốt được, không báo thiếu` (hợp đồng 15/11, `installedOn` 20/11, có chỉ số bàn giao 15/11 → `missing` rỗng).
  - `thay đồng hồ giữa kỳ vẫn đòi chỉ số tại ngày thay` (hai đồng hồ cùng loại, đồng hồ mới lắp 10/11, thiếu chỉ số 10/11 → `missing` có id đồng hồ cũ).
  - `chuyển phòng giữa kỳ đòi chỉ số đồng hồ chưa gỡ của phòng cũ tại ngày chuyển`.
- [ ] **Step 2: Sửa thụt lề** dòng `const boundary` về 4 khoảng trắng như các dòng kề.
- [ ] **Step 3: Test tích hợp** trong `meters.test.ts`: `applyReadings` ghi số cuối cho đồng hồ có `installedOn` sau `readOn` → lưu thành công (không còn lỗi "chưa được lắp").
- [ ] **Step 4: Commit** `test: khoá tính tiêu thụ không phụ thuộc ngày lắp`.

### Task 2: Hoá đơn đầu giữ số riêng
**Files:** Test `tests/unit/domain/invoice-builder.test.ts` (tạo nếu chưa có), `tests/integration/invoice-meter-edit.test.ts`.

**Interfaces:** Consumes dòng meter kỳ ký có `meta.opening`, `meta.closing` (xem `buildMonthlyInvoice`, `refreshMeterLines`).

- [ ] **Step 1: Test unit** `buildMonthlyInvoice` kỳ ký hợp đồng: dòng điện nước có `quantity 0`, `meta.opening === meta.closing === số bàn giao`.
- [ ] **Step 2: Test tích hợp**:
  - Tạo hoá đơn đầu (chỉ số ban đầu 1250); `updateLines` đổi `meta.opening 1250 → 1300`, `meta.closing → 1340`, `quantity 40`; gọi `refreshMeterLines` qua `updateInvoiceMeterReading` của tháng khác → dòng vẫn 40, không bị ghi đè.
  - Đổi chỉ số ban đầu ở hợp đồng (`updateContractFees`) → dòng hoá đơn nháp đã tạo giữ `meta.opening` cũ.
  - Xoá hoá đơn đầu rồi `createInvoiceFromEditor` lại → `meta.opening` bằng số hợp đồng mới.
- [ ] **Step 4: Test panel**: `getInvoiceDetail` của hợp đồng không có chỉ số bàn giao → `meterPanels[].initial === null` (không lấy `startReading`).
- [ ] **Step 5: Commit** `test: hoá đơn đầu giữ số đầu, số cuối riêng`.

### Task 3: Sửa, xoá mọi khoản thu tiền thuê và cọc ở tab Thu chi
**Files:** Modify `src/server/cashbook/service.ts`, `src/server/cashbook/actions.ts`, `src/server/cashbook/schemas.ts`, `src/server/charges/service.ts`, `src/server/charges/actions.ts`, `src/features/cashbook/components/cashbook-list.tsx`; Create `src/features/cashbook/components/edit-entry-dialog.tsx`; Test `tests/integration/cashbook.test.ts`.

**Interfaces:**
- Produces `updatePayment(db, ctx, id: string, input: { paidOn: string; amount: number; method: 'cash'|'transfer'|'other'; note?: string }): Promise<void>` trong cashbook service: kiểm `billing` của cơ sở hoá đơn; `amount` ≥ 1 và ≤ (tổng hoá đơn − các khoản thu khác của hoá đơn đó); audit `before/after`.
- Produces `updateDepositEntry(db, ctx, id: string, input: { date: string; amount: number; method: 'cash'|'transfer'|'other'; note?: string }): Promise<void>` và `deleteDepositEntry(db, ctx, id: string): Promise<void>` trong `charges/service.ts`; quyền theo cơ sở của hợp đồng; chỉ áp cho dòng `done` loại `collect|topup|refund`; audit.
- Produces actions `updatePaymentAction`, `updateDepositEntryAction`, `deleteDepositEntryAction` (bọc `toActionResult`, `revalidatePath('/cashbook')`).
- Consumes `deletePaymentAction`, `deleteExpenseAction`, `updateExpense` đã có.

- [ ] **Step 1: Viết test tích hợp** (trong `cashbook.test.ts`): sửa số tiền thu hợp lệ → dư nợ đổi đúng; sửa vượt phần còn nợ → `ValidationError`; xoá thu → dư nợ tăng lại; sửa cọc `collect` 5tr→4tr → `depositHeld` giảm 1tr; xoá `refund` → cọc đang giữ tăng lại; xoá/sửa dòng `deduct`/`forfeit` bị từ chối; người ngoài cơ sở nhận `ForbiddenError`; mỗi thao tác có một dòng audit.
- [ ] **Step 2: Chạy từng test, thấy FAIL** (hàm chưa có) — chỉ ở Task 6 theo quy ước; ghi lại kỳ vọng.
- [ ] **Step 3: Cài ba hàm service** theo Interfaces; dùng một transaction và khoá hàng (`for('update')`) như `removePayment`.
- [ ] **Step 4: Cài ba action** và nối vào `cashbook-list.tsx`: cột thao tác của mọi dòng có **Sửa** (mở `EditEntryDialog`: số tiền `MoneyInput`, ngày, hình thức, ghi chú; khoản chi dùng `expense-dialog` sẵn có) và **Xoá** (`ConfirmDialog`). Dòng không sửa được (`deduct`, `forfeit`) không hiện nút.
- [ ] **Step 5: Kiểm bằng dev server**: tạo khoản thu, sửa số tiền, xoá; kiểm dải tổng quan và Cọc đang giữ cập nhật.
- [ ] **Step 6: Commit** `feat: sửa, xoá khoản thu và cọc ở tab Thu chi`.

### Task 4: Đối chiếu giao diện với spec
**Files:** Modify theo kết quả (dự kiến `src/features/meters/components/*`, `src/features/invoices/components/invoice-editor.tsx`).

- [ ] **Step 1: Kiểm bằng dev server** từng mục spec 4, 5, 6: trang Chỉ số (bộ lọc, lịch sử, popup Chốt chỉ số), hoá đơn đầu có nút Sửa, popup sửa hợp đồng (không hiện chỉ số ban đầu khi chưa có), sửa số đầu lớn hơn số cuối thì báo lỗi đúng chỗ.
- [ ] **Step 2: Sửa mọi chỗ lệch** (mỗi chỗ một commit nhỏ `fix:`), cập nhật spec nếu hành vi đã đúng nhưng spec ghi sai.

### Task 5: Cập nhật e2e
**Files:** Modify `tests/e2e/*.spec.ts` theo lỗi thực tế.

- [ ] **Step 1: Xác định 13 test e2e đang đỏ thuộc nhánh hay dữ liệu thử**: chạy riêng các test đó trên `main` cùng môi trường để so sánh; ghi kết quả vào mô tả PR.
- [ ] **Step 2: Sửa các test lệch do nhánh này** (chọn phần tử theo luồng mới); test hỏng do dữ liệu rác thì dọn dữ liệu thử hoặc làm test tự chứa.
- [ ] **Step 3: Thêm e2e**: tab Thu chi sửa/xoá một khoản thu; sửa số đầu ở hoá đơn đầu.

### Task 6: Chạy test và cập nhật PR
- [ ] **Step 1:** `npm test` — Expected: toàn bộ unit + integration PASS (đọc output, báo test đỏ theo tên).
- [ ] **Step 2:** `npm run lint` và `npx tsc --noEmit` — Expected: không lỗi.
- [ ] **Step 3:** e2e ở `http://localhost:3001` (server chạy `NEXT_PUBLIC_DEMO_MODE=1`), chỉ chạy lại test đỏ, rồi chạy trọn bộ một lần — Expected: không còn test đỏ do nhánh.
- [ ] **Step 4:** Đẩy nhánh, cập nhật mô tả PR #24 (Summary, Why, Changes, Testing có lệnh và kết quả, phần chưa kiểm). Không merge.
