# Sửa lỗi PR #60 (chuyển phòng, ví khách) — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa các lỗi tiền, lệch thiết kế và dọn code của PR #60 theo bảng quyết định, để ví khách và chuyển phòng không làm mất, đếm trùng hoặc đòi trùng tiền.

**Architecture:** Mọi thay đổi nằm trong module `leasing` (tầng 4); sổ quỹ (`cashbook`, tầng 5) chỉ đọc ví qua `@/modules/leasing` và gọi action của leasing. Ví thành một sổ theo khách (không theo cơ sở) với 6 loại biến động có quy tắc sổ quỹ cố định. Gỡ phiếu thu, xoá/khôi phục hợp đồng, huỷ chuyển phòng dùng chung một hàm "chuyển phiếu vào ví".

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle + Postgres, zod, Vitest + PGlite, shadcn/ui.

**Spec:** `docs/superpowers/plans/2026-11-28-sua-loi-pr60-chuyen-phong-vi.md` (bảng quyết định + chi tiết từng mục). Spec gốc của PR: `docs/superpowers/specs/2026-11-27-chuyen-phong-hai-buoc-design.md`.

Làm trên nhánh của PR #60 (`claude/superpowers-brainstorming-eb33f4`) hoặc nhánh tách từ nó. Các mục bảng còn ghi "Đề xuất" (A2, A4, B1, B3–B7, C1–C5) được làm theo đề xuất; chủ dự án đổi ý mục nào thì bỏ task tương ứng.

## Global Constraints

- Chuỗi giao diện, comment, commit viết tiếng Việt; commit theo Conventional Commits (`feat:` `fix:` `refactor:` `test:` `docs:`).
- Service nhận `(db, ctx, input)`, input `unknown` parse bằng zod trong service; kiểm quyền bằng `assertCan`/`can` (`src/domain/access.ts`). Server action bọc bằng `toActionResult` rồi `revalidatePath`.
- Module chỉ import module tầng thấp hơn qua cổng công khai (`index.ts`, `actions.ts`, `ui.ts`). `leasing` không ghi bảng `expenses` của `cashbook`. `tenants` không import `leasing`.
- Migration: sửa `src/db/schema/`, rồi `npm run db:generate`; không sửa tay file trong `drizzle/`.
- Hằng số, nhãn: mỗi khái niệm một nguồn. Nhãn loại ví ở `src/modules/leasing/domain/labels.ts`; nhãn phương thức thu ở `src/domain/payment-labels.ts`.
- Giao diện theo `docs/front-end-design.md`.
- **Quy ước repo về test:** viết, sửa test ở mỗi task nhưng **không chạy test sau từng task**; chạy toàn bộ một lần ở Task 15 (chuẩn bị PR). Mỗi task chỉ chạy `npm run typecheck`.
- Số tiền là VND nguyên; làm tròn bằng `Math.round` như code hiện có.

## Review Focus

1. Hai lần thu cùng lúc cho cùng một khách ở hai cơ sở khác nhau (ví chung sau D1) không được dùng quá số dư ví → test ở Task 1.
2. Gỡ phiếu chọn "trả lại khách" cho phiếu từng gạch "Tiền cọc còn thiếu": dòng cọc về chờ thu, ví không đổi, sổ quỹ giữ thu ngày gốc và thêm chi → test ở Task 10.
3. Huỷ chuyển phòng khi hợp đồng mới được trả một phần bằng ví, một phần tiền mặt: phần ví trả lại ví, phần tiền mặt thành `reallocate`, ví không bị tính hai lần → test ở Task 12.
4. Bỏ duyệt rồi duyệt lại hoá đơn thanh lý thường: khoản "Gộp vào thanh lý" không ghi trùng, nợ cũ đúng số → test ở Task 4.
5. Hoá đơn đầu đã đẩy dư vào ví (`carry_surplus`), ví đã được dùng, rồi bỏ duyệt hoá đơn đó: bị từ chối, ví không âm → test ở Task 13.

---

## Quy ước dùng chung (các task tham chiếu)

**Loại ví** (`WalletEntryKind`, `src/domain/statuses.ts`):

| Loại | Dấu | Sổ quỹ | Nhãn |
|---|---|---|---|
| `overpay` | + | thu | Thu dư vào ví |
| `reallocate` | + | thu, ngày thu gốc | Chuyển phiếu thu vào ví |
| `refund_out` | − | chi | Trả lại khách |
| `carry_surplus` | + | không tính | Dư chuyển phòng |
| `use_invoice` | − | không tính | Dùng ví trả hoá đơn |
| `use_termination` | − | không tính | Ví gạch vào thanh lý |

**Phương thức khoản thu:** `cash`, `transfer`, `other` tính sổ quỹ; `wallet` ("Trừ ví"), `carry` ("Gộp vào thanh lý") không tính.

---

### Task 1: Ví theo khách (D1)

