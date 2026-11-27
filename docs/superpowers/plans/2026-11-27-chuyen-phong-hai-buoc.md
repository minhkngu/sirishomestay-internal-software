# Chuyển phòng hai bước và ví khách Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiền khách trả dư vào ví khách, thu tiền có lựa chọn dùng ví, và một popup "Chuyển phòng" thanh lý hợp đồng cũ, tạo hợp đồng mới, cộng dồn kết quả thanh lý sang hợp đồng mới.

**Architecture:** Bảng sổ ví theo (người thuê, cơ sở). `recordLeasePayment` bỏ chặn thu vượt và ghi ví. Hoá đơn thanh lý hút ví thành dòng giảm. Chuyển phòng gọi `createLease` và `createTermination` trong một giao dịch; duyệt thanh lý ghi điều chỉnh chờ `T` cho hợp đồng mới. Tất cả trong module `leasing`.

**Tech Stack:** Next.js 16, Drizzle + Postgres/PGlite, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-chuyen-phong-hai-buoc-design.md`

## Global Constraints

- Tiền là số nguyên VND, có dấu. Ví tách theo cơ sở; chỉ chuyển phòng trong cùng một cơ sở.
- Khoản dùng ví ghi `payments.method = 'wallet'`; thu vượt ghi biến động ví loại `overpay`. Khoá chống trùng: `overpay:<paymentId>`, `transfer:<oldLeaseId>`.
- Hợp đồng cũ kết thúc đúng ngày chuyển; hợp đồng mới bắt đầu ngày chuyển + 1.
- Sổ quỹ chỉ tính tiền thật: `overpay` tính một lần vào ngày khách đưa; `method = 'wallet'` và biến động dùng ví không tính.
- Nút "Bỏ duyệt" bị chặn với hoá đơn thanh lý thuộc chuyển phòng. Không có khôi phục tự động sau duyệt.
- Schema chỉ đổi qua `src/db/schema/` rồi `npm run db:generate`, không sửa tay `drizzle/`.
- Nhãn, hằng số: một nguồn (kiểu trong `src/domain/statuses.ts`, nhãn thanh toán trong `src/domain/payment-labels.ts`). Chuỗi giao diện, comment, commit viết tiếng Việt, commit theo Conventional Commits.
- Ranh giới module: code mới trong `src/modules/leasing/`; sổ quỹ chỉ đọc ví qua `src/modules/leasing/index.ts`. Server action bọc service bằng `toActionResult` và `revalidatePath`.
- Theo `CLAUDE.md` của repo: **viết** test cho từng task nhưng **không chạy** test trong lúc làm; chỉ chạy `npm run typecheck` sau mỗi task và chạy test một lần khi chuẩn bị PR.

## Review Focus

1. Thu tiền khi hợp đồng không còn hoá đơn mở: báo lỗi rõ, không tạo ví từ hư không. (Task 4)
2. Dùng ví vượt số dư ví hoặc vượt nợ bị chặn; hai lần thu cùng lúc không dùng quá số dư. (Task 4)
3. Duyệt hoá đơn thanh lý chạy lại không ghi trùng điều chỉnh hoặc biến động ví. (Task 8)
4. `T = 0` không tạo điều chỉnh chờ; `T` dương và âm đều đúng dấu. (Task 8)
5. Ví của khách ở cơ sở khác không bị dùng chéo. (Task 3)

---

### Task 1: Schema ví và liên kết chuyển phòng

**Files:**
- Create: `src/db/schema/wallet.ts`
- Modify: `src/db/index.ts` (thêm `export * from './schema/wallet'`), `src/db/schema/contracts.ts` (cột trên `leases`), `src/domain/statuses.ts`
- Generate: `drizzle/` qua `npm run db:generate`
- Test: `tests/integration/schema.test.ts` (thêm kiểm bảng/cột)

**Interfaces:**
- Produces: `tenantWalletEntries` (bảng `tenant_wallet_entries`): `id`, `tenantId`, `facilityId`, `amount` (bigint có dấu), `kind: WalletEntryKind`, `leaseId?`, `invoiceId?`, `paymentId?`, `date`, `note`, `sourceKey` (unique), `createdAt`. `WalletEntryKind = 'overpay' | 'use_invoice' | 'use_termination'`. Cột `leases.transferFromLeaseId` (uuid, null, tham chiếu `leases.id`).

- [ ] **Step 1:** Viết test trong `schema.test.ts` khẳng định bảng và hai cột tồn tại và `sourceKey` unique (chèn trùng thì lỗi).
- [ ] **Step 2:** Tạo `wallet.ts` và `WalletEntryKind`, thêm cột vào `leases`, export từ `src/db/index.ts`.
- [ ] **Step 3:** Chạy `npm run db:generate`, kiểm file migration mới có đúng bảng và cột; `npm run typecheck`.
- [ ] **Step 4:** Commit `feat: bảng sổ ví khách và liên kết chuyển phòng`.

### Task 2: Quy tắc thuần của ví

**Files:**
- Create: `src/modules/leasing/domain/wallet.ts`
- Test: `tests/unit/leasing/wallet.test.ts`

**Interfaces:**
- Produces:
  - `splitReceipt(received: number, owed: number): { toInvoices: number; toWallet: number }`
  - `clampWalletUse(requested: number, balance: number, owed: number): number` (trả `min` của ba số, không âm)

- [ ] **Step 1:** Viết test: `splitReceipt(15_000_000, 10_000_000)` → `{ toInvoices: 10_000_000, toWallet: 5_000_000 }`; `splitReceipt(6_000_000, 10_000_000)` → `{ 6_000_000, 0 }`; `clampWalletUse(9_000_000, 5_000_000, 10_000_000)` → `5_000_000`; `clampWalletUse(9_000_000, 5_000_000, 3_000_000)` → `3_000_000`; yêu cầu âm → `0`.
- [ ] **Step 2:** Cài hai hàm trong `wallet.ts`. `npm run typecheck`.
- [ ] **Step 3:** Commit `feat: quy tắc chia khoản thu và dùng ví`.

### Task 3: Dịch vụ sổ ví

**Files:**
- Create: `src/modules/leasing/server/wallet/service.ts`
- Modify: `src/modules/leasing/index.ts` (xuất hàm đọc)
- Test: `tests/integration/wallet.test.ts`

**Interfaces:**
- Consumes: `tenantWalletEntries` (Task 1).
- Produces:
  - `walletBalance(db: DB, tenantId: string, facilityId: string): Promise<number>` (tổng `amount`)
  - `addWalletEntry(tx: DB, e: { tenantId; facilityId; amount; kind: WalletEntryKind; leaseId?; invoiceId?; paymentId?; date; note?; sourceKey }): Promise<void>` (khoá trùng `sourceKey` thì bỏ qua, `onConflictDoNothing`)
  - `listWalletEntries(db: DB, ctx: AccessContext, tenantId: string, facilityId: string)`

- [ ] **Step 1:** Test: thêm hai biến động `+5_000_000` và `−2_000_000` → `walletBalance = 3_000_000`; cùng `sourceKey` ghi hai lần chỉ tính một; cơ sở B không thấy ví của cơ sở A (Review Focus 5).
- [ ] **Step 2:** Cài ba hàm; `listWalletEntries` kiểm quyền bằng `assertCan` như các service khác của khách.
- [ ] **Step 3:** `npm run typecheck`; commit `feat: dịch vụ sổ ví khách`.

### Task 4: Thu theo hợp đồng ghi thu vượt và dùng ví

**Files:**
- Modify: `src/modules/leasing/server/invoices/service.ts` (`recordLeasePayment` quanh dòng 1776, `leaseDebt`), `src/modules/leasing/server/invoices/actions.ts`, `src/domain/payment-labels.ts` (thêm nhãn `wallet`, không đưa vào `PAYMENT_METHOD_OPTIONS`)
- Test: `tests/integration/lease-payment.test.ts` (sửa test chặn vượt nợ, thêm test mới)

**Interfaces:**
- Consumes: `splitReceipt`, `clampWalletUse` (Task 2); `walletBalance`, `addWalletEntry` (Task 3).
- Produces: `recordLeasePayment(db, ctx, leaseId, input: { paidOn; amount: number; walletAmount?: number; method; note? })`. `leaseDebt` trả thêm `walletBalance: number`.

- [ ] **Step 1:** Viết test (bỏ test cũ mong lỗi "vượt tổng dư nợ"): hoá đơn 10_000_000, thu tiền mặt 15_000_000 → payment `10_000_000` method `cash` và biến động ví `overpay +5_000_000`; thu có `walletAmount: 4_000_000` khi ví 5_000_000 → payment `wallet 4_000_000` và biến động `use_invoice −4_000_000`; `walletAmount` vượt số dư ví hoặc vượt nợ → lỗi `ValidationError`; hợp đồng không còn hoá đơn mở mà `amount > 0` → lỗi "Hợp đồng không có hoá đơn cần thu"; hai lần thu cùng lúc dùng ví không vượt số dư (khoá hàng hợp đồng đã có `for update`, thêm khoá theo tenant).
- [ ] **Step 2:** Sửa `recordLeasePayment`: lấy người thuê chính và cơ sở của hợp đồng; tính `walletUse = clampWalletUse(...)` rồi chặn nếu `walletAmount` khác; gạch hoá đơn mở cũ trước, phần ví trước rồi tiền mặt; phần tiền mặt dư theo `splitReceipt` thành `overpay` với `sourceKey = overpay:<paymentId đầu tiên>`. Ghi nhật ký kiểm toán cho biến động ví.
- [ ] **Step 3:** Mở rộng input của `recordLeasePaymentAction` và `leaseDebtAction`.
- [ ] **Step 4:** `npm run typecheck`; commit `feat: thu vượt vào ví và dùng ví khi thu tiền`.

### Task 5: Sổ quỹ đọc ví đúng

**Files:**
- Modify: `src/modules/cashbook/server/cashbook/service.ts` (`listCashbook`), kiểu `LedgerRow` cùng nơi
- Test: `tests/integration/cashbook.test.ts`

**Interfaces:**
- Consumes: biến động `overpay` đọc qua cổng `src/modules/leasing/index.ts` (thêm hàm `listOverpayEntries(db, scope, month)` ở leasing nếu chưa có).

- [ ] **Step 1:** Test: khoản thu `wallet` không có trong thu; biến động `overpay +5_000_000` hiện đúng một dòng thu vào ngày khách đưa; tổng thu của ví dụ "đưa 15 triệu, hoá đơn 10 triệu" là 15_000_000.
- [ ] **Step 2:** Loại `payments.method = 'wallet'` khỏi `pay`; thêm nguồn dòng sổ từ biến động `overpay`, `counted: true`, hướng thu.
- [ ] **Step 3:** `npm run typecheck`; commit `feat: sổ quỹ tính tiền dư và bỏ khoản dùng ví`.

### Task 6: Popup thu tiền có tuỳ chọn ví

**Files:**
- Modify: `src/modules/leasing/ui/invoices/collect-payment-dialog.tsx`

**Interfaces:**
- Consumes: `leaseDebtAction` trả `walletBalance`; `recordLeasePaymentAction` nhận `walletAmount` (Task 4).

- [ ] **Step 1:** Khi `walletBalance > 0` hiện hộp "Dùng số dư ví: X" với ô số tiền (mặc định 0, tối đa `min(walletBalance, debt)`); bỏ lỗi "không được vượt dư nợ" cho tiền mặt và thay bằng dòng giải thích "phần dư vào ví". Nhánh hoá đơn hoàn khách (`refundInvoiceId`) giữ nguyên.
- [ ] **Step 2:** `npm run typecheck`; kiểm tay trên `http://localhost:3003`: thu vượt và dùng ví hoạt động; commit `feat: popup thu tiền hiện và dùng số dư ví`.

