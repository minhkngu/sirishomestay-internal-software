# Gia hạn hợp đồng ghi thẳng giá, phí, cọc — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popup Gia hạn ghi thẳng giá thuê, phí, cọc, ngày kết thúc vào hợp đồng; phụ lục chỉ ghi Trước/Sau để tham khảo; Sửa hợp đồng cảnh báo đỏ khi giá trị khác phụ lục gia hạn mới nhất.

**Architecture:** `createExtension` cập nhật `leases` và phí (qua `applyLeaseFeeEdits`) trong một giao dịch, rồi lưu phụ lục với cột mới `reference` (`{ before, after }`) và không điền `newMonthlyRent`, `newDepositAmount`, `newFees` nên `contractTermsAt` không đổi. Cảnh báo đỏ so giá trị đang nhập ở form Sửa hợp đồng với `reference.after` mới nhất, thuần phía client.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle + Postgres, zod, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-27-gia-han-hop-dong-sua-phi-design.md`

## Global Constraints

- Tiếng Việt cho giao diện, commit, comment; commit theo Conventional Commits.
- Service nhận `(db, ctx, input)`, input là `unknown`, parse bằng zod trong service; server action bọc bằng `toActionResult`.
- Module `leasing` (tầng 4) chỉ import tầng thấp hơn qua cổng công khai; `ui` chỉ `import type` từ code server.
- Mỗi phí tính theo đồng hồ gắn đúng một đồng hồ; đơn giá lấy từ hợp đồng.
- Migration: sửa `src/db/schema/` rồi `npm run db:generate`; không sửa tay `drizzle/`.
- Theo `CLAUDE.md`: viết test nhưng chỉ chạy khi chuẩn bị PR (Task 7). Không push, không mở PR khi Lucas chưa yêu cầu.
- Chỉ cảnh báo, không chặn, không popup nhắc; chỉ đổi cọc nếu có thay đổi.

## Review Focus

- Cọc mới trống hoặc bằng cọc cũ: `leases.depositAmount` giữ nguyên và không ghi sổ cọc.
- Phụ lục gia hạn mới không đổi điều khoản `contractTermsAt` (giá thuê Sửa hợp đồng sau gia hạn vẫn có hiệu lực).
- Gia hạn lần hai: cảnh báo so với phụ lục gia hạn mới nhất, không phải phụ lục đầu.
- Phụ lục cũ (không có `reference`) không gây lỗi hay cảnh báo.
- Xem trước gia hạn không đổi `leases`, phí, hay sổ cọc.

## File Structure

- Modify `src/db/schema/addenda.ts`; migration qua `db:generate`.
- Create `src/modules/leasing/domain/extension-reference.ts` — kiểu và so sánh.
- Modify `src/modules/leasing/server/addenda/service.ts` (`extensionSchema`, `createExtension`, `addendumFormData`), `server/contracts/history.ts`, `server/contracts/restore.ts`, `server/contracts/actions.ts`.
- Modify `ui/contracts/extension-dialog.tsx`, `ui/contracts/contract-row-actions.tsx`, `ui/contracts/contract-edit-actions.tsx`, `ui/contracts/addenda-list.tsx`; create `ui/contracts/extension-fees.ts`.
- Tests: `tests/unit/domain/extension-reference.test.ts`, `tests/unit/contracts/extension-fees.test.ts`, `tests/integration/addenda.test.ts`, `tests/integration/contract-restore.test.ts`, `tests/e2e/addenda.spec.ts`.

---

### Task 1: Cột `reference` của phụ lục

**Files:**
- Modify: `src/db/schema/addenda.ts`; migration trong `drizzle/` do `npm run db:generate`
- Modify: `src/domain/types.ts` (`Addendum.reference?`)

**Interfaces:**
- Produces: `addenda.reference: jsonb` nullable; `Addendum['reference']?: { before: TermsRef; after: TermsRef } | null`, với `TermsRef` định nghĩa ở Task 2.

- [ ] **Step 1:** Thêm `reference: jsonb('reference')` vào bảng `addenda` (cạnh `newFees`), `npm run db:generate`, giữ nguyên file sinh; thêm trường vào kiểu `Addendum` và `toAddendum` trong `invoices/service.ts`.
- [ ] **Step 2: Commit** `feat: Cột reference cho phụ lục gia hạn`.

### Task 2: Kiểu và so sánh `reference`

**Files:**
- Create: `src/modules/leasing/domain/extension-reference.ts`
- Test: `tests/unit/domain/extension-reference.test.ts`

**Interfaces:**
- Produces: `type TermsRef = { endDate: string; monthlyRent: number; depositAmount: number; fees: { feeTypeId: string | null; name: string; unit: string; unitPrice: number; quantitySource: string }[] }`.
- Produces: `referenceChanges(ref: { before: TermsRef; after: TermsRef }): { label: string; before: string; after: string }[]` — dòng giá thuê, cọc, ngày kết thúc, từng phí; "Đã bỏ"/"Mới" cho phí bỏ, thêm; chỉ trả dòng khác nhau.
- Produces: `referenceMismatches(current: TermsRef, expected: TermsRef): { key: 'rent' | 'deposit' | 'endDate' | `fee:${string}`; label: string; current: string; expected: string }[]` — khóa phí là `feeTypeId ?? name`.

- [ ] **Step 1: Write failing tests:** đổi giá thuê và cọc → 2 dòng `referenceChanges`; phí bỏ → `after` "Đã bỏ"; phí thêm → `before` "Mới"; không đổi → `[]`; `referenceMismatches` trả đúng khóa khi giá thuê, một phí, ngày kết thúc khác; trùng khớp → `[]`.
- [ ] **Step 2: Implement** hai hàm thuần, tiền định dạng bằng `formatVND`, ngày bằng `formatDateVN`.
- [ ] **Step 3: Commit** `feat: Hàm so sánh Trước/Sau và cảnh báo lệch phụ lục`.

### Task 3: Gia hạn ghi thẳng vào hợp đồng

**Files:**
- Modify: `src/modules/leasing/server/addenda/service.ts` (`extensionSchema` ~dòng 109; `createExtension` ~dòng 421; `checkDate` ~dòng 191)
- Test: `tests/integration/addenda.test.ts`

**Interfaces:**
- Consumes: `applyLeaseFeeEdits(tx, ctx, leaseId, edits, roomId, startDate)` (`contracts/lease-fees.ts`); `TermsRef` (Task 2).
- Produces: `extensionSchema` có `fees?: { leaseFeeId?: string; feeTypeId?: string; unitPrice: number; existingMeterId?: string; initialReading?: number }[]`; `adjustmentTarget` và `newFees` thành tuỳ chọn và bị bỏ qua.

- [ ] **Step 1: Write failing tests** (`addenda.test.ts`):
  - `'gia hạn ghi thẳng giá thuê, ngày kết thúc và phí vào hợp đồng'` — sau gia hạn `leases.monthlyRent`, `endDate`, đơn giá phí đúng; phụ lục có `reference.before/after`; `newMonthlyRent`, `newDepositAmount`, `newFees` đều null.
  - `'cọc trống hoặc bằng cọc cũ: không đổi cọc, không ghi sổ cọc'` và `'cọc khác: đổi depositAmount và ghi một khoản chờ'`.
  - `'sửa hợp đồng sau gia hạn: giá thuê mới có hiệu lực'` — `updateLease` đổi giá thuê rồi `contractTermsAt` ra giá vừa sửa.
  - `'gia hạn thêm phí đồng hồ cần đồng hồ và chỉ số đầu'`, `'gia hạn bỏ phí cố định'`, `'bỏ phí đồng hồ bị chặn như Sửa hợp đồng'`.
  - `'ngày hiệu lực = ngày hết hạn cũ + 1 được nhận, +2 bị chặn'`; `'ngày kết thúc mới nhỏ hơn ngày hiệu lực bị chặn'`.
  - `'gia hạn không sinh điều chỉnh'` và `'xem trước gia hạn không đổi hợp đồng, phí, sổ cọc'`.
- [ ] **Step 2: Implement** trong `createExtension`: sau `lockLease`/`checkDate` (nới cho gia hạn: `effectiveDate <= addDays(l.endDate, 1)`; thêm `newEndDate >= effectiveDate`), lấy `before` từ hợp đồng và phí hiện tại, `captureContractVersion`, `update leases` (`endDate`, `monthlyRent` nếu có, `depositAmount` nếu có và khác), `applyLeaseFeeEdits` khi có `data.fees` (truyền `l.roomId`, `l.startDate`), khoản sổ cọc bằng `depositDiffEntry` chỉ khi cọc đổi, tính `after`, chèn phụ lục `{ type: 'extension', effectiveDate, newEndDate, reference: { before, after } }`, ghi nhật ký. Bỏ `applyAdjustments`.
- [ ] **Step 3: Commit** `feat: Gia hạn ghi thẳng giá, phí, cọc vào hợp đồng`.

### Task 4: Khôi phục hoàn lại phí

**Files:**
- Modify: `src/modules/leasing/server/contracts/history.ts` (snapshot), `restore.ts`
- Test: `tests/integration/contract-restore.test.ts`

**Interfaces:**
- Produces: snapshot của phiên bản có thêm `fees: LeaseFeeSnapshot[]` và `feeMeters: LeaseFeeMeter[]` của hợp đồng; Khôi phục trả lại đúng hai tập này.

- [ ] **Step 1: Write failing test** `'khôi phục sau gia hạn hoàn lại giá thuê, ngày kết thúc, cọc và phí'` (đổi giá điện, thêm một phí; sau khôi phục dòng phí và gắn đồng hồ như trước; phụ lục bị xoá).
- [ ] **Step 2: Implement** chụp `leaseFeeSnapshots` và `leaseFeeMeters` trong `captureContractVersion` (hợp đồng thuê); khôi phục: xoá các dòng phí hiện tại rồi chèn lại từ snapshot, và liệt kê chênh lệch phí trong danh sách xem trước (`restore.ts:108`).
- [ ] **Step 3: Commit** `fix: Khôi phục hợp đồng hoàn lại cả phí`.

### Task 5: Popup Gia hạn

**Files:**
- Create: `src/modules/leasing/ui/contracts/extension-fees.ts`
- Modify: `src/modules/leasing/ui/contracts/extension-dialog.tsx`, `contract-row-actions.tsx:272`; `server/contracts/actions.ts` (khối `feeData` ~dòng 285–375)
- Test: `tests/unit/contracts/extension-fees.test.ts`, `tests/e2e/addenda.spec.ts`

**Interfaces:**
- Produces: `extensionFeesPayload(rows: FeeDraft[], initial: FeeDraft[]): ExtensionFeeEdit[] | undefined` — `undefined` khi không đổi; còn lại danh sách đủ dòng giữ lại; chỉ dòng đồng hồ mới gửi `existingMeterId`, `initialReading`.
- Produces: `defaultExtensionDate(endDate: string): string` (ngày liền sau).
- Produces: `ExtensionDialog` thêm prop `feeData` (cùng dạng loader: `current`, `options`, `roomMeters`, `units`).

- [ ] **Step 1: Write failing unit tests:** không đổi → `undefined`; đổi giá một dòng → đủ mọi dòng; bỏ dòng → vắng mặt; thêm phí đồng hồ → có đồng hồ và chỉ số đầu; `defaultExtensionDate('2026-12-31') === '2027-01-01'`.
- [ ] **Step 2: Implement** helper; truyền `feeData` từ loader hiện có vào `ExtensionDialog` (tách phần dựng `feeData` thành hàm dùng chung nếu cần, không đổi hành vi Sửa hợp đồng).
- [ ] **Step 3: Dialog:** ngày hiệu lực mặc định `defaultExtensionDate`, ô giá thuê và cọc hiện giá trị hiện tại làm gợi ý (để trống nếu không đổi), phần Phí bằng `LeaseFees`, bỏ `TargetSelect`; `input` gồm `fees` từ `extensionFeesPayload`.
- [ ] **Step 4:** Cập nhật `addenda.spec.ts`: mở Gia hạn, đổi giá điện, bỏ một phí, thêm một phí, Xem trước, Lưu; kiểm tra hợp đồng hiện giá mới (viết, chưa chạy).
- [ ] **Step 5: Commit** `feat: Popup Gia hạn sửa giá thuê, phí, cọc`.

### Task 6: Cảnh báo đỏ và Trước/Sau

**Files:**
- Modify: `server/contracts/actions.ts` (loader trả `extensionReference`), `ui/contracts/contract-edit-actions.tsx`, `ui/contracts/addenda-list.tsx`, nơi dựng `items` ở `src/app/(app)/contracts/contract-detail.tsx:705`
- Test: `tests/e2e/addenda.spec.ts`

**Interfaces:**
- Consumes: `referenceMismatches`, `referenceChanges`, `TermsRef` (Task 2).
- Produces: loader trả `extensionReference: TermsRef | null` — `reference.after` của phụ lục gia hạn mới nhất (theo `effectiveDate`, rồi `createdAt`; bỏ qua phụ lục không có `reference`); `AddendaList` item thêm `changes?: ReturnType<typeof referenceChanges>`.

- [ ] **Step 1: Loader.** Chọn phụ lục gia hạn mới nhất có `reference`, trả `after`.
- [ ] **Step 2: Form Sửa hợp đồng.** Từ giá trị đang nhập (`rent`, `deposit`, `endDate`, `feeRows`) dựng `TermsRef` và gọi `referenceMismatches(current, extensionReference)`; hiện chữ và viền đỏ kèm "Phụ lục: <giá trị>" cạnh từng trường lệch; không chặn lưu, không popup.
- [ ] **Step 3: Danh sách phụ lục.** Server tính `changes` từ `reference` cho mỗi phụ lục gia hạn; `AddendaList` hiện hai cột Trước/Sau.
- [ ] **Step 4:** Thêm vào `addenda.spec.ts` kiểm tra cảnh báo đỏ xuất hiện khi sửa giá thuê khác phụ lục và biến mất khi khớp lại (viết, chưa chạy).
- [ ] **Step 5: Commit** `feat: Cảnh báo đỏ khi hợp đồng lệch phụ lục gia hạn và so sánh Trước/Sau`.

### Task 7: Kiểm tra trước PR

- [ ] **Step 1:** Thêm test ghim điểm còn mở: khi cọc tăng, khoản "Thu cọc bổ sung" chờ và dòng "Tiền cọc còn thiếu" của hoá đơn kỳ sau không tính trùng; nếu có trùng, báo Lucas thay vì tự sửa.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/addenda.test.ts tests/integration/contract-restore.test.ts tests/unit/domain/extension-reference.test.ts tests/unit/contracts/extension-fees.test.ts`; kỳ vọng PASS. Chạy lại riêng test lỗi sau mỗi lần sửa.
- [ ] **Step 3: Chạy** `npm run typecheck`, `npm run lint`, `npm run format:check`; e2e `addenda.spec.ts` sau `node scripts/e2e-preflight.mjs`.
- [ ] **Step 4: Báo cáo:** đã đổi gì, đã kiểm gì (lệnh, kết quả), chưa kiểm gì (bản in PDF/Word của phụ lục).