**Files:**
- Modify: `src/db/schema/wallet.ts` (index), `src/modules/leasing/server/wallet/service.ts`, `src/modules/leasing/server/invoices/service.ts` (`recordLeasePayment`, `leaseWalletBalance`), `src/modules/leasing/server/addenda/service.ts` (`createTermination`), `src/modules/leasing/server/addenda/finalize.ts` (`settleWalletAndTransfer`)
- Create: migration bằng `npm run db:generate`
- Test: `tests/integration/wallet.test.ts`, `tests/integration/lease-payment.test.ts`

**Interfaces:**
- Produces: `walletBalance(db: DB, tenantId: string): Promise<number>`; `listWalletEntries(db: DB, ctx: AccessContext, tenantId: string)` trả dòng ví mới nhất trước, kiểm quyền: `can(ctx, 'billing', tenant.homeFacilityId)` hoặc `billing` ở cơ sở của bất kỳ hợp đồng nào của khách, không có thì `ForbiddenError`. `facilityId` của dòng ví vẫn bắt buộc khi ghi (nghĩa: cơ sở phát sinh).

- [ ] **Step 1: Sửa test** trong `wallet.test.ts`: bỏ test "ví của cơ sở A không hiện ở cơ sở B"; thay bằng

```ts
it('ví nạp ở cơ sở A dùng được ở cơ sở B: số dư theo khách', async () => {
  await addWalletEntry(db, entry({ facilityId: fA, amount: 1_000_000 }))
  await addWalletEntry(db, entry({ facilityId: fB, amount: -500_000, kind: 'use_invoice' }))
  expect(await walletBalance(db, tenantId)).toBe(4_500_000) // 4.000.000 từ hai test trước + 1.000.000 − 500.000
})
```

và đổi mọi `walletBalance(db, tenantId, fA)` thành `walletBalance(db, tenantId)`.
- [ ] **Step 2: Thêm test** `lease-payment.test.ts`: `'dùng ví nạp ở cơ sở khác'`: hợp đồng ở cơ sở B của cùng khách, ví +3.000.000 ghi ở cơ sở A, thu `walletAmount: 3_000_000` cho hoá đơn 9.000.000 ở B → khoản thu `wallet` 3.000.000, ví 0. Thêm test Review Focus 1: hai `recordLeasePayment` chạy `Promise.allSettled` (hợp đồng ở A và B, mỗi lần `walletAmount: 3_000_000`, ví 3.000.000) → đúng một lần thành công, ví 0 (khoá hàng `tenants` đã có).
- [ ] **Step 3: Sửa `walletBalance`** bỏ tham số cơ sở; sửa mọi chỗ gọi (4 file ở mục Files) và `reverseWalletForPayments` (gom theo `tenantId`). Đổi index thành `index('tenant_wallet_entries_tenant_idx').on(t.tenantId)`; chạy `npm run db:generate`.
- [ ] **Step 4:** `npm run typecheck` → không lỗi.
- [ ] **Step 5: Commit** `refactor: ví khách dùng chung mọi cơ sở`

### Task 2: Loại ví, nhãn, sổ quỹ đọc ví (quy ước chung, B7, C2, C3)

**Files:**
- Modify: `src/domain/statuses.ts`, `src/modules/leasing/domain/labels.ts`, `src/domain/payment-labels.ts`, `src/modules/leasing/server/wallet/service.ts`, `src/modules/leasing/index.ts`, `src/modules/cashbook/server/cashbook/service.ts`, `src/modules/cashbook/ui/cashbook-list.tsx` (dùng nhãn hiển thị)
- Test: `tests/integration/cashbook.test.ts`, `tests/integration/wallet.test.ts`, `tests/unit/architecture/constants.test.ts`

**Interfaces:**
- Produces:
  - `WalletEntryKind = 'overpay' | 'reallocate' | 'refund_out' | 'carry_surplus' | 'use_invoice' | 'use_termination'`
  - `WALLET_ENTRY_LABELS: Record<WalletEntryKind, string>` (nhãn ở bảng quy ước)
  - `PAYMENT_METHOD_DISPLAY_LABELS = { ...PAYMENT_METHOD_LABELS, wallet: 'Trừ ví', carry: 'Gộp vào thanh lý' }`; `PAYMENT_METHOD_OPTIONS` giữ ba lựa chọn
  - `listWalletCashEntries(db: DB, filter: { facilityIds: string[] | 'all'; month?: string }): Promise<WalletRow[]>` trả dòng loại `overpay`, `reallocate`, `refund_out`, lọc trong `where`; thay `listOverpayEntries` (xoá hàm cũ)
  - `addWalletEntry` trả `true` chỉ khi thật sự chèn (`insert ... onConflictDoNothing().returning()`)