### Task 7: Hoá đơn thanh lý gạch ví và dòng chuyển

**Files:**
- Modify: `src/modules/leasing/domain/liquidation.ts` (`TerminationInput`, `buildTerminationInvoice`)
- Test: `tests/unit/leasing/liquidation.test.ts` (hoặc file test liquidation hiện có, tìm bằng `ls tests/unit`)

**Interfaces:**
- Produces: `TerminationInput` thêm `walletBalance?: number` và `transfer?: boolean`. Khi `walletBalance > 0`: thêm dòng `adjustment` "Số dư ví" amount `−min(walletBalance, max(0, tổng trước ví))`, `meta: { wallet: true }`. Khi `transfer`: sau cùng thêm dòng `adjustment` "Chuyển sang hợp đồng mới" amount `−T` với `T` là tổng các dòng trước nó, `meta: { transfer: true }`, nên tổng hoá đơn bằng 0.

- [ ] **Step 1:** Viết test với số cụ thể: tổng trước ví `4_000_000`, `walletBalance 5_000_000` → dòng ví `−4_000_000`; tổng trước ví `−3_000_000` thì không có dòng ví; `transfer` với `T = −3_000_000` → dòng chuyển `+3_000_000`, tổng `0`; `T = 2_000_000` → dòng `−2_000_000`; `T = 0` → không có dòng chuyển.
- [ ] **Step 2:** Cài trong `buildTerminationInvoice`; các nơi gọi cũ không truyền hai trường mới thì không đổi kết quả.
- [ ] **Step 3:** `npm run typecheck`; commit `feat: hoá đơn thanh lý gạch số dư ví và dòng chuyển`.

