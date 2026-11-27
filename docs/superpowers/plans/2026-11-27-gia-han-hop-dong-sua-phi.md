# Gia hạn hợp đồng sửa giá thuê và phí — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popup Gia hạn cho sửa đơn giá, bỏ phí cũ, thêm phí mới (kể cả phí tính theo đồng hồ), ngày hiệu lực mặc định là ngày liền sau ngày hết hạn cũ, và phụ lục hiện so sánh Trước/Sau.

**Architecture:** Phụ lục gia hạn tiếp tục lưu `newFees` là danh sách phí đầy đủ (cơ chế `contractTermsAt` đang thay cả danh sách), nhưng mỗi dòng mang `leaseFeeId` và `quantitySource`. Phí mới tạo dòng `lease_fee_snapshots` gắn với phụ lục qua cột `addendum_id`; bộ đọc "phí gốc" bỏ qua các dòng này nên kỳ trước ngày hiệu lực không bị tính phí mới. Đầu vào của popup dùng cùng dạng với "Sửa hợp đồng" (`leaseFeeId?`, `feeTypeId?`, `unitPrice`, `existingMeterId?`, `initialReading?`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle + Postgres, zod, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-27-gia-han-hop-dong-sua-phi-design.md`

## Global Constraints

- Tiếng Việt cho giao diện, commit, comment; commit theo Conventional Commits.
- Service nhận `(db, ctx, input)`, input là `unknown`, parse bằng zod trong service; server action bọc bằng `toActionResult`.
- Module `leasing` (tầng 4) chỉ import module tầng thấp hơn qua cổng công khai (`@/modules/meters`, `@/modules/facilities`); `ui` chỉ `import type` từ code server.
- Mỗi phí tính theo đồng hồ gắn đúng một đồng hồ của phòng; đồng hồ đã gắn không dùng cho phí khác; đơn giá lấy từ hợp đồng.
- Migration: sửa `src/db/schema/` rồi `npm run db:generate`; không sửa tay `drizzle/`.
- Theo `CLAUDE.md`: viết test nhưng chỉ chạy khi chuẩn bị PR (Task 6). Không push, không mở PR khi Lucas chưa yêu cầu.

## Review Focus

- Gia hạn lần hai trở đi: popup điền sẵn phí từ điều khoản tại ngày hiệu lực (gốc + phụ lục trước), không phải từ phí gốc.
- Bỏ phí điện rồi thêm lại phí điện trên cùng đồng hồ: báo lỗi rõ "Đồng hồ đang gắn với phí của hợp đồng khác"; hướng dẫn giữ phí cũ và đổi giá.
- Ngày hiệu lực sau ngày hết hạn cũ nhưng ngày kết thúc mới nhỏ hơn ngày hiệu lực: bị chặn.
- Xem trước không lưu gì: không tạo dòng phí, đồng hồ hay phụ lục.
- Phí trùng loại, đơn giá âm hoặc vượt `MAX_MONEY`: bị chặn như ở "Sửa hợp đồng".

## File Structure

- Modify `src/db/schema/contracts.ts`, create `drizzle/` migration (qua `db:generate`) — cột `addendum_id`.
- Modify `src/modules/leasing/server/invoices/service.ts` (`leasesData`), `contracts/lease-queries.ts` (`contractFees`), `contracts/lease-fees.ts` — chỉ đọc phí gốc.
- Create `src/modules/leasing/server/addenda/extension-fees.ts` — dựng `newFees` cho gia hạn.
- Modify `src/modules/leasing/server/addenda/service.ts` — `extensionSchema`, `createExtension`, `addendumFormData`.
- Create `src/modules/leasing/domain/addendum-diff.ts` — so sánh Trước/Sau.
- Modify `src/modules/leasing/ui/contracts/extension-dialog.tsx`, `addenda-list.tsx`; create `ui/contracts/extension-fees.ts` — payload phí.
- Tests: `tests/integration/addenda.test.ts`, `tests/integration/contract-restore.test.ts`, `tests/unit/contracts/extension-fees.test.ts`, `tests/unit/domain/addendum-diff.test.ts`, `tests/e2e/addenda.spec.ts`; cập nhật `Test Flow` trong vault chỉ khi Lucas yêu cầu.

---

### Task 1: Cột `addendum_id` và đọc phí gốc

**Files:**
- Modify: `src/db/schema/contracts.ts` (`leaseFeeSnapshots`, ~dòng 119)
- Modify: `src/modules/leasing/server/invoices/service.ts` (`leasesData`, query `leaseFeeSnapshots` ~dòng 108)
- Modify: `src/modules/leasing/server/contracts/lease-queries.ts:22` (`contractFees`)
- Modify: `src/modules/leasing/server/contracts/lease-fees.ts:18` (`applyLeaseFeeEdits`, truy vấn `existing`)
- Test: `tests/integration/addenda.test.ts`

**Interfaces:**
- Produces: `leaseFeeSnapshots.addendumId: string | null` (FK `addenda.id`, `onDelete: 'cascade'`). Quy ước: dòng có `addendumId` chỉ xuất hiện qua `newFees` của phụ lục đó; mọi chỗ đọc "phí gốc của hợp đồng" phải lọc `addendumId IS NULL`.

- [ ] **Step 1: Write the failing test** trong `addenda.test.ts`: `it('phí gắn phụ lục không lẫn vào phí gốc của hợp đồng')` — tạo hợp đồng, chèn một `leaseFeeSnapshots` có `addendumId` của một phụ lục gia hạn; assert `leaseData(db, leaseId).fees` và `contractFees(db, leaseId)` không chứa dòng đó.
- [ ] **Step 2: Add column** `addendumId: uuid('addendum_id').references(...)` vào `leaseFeeSnapshots`. Nếu `contracts.ts` và `addenda.ts` import vòng, dùng tham chiếu lười `(): AnyPgColumn => addenda.id`. Chạy `npm run db:generate`, giữ nguyên file sinh ra.
- [ ] **Step 3: Filter reads.** Thêm `isNull(leaseFeeSnapshots.addendumId)` vào ba chỗ nêu trên. Rà `grep -rn leaseFeeSnapshots src` và với mỗi chỗ còn lại ghi một dòng comment quyết định (đọc gốc hay đọc tất cả); `linkedMeterIdsForLease` và truy vấn "đồng hồ bận" trong `ensureFeeMeter` giữ đọc tất cả vì đồng hồ gắn phí phụ lục vẫn là đồng hồ bận.
- [ ] **Step 4: Commit** `feat: Cột addendum_id cho dòng phí phát sinh từ phụ lục`.

### Task 2: Server dựng phí gia hạn

**Files:**
- Create: `src/modules/leasing/server/addenda/extension-fees.ts`
- Modify: `src/modules/leasing/server/addenda/service.ts` (`extensionSchema` ~dòng 109, `createExtension` ~dòng 421, `checkDate` ~dòng 191)
- Test: `tests/integration/addenda.test.ts`

**Interfaces:**
- Produces: `buildExtensionFees(tx: DB, ctx: AccessContext, args: { leaseId: string; roomId: string; addendumId: string; effectiveDate: string; current: ContractFee[]; edits: ExtensionFeeEdit[] }): Promise<ContractFee[]>` — trả danh sách đầy đủ phí hiệu lực từ ngày hiệu lực; dòng cũ giữ `leaseFeeId`, `quantitySource`; phí thêm tạo `leaseFeeSnapshots` (với `addendumId`) và, nếu `quantityFrom === 'meter'`, gọi `ensureFeeMeter` với `installedOn: effectiveDate`.
- Produces: `type ExtensionFeeEdit = { leaseFeeId?: string; feeTypeId?: string; unitPrice: number; existingMeterId?: string; initialReading?: number }`.
- Consumes: `ensureFeeMeter` từ `@/modules/meters`; `contractTermsAt`, `leaseData`, `loadAddenda`.

- [ ] **Step 1: Write failing tests** trong `addenda.test.ts` (mỗi test một `it`):
  - `'gia hạn đổi giá điện: giữ đủ dòng điện, nước và dùng giá mới từ kỳ gia hạn'` — build hoá đơn kỳ trước và kỳ sau ngày hiệu lực; kỳ trước giá cũ, kỳ sau dòng điện có `unitPrice` mới và vẫn có dòng nước.
  - `'gia hạn bỏ một phí cố định: kỳ sau không còn phí đó, kỳ trước vẫn còn'`.
  - `'gia hạn thêm phí cố định mới: kỳ trước không có, kỳ sau có'` (kiểm tra qua `leaseData(...).fees` không chứa phí mới).
  - `'gia hạn thêm phí đồng hồ mới cần đồng hồ và chỉ số đầu'` — thiếu `existingMeterId` → `ValidationError`.
  - `'ngày hiệu lực = ngày hết hạn cũ + 1 được nhận, +2 bị chặn'` và `'ngày kết thúc mới nhỏ hơn ngày hiệu lực bị chặn'`.
  - `'ngày hiệu lực sau ngày hết hạn cũ: không sinh điều chỉnh'`.
  - `'xem trước gia hạn có phí mới không lưu dòng phí nào'`.
- [ ] **Step 2: Extend schema.** `extensionSchema.fees: z.array(extensionFeeEditSchema).optional()` theo `ExtensionFeeEdit`; `unitPrice` có `.max(MAX_MONEY)`. Giữ `newFees` cũ trong schema chỉ để tương thích, nhưng khi có `fees` thì bỏ qua `newFees`.
- [ ] **Step 3: Implement `buildExtensionFees`** theo cùng kiểm tra của `applyLeaseFeeEdits`: loại phí tồn tại và đang dùng, không trùng loại (trừ phí đồng hồ), `unitPrice` hợp lệ. Dòng cũ vắng mặt trong `edits` là phí bị bỏ (kể cả phí đồng hồ, khác với "Sửa hợp đồng"). Lỗi `leaseFeeId` không thuộc `current` → `ValidationError('Phí không thuộc hợp đồng này')`.
- [ ] **Step 4: Wire into `createExtension`.** Tạo `addendumId = crypto.randomUUID()` trước, chèn phụ lục với `id: addendumId`; `current = contractTermsAt(base, existing, data.effectiveDate).fees`; khi có `data.fees`, thứ tự: chèn phụ lục với `newFees: null` (để FK `addendum_id` hợp lệ) → gọi `buildExtensionFees` → `update` `addenda.newFees` bằng kết quả. Nới `checkDate` cho gia hạn: cho phép `effectiveDate <= addDays(l.endDate, 1)`; thêm kiểm tra `data.newEndDate >= data.effectiveDate`.
- [ ] **Step 5: Commit** `feat: Gia hạn hợp đồng sửa, bỏ, thêm phí và nới ngày hiệu lực`.

### Task 3: Khôi phục dọn phí của phụ lục

**Files:**
- Test: `tests/integration/contract-restore.test.ts`
- Modify (nếu test fail): `src/modules/leasing/server/contracts/restore.ts` (~dòng 362)

**Interfaces:**
- Consumes: FK cascade của Task 1.

- [ ] **Step 1: Write failing test** `'khôi phục sau gia hạn thêm phí mới xoá dòng phí và gắn đồng hồ của phụ lục'`: gia hạn thêm phí đồng hồ, gọi khôi phục, assert không còn `leaseFeeSnapshots` có `addendumId` đó và không còn `leaseFeeMeters` tương ứng; `leaseData(...).fees` bằng trước khi gia hạn; ngày kết thúc về cũ.
- [ ] **Step 2: Fix if failing.** Cascade từ `addenda` xoá dòng phí; nếu `restore.ts` xoá phụ lục bằng cách khác, đảm bảo đồng hồ gắn phí được giải phóng. Danh sách xem trước khôi phục (`restore.ts:108`) liệt kê thêm dòng phí sẽ bị xoá.
- [ ] **Step 3: Commit** `fix: Khôi phục gia hạn dọn các phí do phụ lục tạo`.

### Task 4: Dữ liệu và popup Gia hạn

**Files:**
- Create: `src/modules/leasing/ui/contracts/extension-fees.ts`
- Modify: `src/modules/leasing/server/addenda/service.ts` (`addendumFormData` ~dòng 1173)
- Modify: `src/modules/leasing/server/contracts/actions.ts` (khối `feeData` ~dòng 285–375; trả thêm `form.extensionFees`)
- Modify: `src/modules/leasing/ui/contracts/extension-dialog.tsx`, `contract-row-actions.tsx:272`
- Test: `tests/unit/contracts/extension-fees.test.ts`, `tests/e2e/addenda.spec.ts`

**Interfaces:**
- Produces: `extensionFeesPayload(rows: FeeDraft[], initial: FeeDraft[]): ExtensionFeeEdit[] | undefined` (ui) — trả `undefined` khi danh sách không đổi so với ban đầu; ngược lại trả danh sách đủ dòng đang giữ, mỗi dòng `{ leaseFeeId?, feeTypeId, unitPrice, existingMeterId?, initialReading? }` (chỉ gửi đồng hồ và chỉ số cho dòng đồng hồ mới).
- Produces: `defaultExtensionDate(endDate: string): string` = ngày liền sau `endDate`.
- Produces: `ExtensionDialog` thêm prop `feeData` (cùng dạng `feeData` ở loader: `current`, `options`, `roomMeters`, `units`).
- Consumes: `LeaseFees`, `FeeDraft` từ `lease-fees.tsx`; `ExtensionFeeEdit` (type) từ Task 2.

- [ ] **Step 1: Write failing unit tests** (`extension-fees.test.ts`): không đổi → `undefined`; đổi giá một dòng → danh sách đủ mọi dòng giữ lại; bỏ một dòng → dòng đó vắng mặt; thêm phí đồng hồ → có `existingMeterId` và `initialReading`; `defaultExtensionDate('2026-12-31') === '2027-01-01'`.
- [ ] **Step 2: Implement helpers** trong `extension-fees.ts`.
- [ ] **Step 3: Form data.** Điền sẵn từ điều khoản tại ngày hiệu lực mặc định: `contractTermsAt(leaseData, addenda, addDays(endDate, 1))` chứ không từ phí gốc (Review Focus 1). Tách phần dựng `feeData` trong `actions.ts` thành hàm nhận danh sách phí để dùng chung cho "Sửa hợp đồng" và gia hạn; không đổi hành vi của "Sửa hợp đồng".
- [ ] **Step 4: Dialog.** Thêm khối "Phí áp dụng từ <ngày hiệu lực>" bằng `LeaseFees` (có nút bỏ dòng, thêm phí, hiện giá cũ → mới); ngày hiệu lực mặc định `defaultExtensionDate(endDate)`; ẩn `TargetSelect` khi `effectiveDate > endDate`; truyền `fees: extensionFeesPayload(...)` vào `input` (bỏ khoá khi `undefined`).
- [ ] **Step 5: Update e2e** `addenda.spec.ts`: mở Gia hạn, sửa đơn giá điện, bỏ một phí, thêm một phí, xem trước, lưu; kiểm tra phụ lục xuất hiện (viết, chưa chạy).
- [ ] **Step 6: Commit** `feat: Popup Gia hạn sửa phí và ngày hiệu lực mặc định`.

### Task 5: So sánh Trước/Sau trên phụ lục

**Files:**
- Create: `src/modules/leasing/domain/addendum-diff.ts`
- Modify: `src/modules/leasing/ui/contracts/addenda-list.tsx`; nơi dựng `items` cho `AddendaList` ở `src/app/(app)/contracts/contract-detail.tsx:705` và loader tương ứng
- Test: `tests/unit/domain/addendum-diff.test.ts`

**Interfaces:**
- Produces: `addendumChanges(lease: Lease, addenda: Addendum[], addendumId: string): { label: string; before: string | null; after: string | null }[]` — các dòng: Giá thuê, Tiền cọc, Ngày kết thúc, từng phí (đơn giá; "Đã bỏ" / "Mới" cho phí bỏ hoặc thêm); `before` = `contractTermsAt` tại `effectiveDate − 1`, `after` = tại `effectiveDate`; chỉ trả dòng có thay đổi.
- Produces: `AddendaList` item thêm `changes?: ReturnType<typeof addendumChanges>`; hiện hai cột Trước/Sau dưới tiêu đề phụ lục.

- [ ] **Step 1: Write failing tests**: đổi giá thuê và cọc → hai dòng; bỏ phí → `after` "Đã bỏ"; thêm phí → `before` "Mới"; không đổi → mảng rỗng; gia hạn lần hai so với kết quả lần một.
- [ ] **Step 2: Implement** `addendumChanges` (thuần, dùng `contractTermsAt`, định dạng tiền bằng `formatVND`).
- [ ] **Step 3: Loader và UI.** Server tính `changes` cho mỗi phụ lục gia hạn khi dựng `items`; `AddendaList` chỉ hiển thị.
- [ ] **Step 4: Commit** `feat: Phụ lục hiện so sánh Trước/Sau`.

### Task 6: Kiểm tra trước PR và kiểm tra các điểm còn mở

**Files:**
- Test: `tests/integration/invoices.test.ts` hoặc `addenda.test.ts`

- [ ] **Step 1: Pin hai điểm chưa biết bằng test** (viết trước khi chạy): (a) khoản "Thu cọc bổ sung" chờ trong sổ cọc và dòng "Tiền cọc còn thiếu" trên hoá đơn kỳ gia hạn không tính trùng — assert tổng cọc phải thu bằng đúng phần tăng; (b) hoá đơn nháp của kỳ gia hạn tạo trước khi lưu phụ lục: ghi lại hành vi thực (tính lại hay giữ nguyên) bằng assertion; nếu hành vi sai so với spec, báo Lucas thay vì tự sửa.
- [ ] **Step 2: Chạy** chỉ file test liên quan: `npx vitest run tests/integration/addenda.test.ts tests/integration/contract-restore.test.ts tests/unit/contracts/extension-fees.test.ts tests/unit/domain/addendum-diff.test.ts`; kỳ vọng tất cả PASS. Chạy lại riêng các test fail sau mỗi lần sửa.
- [ ] **Step 3: Chạy** `npm run typecheck`, `npm run lint`, `npm run format:check`; kỳ vọng không lỗi. Chạy e2e `addenda.spec.ts` sau `node scripts/e2e-preflight.mjs`.
- [ ] **Step 4: Báo cáo** theo mẫu: đã đổi gì, đã kiểm gì (lệnh và kết quả), chưa kiểm gì (bản in PDF/Word của hợp đồng và phụ lục).

## Ngoài phạm vi (báo cho Lucas)

- "Sửa hợp đồng" sau khi đã gia hạn chỉ sửa phí gốc; từ ngày hiệu lực, điều khoản lấy từ phụ lục nên sửa đó không có tác dụng với kỳ gia hạn.
- Việc đổi lượng điện nước tháng cuối hợp đồng cũ sang giá cũ chưa được duyệt; giữ hành vi hiện có (giá của kỳ hoá đơn).