- [ ] **Step 1: Test** `cashbook.test.ts` `'sổ quỹ đọc đúng các loại ví'`: chèn thẳng `overpay` +3.000.000 (01/09), `reallocate` +9.000.000 (02/09), `refund_out` −9.000.000 (05/09), `carry_surplus` +5.900.000, `use_invoice` −1.000.000 → `summarize(rows)` = `{ income: 12_000_000, expense: 9_000_000, net: 3_000_000 }`; dòng `refund_out` có `direction: 'out'`, `amount: 9_000_000`, nhãn "Trả lại khách".
- [ ] **Step 2: Test** `wallet.test.ts` `'addWalletEntry trả false khi trùng, kể cả chạy song song'`: hai lệnh cùng `sourceKey` qua `Promise.all` → kết quả `[true, false]` theo thứ tự bất kỳ, chỉ một dòng.
- [ ] **Step 3: Test** `constants.test.ts`: `PAYMENT_METHOD_OPTIONS.map((o) => o.value)` = `['cash', 'transfer', 'other']`; `PAYMENT_METHOD_DISPLAY_LABELS.wallet` = `'Trừ ví'`.
- [ ] **Step 4: Cài đặt** theo Interfaces. Trong `listCashbook`, dòng `refund_out` lấy `direction: 'out'`, `amount: -entry.amount`, nhãn từ `WALLET_ENTRY_LABELS`; `overpay`, `reallocate` là `in`.
- [ ] **Step 5:** `npm run typecheck`.
- [ ] **Step 6: Commit** `feat: thêm loại biến động ví và sổ quỹ đọc thu, chi qua ví`

### Task 3: Thanh lý tính đến hết hôm trước ngày trả (A5)

**Files:**
- Modify: `src/modules/leasing/domain/liquidation.ts`, `src/modules/leasing/server/addenda/service.ts` (bỏ `billedUntil` khi gọi)
- Test: `tests/unit/domain/billing.test.ts`, `tests/integration/addenda.test.ts`, `tests/integration/contract-restore.test.ts`, `tests/integration/contract-history.test.ts`, `tests/integration/room-change.test.ts`

**Interfaces:**
- Produces: `TerminationInput` không còn `billedUntil`. `buildTerminationInvoice` tính tiền phòng, phí cố định, tiền phòng còn thiếu đến `addDays(endDate, -1)` và hoàn từ `endDate`; chỉ số đồng hồ vẫn theo `endDate`.

- [ ] **Step 1: Test** `billing.test.ts` `'thanh lý thường hoàn từ chính ngày trả'`: tiền phòng 12.000.000, hoá đơn 01/2027 đã duyệt, `endDate: '2027-01-16'`, `proration: 'actual_days'` → dòng hoàn `−6_193_548`, mô tả chứa `16/01–31/01`. `'thanh lý ngày 1 của tháng chưa có hoá đơn'`: `endDate: '2027-02-01'`, hoá đơn đến 31/01 → không có dòng tiền phòng còn thiếu, không có dòng hoàn.
- [ ] **Step 2: Sửa test cũ** trong các file ở mục Test có số hoàn hoặc tiền thiếu tính theo quy ước cũ (hoàn từ hôm sau): tính lại theo quy ước mới, ví dụ thanh lý 20/11 với hoá đơn 11/2026 9.000.000 → hoàn 20–30/11 = `−3_300_000`.
- [ ] **Step 3: Cài đặt:** trong `buildTerminationInvoice` dùng `const billedTo = addDays(input.endDate, -1)` cho mọi phép tính tiền theo ngày; xoá field `billedUntil` và nhánh `opts.transfer ? addDays(...) : undefined` ở `createTermination`.
- [ ] **Step 4:** `npm run typecheck`.
- [ ] **Step 5: Commit** `fix: thanh lý tính tiền đến hết ngày trước ngày trả phòng`

### Task 4: Đóng nợ cũ ở mọi thanh lý, khoá dòng "Nợ cũ" (A2, B5, C1)

**Files:**
- Modify: `src/modules/leasing/domain/liquidation.ts`, `src/modules/leasing/server/addenda/finalize.ts`, `src/modules/leasing/server/invoices/service.ts` (`unapproveInvoice`, `updateLines`)
- Create: `src/modules/leasing/domain/transfer-line.ts`
- Test: `tests/integration/addenda.test.ts`, `tests/unit/domain/transfer-line.test.ts`

**Interfaces:**
- Produces:
  - dòng "Nợ cũ chưa thanh toán" có `meta: { unpaid: true }`
  - `rebalanceTransferLine<T extends { amount: number; unitPrice: number; quantity: number; meta: unknown }>(lines: T[]): T[]` (domain thuần): dòng `meta.transfer === true` = −(tổng các dòng khác); tổng khác bằng 0 thì bỏ dòng chuyển
  - `settleOldInvoices(tx: DB, ctx: AccessContext, terminationInvoiceId: string): Promise<void>` trong `finalize.ts`: tính nợ thật của hoá đơn tháng đã duyệt (trừ `termination`), sửa dòng `unpaid` theo số đó (0 thì xoá dòng), rồi ghi khoản `carry` cho từng hoá đơn còn nợ với `note: 'Gộp vào thanh lý <mã hoá đơn thanh lý>'`. Chạy lại không ghi trùng (bỏ qua hoá đơn đã hết nợ).
  - `finalizeTermination` gọi theo thứ tự: `settleOldInvoices` → `rebalanceTransferLine` (ghi lại dòng chuyển) → trừ ví → điều chỉnh chờ sang hợp đồng mới → sổ cọc.