### Task 8: Thanh lý nối ví và cộng dồn sang hợp đồng mới

**Files:**
- Modify: `src/modules/leasing/server/addenda/service.ts` (`createTermination` thêm tham số `opts?: { transfer?: boolean }`, truyền `walletBalance` và `transfer` vào `buildTerminationInvoice`), `src/modules/leasing/server/addenda/finalize.ts` (`finalizeTermination`), `src/modules/leasing/server/invoices/service.ts` (`unapproveInvoice`)
- Test: `tests/integration/room-change.test.ts`

**Interfaces:**
- Consumes: Task 1, 3, 7.
- Produces: trong `finalizeTermination`, sau xử lý cọc: nếu dòng ví có thì `addWalletEntry` loại `use_termination` âm với `sourceKey = use_termination:<invoiceId>`; nếu có hợp đồng mới (`leases.transferFromLeaseId = hợp đồng cũ`) và `T ≠ 0` thì chèn `pendingAdjustments` cho hợp đồng mới: `amount = T`, `sourceKey = transfer:<oldLeaseId>`, mô tả "Chuyển từ hợp đồng <mã cũ>" (khoá trùng thì bỏ qua). `unapproveInvoice` ném `ValidationError('Hoá đơn thanh lý chuyển phòng: dùng Huỷ chuyển phòng')` khi hoá đơn có dòng `meta.transfer`.