- [ ] **Step 1: Test unit** `transfer-line.test.ts`: dòng `[9_000_000, −3_300_000, transfer 0]` → dòng chuyển `−5_700_000`; `[3_300_000, −3_300_000, transfer 100]` → không còn dòng chuyển.
- [ ] **Step 2: Test** `addenda.test.ts`:
  - `'duyệt thanh lý thường đóng nợ cũ bằng khoản gộp'`: hoá đơn 11/2026 9.000.000 chưa thu, thanh lý 20/11, duyệt → khoản `carry` 9.000.000 ở hoá đơn tháng 11; `leaseDebt` bằng đúng tổng các dòng của hoá đơn thanh lý (hoá đơn tháng 11 không còn nợ).
  - `'khoản thu nhập trễ giữa lập nháp và duyệt'`: lập nháp, thu 9.000.000 cho hoá đơn tháng 11, duyệt → không còn dòng `unpaid`, không có `carry`, tổng thanh lý giảm đúng 9.000.000.
  - Review Focus 4 `'bỏ duyệt rồi duyệt lại không ghi trùng khoản gộp'`: duyệt, bỏ duyệt (khoản `carry` mất, nợ tháng 11 về 9.000.000), duyệt lại → đúng một khoản `carry` 9.000.000.
  - `'dòng Nợ cũ không sửa, không xoá được'`: `updateLines` đổi số lượng dòng `unpaid` thành 2 → số lượng vẫn 1; gửi thiếu dòng đó → `ValidationError`.
- [ ] **Step 3: Cài đặt** theo Interfaces. `unapproveInvoice` với hoá đơn `termination` không có dòng ví, chuyển: xoá các `payments` `method = 'carry'` có `note` chứa mã hoá đơn đó, trong cùng giao dịch. `updateLines`: khoá dòng `meta.unpaid` ở mọi hoá đơn `termination` (giữ mô tả, đơn giá, số lượng; thiếu thì báo lỗi). Thay hai đoạn tự cân bằng dòng chuyển (trong `updateLines` và `settleWalletAndTransfer`) bằng `rebalanceTransferLine`.
- [ ] **Step 4:** `npm run typecheck`.
- [ ] **Step 5: Commit** `fix: đóng nợ cũ ở mọi hoá đơn thanh lý theo số nợ lúc duyệt`

### Task 5: Chặn chuyển phòng khi hợp đồng cũ còn nợ (A1, C5)

**Files:**
- Modify: `src/modules/leasing/server/addenda/room-change.ts`, `src/modules/leasing/server/addenda/finalize.ts`, `src/modules/leasing/server/addenda/actions.ts`, `src/modules/leasing/actions.ts`, `src/modules/leasing/ui/contracts/room-change-dialog.tsx`
- Test: `tests/integration/room-change.test.ts`

**Interfaces:**
- Produces:
  - `roomChangeBlockers(db: DB, ctx: AccessContext, leaseId: string): Promise<{ drafts: { code: string; period: string }[]; unpaid: { code: string; period: string; owed: number }[] }>` (period dạng `MM/YYYY`)
  - `roomChangeBlockerAction(leaseId: string)` (cổng `actions.ts`)
  - Thông báo, dùng nguyên văn: nháp → `Hoá đơn tháng ${period} còn nháp: duyệt và thu, hoặc xoá, rồi chuyển phòng`; nợ → `Còn nợ ${tổng.toLocaleString('vi-VN')} ở hoá đơn tháng ${periods.join(', ')}: thu xong rồi chuyển phòng`

- [ ] **Step 1: Sửa test** nhóm "chuyển phòng hai bước": dữ liệu đầu thu đủ hoá đơn 11/2026 (9.000.000) trước `createRoomChange`. Sửa các số T theo dữ liệu mới (không còn +9.000.000 nợ cũ).
- [ ] **Step 2: Thêm test:** còn nợ 9.000.000 → `createRoomChange` ném lỗi chứa `Còn nợ 9.000.000 ở hoá đơn tháng 11/2026`, hợp đồng cũ `active`, chỉ có một hợp đồng; có hoá đơn nháp → lỗi chứa `còn nháp`; `'duyệt thanh lý chuyển phòng bị từ chối khi hợp đồng cũ lại phát sinh nợ'`: sau khi chuyển, chèn thẳng một hoá đơn tháng đã duyệt 1.000.000 cho hợp đồng cũ → `approveInvoice` hoá đơn thanh lý ném `ValidationError`.
- [ ] **Step 3: Cài đặt:** gọi `roomChangeBlockers` đầu giao dịch `createRoomChange` (sau khi khoá hợp đồng); kiểm lại trong `finalizeTermination` khi hoá đơn có dòng chuyển. Chuyển `if (!term.invoice)` lên ngay sau `createTermination` (C5). Popup gọi action khi mở, hiện cảnh báo đầu popup và đưa thông báo vào `extraError` để khoá nút xác nhận.
- [ ] **Step 4:** `npm run typecheck`.
- [ ] **Step 5: Commit** `fix: chuyển phòng yêu cầu hợp đồng cũ hết nợ và không còn hoá đơn nháp`

### Task 6: Đồng hồ phòng mới khi chuyển phòng (B3, C4)

**Files:**
- Modify: `src/modules/leasing/server/addenda/room-change.ts` (`roomChangeSchema`, `copyFees`), `src/modules/leasing/server/contracts/actions.ts` (bỏ `facilityMeters` khỏi `quickContractDataAction`), `src/modules/leasing/server/addenda/actions.ts`, `src/modules/leasing/actions.ts`, `src/modules/leasing/ui/contracts/room-change-dialog.tsx`
- Test: `tests/integration/room-change.test.ts`

**Interfaces:**
- Produces:
  - input `newRoomReadings: { leaseFeeId: string; meterId: string; value: number }[]` (`leaseFeeId` là phí của hợp đồng cũ)
  - `roomChangeMetersAction(leaseId: string, newRoomId: string)` trả `{ id, utility: 'electric' | 'water' | 'fee', label, busy }[]` của phòng mới, chỉ đồng hồ `removedOn` rỗng; `busy` chỉ xét hợp đồng `active` cùng cơ sở

- [ ] **Step 1: Sửa test** dùng `newRoomReadings` dạng mới. **Thêm test:** hai phí điện trỏ cùng `meterId` → lỗi chứa tên phí thứ hai; `meterId` không thuộc phòng mới → lỗi; đồng hồ đã tháo (`removedOn` có ngày) → lỗi.
- [ ] **Step 2: Cài đặt** `copyFees` ánh xạ theo `leaseFeeId` → `meterId` của input; kiểm thuộc phòng mới, chưa tháo, không trùng. Import tĩnh `rooms` thay `await import('@/db')`. Popup tải đồng hồ bằng `roomChangeMetersAction` khi chọn phòng mới.
- [ ] **Step 3:** `npm run typecheck`.
- [ ] **Step 4: Commit** `fix: chuyển phòng gắn phí vào đúng đồng hồ người dùng chọn`

### Task 7: Huỷ chuyển phòng kiểm quyền trong giao dịch (B4)

**Files:**
- Modify: `src/modules/leasing/server/addenda/room-change.ts` (`cancelRoomChange`), `src/modules/leasing/server/contracts/restore.ts` (`roomChangeNeedsAdmin` nhận `tx`)
- Test: `tests/integration/room-change.test.ts`

**Interfaces:**
- Produces: `cancelRoomChange(db, ctx, oldLeaseId, storage)` giữ chữ ký; bên trong mở giao dịch trước, khoá `leases` của hai hợp đồng (`for update`, theo id tăng dần), rồi mới đọc và kiểm quyền.

- [ ] **Step 1: Test** `'huỷ chuyển phòng: người không phải admin bị từ chối khi hoá đơn thanh lý vừa được duyệt'`: duyệt hoá đơn thanh lý rồi gọi `cancelRoomChange` với ctx không admin → `ValidationError`, hợp đồng mới còn.
- [ ] **Step 2: Cài đặt** theo Interfaces.
- [ ] **Step 3:** `npm run typecheck`.
- [ ] **Step 4: Commit** `fix: huỷ chuyển phòng kiểm quyền dưới khoá`

### Task 8: Thu vượt luôn gắn một phiếu thu (B1)

**Files:**
- Modify: `src/modules/leasing/server/invoices/service.ts` (`recordLeasePayment`)
- Test: `tests/integration/lease-payment.test.ts`

**Interfaces:**
- Produces: `overpay` gắn `paymentId` của phiếu tiền mặt **cuối cùng** trong lần thu, `sourceKey = overpay:<paymentId đó>`. Không còn `crypto.randomUUID()`.

- [ ] **Step 1: Test:** ví 5.000.000, nợ 3.000.000, `walletAmount: 3_000_000, amount: 2_000_000` → lỗi `Ví đã đủ trả nợ: bỏ phần tiền mặt hoặc giảm số dùng ví`, ví vẫn 5.000.000. Hai hoá đơn 9.000.000, thu 20.000.000 → dòng `overpay` 2.000.000 gắn phiếu của hoá đơn tháng 8.
- [ ] **Step 2: Cài đặt:** kiểm `walletUse >= debt && amount > 0` trước khi ghi.
- [ ] **Step 3:** `npm run typecheck`.
- [ ] **Step 4: Commit** `fix: tiền thu dư luôn gắn với phiếu thu cuối của lần thu`

### Task 9: Hàm chuyển phiếu thu vào ví (lõi của B2, A3)

**Files:**
- Modify: `src/modules/leasing/server/wallet/service.ts`
- Test: `tests/integration/wallet.test.ts`