- [ ] **Step 1:** Viết test: hợp đồng có ví `5_000_000` → hoá đơn thanh lý có dòng ví; duyệt → biến động ví `−` đúng số; duyệt hai lần không ghi trùng (Review Focus 3); `T = +2_000_000` → điều chỉnh chờ `+2_000_000` ở hợp đồng mới, `T = −3_000_000` → `−3_000_000`, `T = 0` → không có điều chỉnh (Review Focus 4); bỏ duyệt hoá đơn thanh lý chuyển phòng bị chặn.
- [ ] **Step 2:** Cài các thay đổi trên. Với `T`, đọc tổng các dòng hoá đơn đã duyệt trừ dòng `meta.transfer`.
- [ ] **Step 3:** `npm run typecheck`; commit `feat: thanh lý gạch ví và cộng dồn kết quả sang hợp đồng mới`.

### Task 9: Dịch vụ chuyển phòng và huỷ chuyển phòng

**Files:**
- Create: `src/modules/leasing/server/addenda/room-change.ts`
- Modify: `src/modules/leasing/server/addenda/actions.ts`, `src/modules/leasing/actions.ts`
- Test: `tests/integration/room-change.test.ts`

**Interfaces:**
- Consumes: `createLease(db, ctx, LeaseInput)` (`contracts/leases.ts`), `createTermination(db, ctx, leaseId, input, opts)` (Task 8), `deleteContract`, hàm khôi phục trong `contracts/restore.ts` (đọc file để lấy tên và chữ ký).
- Produces:
  - `createRoomChange(db, ctx, leaseId, input: unknown): Promise<{ newLeaseId: string; terminationInvoiceId: string }>`; `input` zod gồm `newRoomId`, `moveDate`, `lease` (`monthlyRent`, `endDate`, `depositAmount`, `fees`, mẫu hợp đồng, người ở cùng), `termination` (các trường của `terminationSchema` trừ `endDate`).
  - `cancelRoomChange(db, ctx, oldLeaseId, storage): Promise<void>`
  - `createRoomChangeAction`, `cancelRoomChangeAction` (bọc `toActionResult`, `revalidatePath`).