**Interfaces:**
- Produces:
  - `type PaymentRemoval = { kind: 'to_wallet' } | { kind: 'refund'; refundOn: string } | { kind: 'mistake' }`
  - `settleRemovedPayments(tx: DB, ctx: AccessContext, paymentIds: string[], removal: PaymentRemoval, note: string): Promise<void>`. Chạy **trước** khi xoá phiếu. Với từng phiếu:
    - `method = 'wallet'`: xoá biến động `use_invoice` gắn phiếu (trả lại ví), mọi `removal`
    - `method = 'carry'`: ném `ValidationError('Khoản gộp vào thanh lý không gỡ tay được')`
    - tiền thật + `to_wallet`: ghi `reallocate` +amount, `date = paidOn`, `facilityId` của hoá đơn, `sourceKey = reallocate:<paymentId>`; giữ `overpay` của phiếu, đặt `paymentId` của `overpay` về null
    - tiền thật + `refund`: như `to_wallet`, rồi ghi `refund_out` −amount, `date = refundOn`, `sourceKey = refund_out:<paymentId>`
    - tiền thật + `mistake`: xoá `overpay` gắn phiếu, từ chối nếu ví sẽ âm (`Tiền dư của khoản thu này đã được dùng: gỡ các khoản dùng ví trước`)
  - Thay `reverseWalletForPayments` bằng hàm này ở mọi chỗ gọi (Task 10–12); xoá `reverseWalletForPayments` khi hết chỗ dùng.

- [ ] **Step 1: Test** trong `wallet.test.ts`, mỗi `kind` một test với phiếu tiền mặt 9.000.000 có `overpay` 2.000.000: `to_wallet` → ví +9.000.000 (tổng 11.000.000), `overpay` còn; `refund` → ví 2.000.000, có `reallocate` +9.000.000 và `refund_out` −9.000.000; `mistake` → ví 0; `mistake` khi ví đã dùng 2.000.000 → lỗi; phiếu `carry` → lỗi.
- [ ] **Step 2: Cài đặt** theo Interfaces.
- [ ] **Step 3:** `npm run typecheck`.
- [ ] **Step 4: Commit** `feat: gỡ phiếu thu chuyển tiền vào ví, trả lại khách hoặc xoá do nhập nhầm`

### Task 10: Gỡ phiếu thu ba lựa chọn (B2)

**Files:**
- Modify: `src/modules/leasing/server/invoices/service.ts` (`removePayment`), `src/modules/leasing/server/invoices/actions.ts`, `src/modules/cashbook/server/cashbook/actions.ts` (`deletePaymentAction`), `src/modules/cashbook/ui/cashbook-list.tsx`
- Test: `tests/integration/lease-payment.test.ts`

**Interfaces:**
- Consumes: `settleRemovedPayments`, `PaymentRemoval` (Task 9)
- Produces: `removePayment(db: DB, ctx: AccessContext, paymentId: string, removal: unknown): Promise<void>` (parse zod thành `PaymentRemoval`, mặc định `{ kind: 'to_wallet' }`). `mistake` chỉ khi `ctx.isAdmin` hoặc (`payment.receivedBy === ctx.userId` và ngày tạo phiếu theo giờ VN bằng `todayVN()`), ngược lại `ForbiddenError`. `deletePaymentAction(id: string, removal: PaymentRemoval)`.

- [ ] **Step 1: Test** (dữ liệu sẵn của file: hoá đơn 7, 8 mỗi tháng 9.000.000; thu 20.000.000):
  - `to_wallet` phiếu tháng 7 → ví 11.000.000; `listCashbook` thu 20.000.000; `leaseDebt` 9.000.000; thu lại `walletAmount: 9_000_000` → ví 2.000.000, sổ quỹ vẫn 20.000.000
  - `refund` phiếu tháng 7 (`refundOn: '2026-08-20'`) → ví 2.000.000; sổ quỹ thu 20.000.000, chi 9.000.000
  - `mistake` phiếu tháng 7 → ví 2.000.000, sổ quỹ thu 11.000.000; `mistake` phiếu tháng 8 → ví 0, sổ quỹ thu 9.000.000
  - người khác (không admin, không lập phiếu) chọn `mistake` → `ForbiddenError`
  - Review Focus 2: hoá đơn có "Tiền cọc còn thiếu" 6.000.000 + tiền phòng 9.000.000, thu 15.000.000, gỡ `refund` → dòng cọc về `pending`, ví 0, sổ quỹ thu 15.000.000, chi 15.000.000
- [ ] **Step 2: Cài đặt** `removePayment` gọi `settleRemovedPayments` rồi xoá phiếu, rồi `syncDepositWithInvoice`. Popup xoá phiếu ở sổ quỹ: ba lựa chọn (mặc định "Chuyển vào ví"), ô ngày trả khi chọn "Trả lại khách" (mặc định hôm nay), dòng "Số dư ví sau khi gỡ: X"; với phiếu từng gạch cọc, hiện "Phần cọc của phiếu này về chờ thu".
- [ ] **Step 3:** `npm run typecheck`.
- [ ] **Step 4: Commit** `feat: gỡ phiếu thu hỏi chuyển vào ví, trả lại khách hay nhập nhầm`

### Task 11: Xoá và khôi phục hợp đồng giữ tiền đã thu (B2, đường hàng loạt)

**Files:**
- Modify: `src/modules/leasing/server/contracts/lifecycle.ts` (`deleteContract`), `src/modules/leasing/server/contracts/restore.ts` (`restoreContract`, `previewContractRestore`), `src/modules/leasing/server/contracts/actions.ts`, `src/modules/leasing/ui/contracts/contract-edit-actions.tsx`
- Test: `tests/integration/contract-edit-delete.test.ts`, `tests/integration/contract-restore.test.ts`

**Interfaces:**
- Consumes: `settleRemovedPayments` (Task 9)
- Produces: `deleteContract(db, ctx, kind, id, confirmed, storage, paymentRemoval: 'to_wallet' | 'mistake' = 'mistake')`; `deleteContractAction(kind, id, confirmed, paymentRemoval?)`. `restoreContract` luôn dùng `to_wallet`; `previewContractRestore` thêm item `{ type: 'wallet', label: 'Chuyển vào ví khách: X' }` khi có phiếu tiền thật bị gỡ.

- [ ] **Step 1: Test:** xoá hợp đồng có phiếu tiền mặt 9.000.000 với `'to_wallet'` → ví 9.000.000, sổ quỹ vẫn thu 9.000.000; mặc định (`'mistake'`) → ví 0, sổ quỹ 0. Khôi phục một lần sửa hợp đồng làm gỡ phiếu 9.000.000 → ví 9.000.000, preview có dòng `Chuyển vào ví khách: 9.000.000`.
- [ ] **Step 2: Cài đặt.** Popup xoá hợp đồng: khi hợp đồng có khoản thu tiền thật, hỏi "Chuyển tiền đã thu vào ví khách" hay "Nhập nhầm, xoá luôn" (mặc định nhập nhầm).
- [ ] **Step 3:** `npm run typecheck`.
- [ ] **Step 4: Commit** `fix: xoá, khôi phục hợp đồng không làm mất tiền đã thu`

### Task 12: Huỷ chuyển phòng chuyển tiền đã thu vào ví (A3)

**Files:**
- Modify: `src/modules/leasing/server/addenda/room-change.ts` (`cancelRoomChange`, `undoApprovedTransfer`), `src/modules/leasing/server/contracts/restore.ts` (`roomChangeNeedsAdmin`, preview)
- Test: `tests/integration/room-change.test.ts`

**Interfaces:**
- Consumes: `deleteContract(..., 'to_wallet')` (Task 11), `settleRemovedPayments` (Task 9)
- Produces: `undoApprovedTransfer` xoá `use_termination` của hợp đồng cũ, các khoản `carry` ghi bởi hoá đơn thanh lý đó, và `carry_surplus` của hợp đồng mới. Huỷ khi hợp đồng mới đã thu tiền **không bị chặn**; quyền như cũ: thanh lý còn nháp và hợp đồng mới chưa có hoá đơn duyệt, khoản thu → ai có `tenants_contracts` + `delete_contracts`; còn lại chỉ admin.

- [ ] **Step 1: Test** (admin): hợp đồng cũ thu đủ 11/2026, chuyển 20/11 với ví 1.000.000 (T = −13.300.000), duyệt thanh lý, hợp đồng mới hoá đơn 11/2026 = 3.100.000, thu đủ tiền mặt, huỷ → ví 4.100.000 (`reallocate` 3.100.000 + trả `use_termination` 1.000.000), cọc hợp đồng cũ 9.000.000, `leaseDebt` hợp đồng cũ 0, tổng thu sổ quỹ không đổi so với trước khi huỷ.
- [ ] **Step 2: Test** Review Focus 3: cùng dữ liệu; sau khi duyệt thanh lý (ví 0), chèn thẳng `overpay` +1.000.000; hoá đơn đầu 3.100.000 trả `walletAmount: 1_000_000` + tiền mặt 2.100.000 (ví 0) → huỷ → ví 4.100.000 = 1.000.000 (`use_invoice` được trả) + 2.100.000 (`reallocate`) + 1.000.000 (`use_termination` được trả); còn đúng một dòng `overpay` và một dòng `reallocate` 2.100.000.
- [ ] **Step 3: Cài đặt:** `cancelRoomChange` gọi `deleteContract(tx, ctx, 'lease', next.id, true, storage, 'to_wallet')` với ghi chú `Huỷ chuyển phòng <mã hợp đồng mới>`. Sửa câu trong `previewContractRestore` cho khớp.
- [ ] **Step 4:** `npm run typecheck`.
- [ ] **Step 5: Commit** `fix: huỷ chuyển phòng chuyển tiền đã thu ở hợp đồng mới vào ví khách`

### Task 13: Số dư chuyển phòng vượt hoá đơn đầu vào ví (A4)

**Files:**
- Modify: `src/modules/leasing/server/invoices/service.ts` (`approveInvoice`, `unapproveInvoice`, chỗ xoá hoá đơn)
- Test: `tests/integration/room-change.test.ts`