- [ ] **Step 1:** Viết test: chuyển phòng tạo hợp đồng mới ngày bắt đầu `moveDate + 1` với `transferFromLeaseId`, hợp đồng cũ có phụ lục thanh lý `endDate = moveDate` và hoá đơn thanh lý nháp ở chế độ chuyển; sao chép người ở cùng và phí, phí đồng hồ gắn đồng hồ phòng mới; phòng mới khác cơ sở bị từ chối; lỗi ở thanh lý (ví dụ thiếu chỉ số cuối) thì không còn hợp đồng mới nào; `cancelRoomChange` khi hoá đơn còn nháp xoá hợp đồng mới và đưa hợp đồng cũ về trạng thái trước thanh lý; bị từ chối khi hợp đồng mới đã có hoá đơn duyệt hoặc thu tiền.
- [ ] **Step 2:** Cài `createRoomChange` trong một `db.transaction` (tx ép kiểu `DB` như mã hiện có): kiểm cùng cơ sở và quyền `tenants_contracts`; gọi `createLease` rồi gán `transferFromLeaseId`; gọi `createTermination` với `opts.transfer = true`; việc ngoài cơ sở dữ liệu chạy sau giao dịch.
- [ ] **Step 3:** Cài `cancelRoomChange` và hai action; `npm run typecheck`.
- [ ] **Step 4:** Commit `feat: chuyển phòng hai bước và huỷ chuyển phòng`.

### Task 10: Popup "Chuyển phòng" thay phụ lục chuyển phòng

**Files:**
- Create: `src/modules/leasing/ui/contracts/room-change-dialog.tsx`
- Modify: `src/modules/leasing/ui/contracts/contract-row-actions.tsx`, `src/modules/leasing/ui/contracts/addendum-shell.tsx`, `src/modules/leasing/ui.ts`
- Delete: `src/modules/leasing/ui/contracts/transfer-wizard.tsx` và `createTransfer`/action tương ứng nếu không còn nơi gọi (tìm bằng `grep -rn "createTransfer"`; giữ nguyên mã đọc phụ lục `transfer` cũ ở `invoices/service.ts`, `charges/service.ts`, `restore.ts`)
- Test: `tests/integration/addenda.test.ts` (bỏ test tạo phụ lục `transfer` nếu hàm bị xoá)

**Interfaces:**
- Consumes: `createRoomChangeAction`, `cancelRoomChangeAction` (Task 9).

- [ ] **Step 1:** Dựng `room-change-dialog.tsx` bằng `FormDialog`, lấy dữ liệu và bố cục theo cách `transfer-wizard.tsx` và `termination-wizard.tsx` đang làm: phòng mới (cùng cơ sở), ngày chuyển, điều khoản mới (mặc định sao chép từ hợp đồng cũ), chỉ số cuối phòng cũ và đầu phòng mới, kiểm kê check-out, hoàn tiền phòng, phạt hoặc mất cọc; bảng xem trước hiện các dòng thanh lý và `T`. Hoá đơn thanh lý nháp của chế độ chuyển phòng có nút "Huỷ chuyển phòng".
- [ ] **Step 2:** Thay lối vào "Chuyển phòng" cũ ở `contract-row-actions.tsx` và `addendum-shell.tsx` bằng popup mới; xoá mã không còn dùng.
- [ ] **Step 3:** `npm run typecheck && npm run lint`; kiểm tay: bấm từ danh sách ra popup, tạo, thấy hai hợp đồng và hoá đơn thanh lý nháp.
- [ ] **Step 4:** Commit `feat: popup chuyển phòng thay phụ lục chuyển phòng`.

### Task 11: Tài liệu kiến trúc

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1:** Thêm vào quy tắc nghiệp vụ: ví khách (theo người thuê chính, theo cơ sở, nguồn duy nhất là thu vượt), sổ quỹ chỉ tính tiền thật, chuyển phòng hai bước, ngày kết thúc và bắt đầu hai hợp đồng, bẫy: `unapproveInvoice` không mở lại hợp đồng.
- [ ] **Step 2:** Commit `docs: ví khách và chuyển phòng hai bước trong kiến trúc`.