**Interfaces:**
- Produces: khi duyệt hoá đơn có dòng `meta.sourceKey` bắt đầu bằng `transfer:` và tổng < 0: thêm dòng `{ type: 'adjustment', description: 'Số dư chuyển vào ví', quantity: 1, unitPrice: X, amount: X, meta: { surplus: true } }` (X = −tổng) và ghi `carry_surplus` +X, `sourceKey = carry_surplus:<invoiceId>`. Bỏ duyệt, xoá hoá đơn: xoá dòng và biến động; ví sẽ âm thì `ValidationError('Số dư chuyển vào ví đã được dùng: gỡ các khoản dùng ví trước')`. Hoá đơn nháp hiện ghi chú "Khi duyệt, X vào ví khách" (`invoice-editor.tsx`).

- [ ] **Step 1: Test:** như Task 12 nhưng cọc phòng mới 3.000.000 → hoá đơn đầu nháp tổng `−5_900_000`; duyệt → tổng 0, ví +5.900.000; huỷ chuyển phòng → biến động `carry_surplus` mất.
- [ ] **Step 2: Test** Review Focus 5: sau khi duyệt, dùng ví 5.900.000 trả hoá đơn tháng 12, rồi bỏ duyệt hoá đơn đầu → `ValidationError`, ví 0.
- [ ] **Step 3: Cài đặt** theo Interfaces.
- [ ] **Step 4:** `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: số dư chuyển phòng vượt hoá đơn đầu chuyển vào ví khách`

### Task 14: Giao diện ví khách (D2)

**Files:**
- Create: `src/modules/leasing/ui/wallet/wallet-panel.tsx`
- Modify: `src/modules/leasing/ui.ts`, `src/modules/leasing/index.ts` (xuất `listWalletEntries`), `src/app/(app)/tenants/[id]/page.tsx`, `src/app/(app)/tenants/tenant-detail.tsx`, `src/app/(app)/contracts/contract-detail.tsx`

**Interfaces:**
- Consumes: `listWalletEntries` (Task 1), `WALLET_ENTRY_LABELS`, `PAYMENT_METHOD_DISPLAY_LABELS` (Task 2)
- Produces: `WalletPanel({ balance: number; entries: WalletEntryView[] })` với `WalletEntryView = { id, date, kind, amount, facilityCode, invoice?: { id, code }, lease?: { id, code }, note }`. Trang chi tiết khách (route `src/app`) gọi `listWalletEntries` rồi truyền vào; không có quyền thì không hiện khối. Chi tiết hợp đồng hiện "Ví khách: X" liên kết sang trang khách. Không có nút nạp, rút.

- [ ] **Step 1: Cài đặt** theo Interfaces và `docs/front-end-design.md` (bảng, ô tiền, điện thoại).
- [ ] **Step 2:** `npm run typecheck`; mở dev server, xem trang chi tiết khách có ví và không có ví, trên desktop và kích thước điện thoại.
- [ ] **Step 3: Commit** `feat: khối ví khách ở trang chi tiết khách và hợp đồng`

### Task 15: Test vòng đời, tài liệu, kiểm toàn bộ

**Files:**
- Modify: `tests/integration/customer-lifecycle.test.ts`, `docs/superpowers/specs/2026-11-27-chuyen-phong-hai-buoc-design.md`, `docs/superpowers/plans/2026-11-27-chuyen-phong-hai-buoc.md`, `docs/architecture.md`, bảng trạng thái trong `docs/superpowers/plans/2026-11-28-sua-loi-pr60-chuyen-phong-vi.md`

- [ ] **Step 1: Sửa** `customer-lifecycle.test.ts` theo mục "Số liệu vòng đời khách mới" của spec sửa lỗi: thêm thu 9.000.000 ngày 15/11 (và bước từ chối chuyển phòng lúc còn nợ ngay trước đó); T `−13_300_000`, dòng chuyển `+13_300_000`, không có `carry`; hoá đơn 11/2026 hợp đồng mới `3_100_000`; thanh lý hoàn `−6_193_548`, tổng `−15_693_548`, mức chặn hoàn một phần `6_193_549`; sổ quỹ `64_100_000`. Sửa chú thích đầu file. Đổi `walletBalance(db, tenantId, facilityId)` thành `walletBalance(db, tenantId)`.
- [ ] **Step 2: Sửa tài liệu** theo mục "Sửa spec, tài liệu" của spec sửa lỗi.
- [ ] **Step 3: Chạy kiểm:**
  - `npm run lint` → không lỗi
  - `npm run typecheck` → không lỗi
  - `npm run format:check` → sạch
  - `npm test` → tất cả qua. Lỗi thì dùng skill `ai-rules-handling-failures` trước khi chạy lại; chỉ chạy lại file lỗi, chạy toàn bộ một lần cuối.
- [ ] **Step 4:** Cập nhật cột Trạng thái của bảng quyết định thành `Xong` cho các mục đã làm.
- [ ] **Step 5: Commit** `test: cập nhật vòng đời khách và tài liệu theo bản sửa ví, chuyển phòng`
