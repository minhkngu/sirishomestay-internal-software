# Sổ quỹ Thu chi Implementation Plan

> **For agentic workers:** làm inline trong phiên (người dùng đã chọn). Theo CLAUDE.md: viết test nhưng **không chạy** cho tới khi chuẩn bị PR; kiểm bằng dev server.

**Goal:** Tab Thu chi gộp thu tiền thuê, cọc, chi (sửa chữa, điện nước, lương) và nhập ngay tại đó.

**Architecture:** Giữ `payments`, `deposit_entries`; thêm bảng `expenses`. Hàm thuần ở `src/domain/cashbook.ts` phân loại dòng, dịch vụ `src/server/cashbook/` gộp ba nguồn, giao diện `src/features/cashbook/`.

**Tech Stack:** Drizzle, zod, Next.js server actions, `FormDialog`, `MoneyInput`, `Select`, `Pager`.

**Spec:** `docs/superpowers/specs/2026-11-21-so-quy-thu-chi-design.md`

## Global Constraints
- Quyền `billing` theo cơ sở (`assertCan(ctx, 'billing', facilityId)`); không thêm quyền mới. Nhãn `PERMISSION_LABELS.billing` = "Hoá đơn, thu chi".
- Chuỗi giao diện, commit tiếng Việt; commit `feat:`/`fix:`; thân commit kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; tiêu đề ≤ 72 ký tự.
- Tiền: `formatVND`, `MoneyInput`. Select: `src/components/ui/select.tsx`. Một feature không import feature khác; `features` không import `db`.
- `deduct`, `forfeit`, và dòng `pending` hiện nhưng không cộng Thu/Chi.
- Giữ nguyên `recordLeasePayment`, `leaseDebt`, công thức công nợ.

## Review Focus
- Khoản cọc `pending` hay `deduct`/`forfeit` bị cộng nhầm vào Thu/Chi (Task 1, 2).
- Người chỉ có quyền ở cơ sở A thấy dòng của cơ sở B (Task 2).
- Cọc đang giữ lệch sổ cọc hợp đồng (Task 1).
- Thu từ icon hoá đơn không hiện ở Thu chi (Task 2).
- Chi có số tiền ≤ 0 hoặc loại lạ được ghi (Task 2).

### Task 1: Bảng `expenses` và hàm thuần sổ quỹ
**Files:** Create `src/db/schema/cashbook.ts`, `src/domain/cashbook.ts`, `tests/unit/domain/cashbook.test.ts`; Modify `src/db/index.ts` (export), `drizzle/` (sinh bằng `npm run db:generate`).

**Interfaces:**
- Produces: `expenses` (cột: `id`, `facilityId` notNull→facilities, `roomId` null→rooms, `category` text `repair|utility|salary|other`, `date`, `amount` bigint, `method` text, `payee` text default '', `note` text default '', `createdBy` uuid, `isDemo`, `createdAt`, `updatedAt`; index theo `facility_id`, `date`).
- Produces (domain): `type LedgerRow = { key: string; source: 'payment'|'deposit'|'expense'; id: string; date: string; direction: 'in'|'out'; kind: string; label: string; amount: number; counted: boolean; facilityId: string; roomCode: string|null; party: string; method: string|null; note: string; status: 'done'|'pending' }`; `depositMovement(type, status): { direction: 'in'|'out'; counted: boolean; label: string }`; `summarize(rows: LedgerRow[]): { income: number; expense: number; net: number }` (chỉ `counted`); `depositHeld(entries: {type:string;status:string;amount:number}[]): number`; `EXPENSE_CATEGORIES: {value, label}[]` (Sửa chữa, Điện nước, Lương, Khác).
- [ ] Viết test `cashbook.test.ts`: `collect/topup done` → in, counted; `refund done` → out, counted; `deduct/forfeit done` → counted=false; mọi `pending` → counted=false; `summarize` bỏ dòng không counted; `depositHeld` = collect+topup−refund−deduct−forfeit chỉ `done`.
- [ ] Cài đặt `src/db/schema/cashbook.ts` và `src/domain/cashbook.ts`; export schema trong `src/db/index.ts`; chạy `npm run db:generate`.
- [ ] Commit `feat: bảng chi và hàm tính sổ quỹ`.

### Task 2: Dịch vụ sổ quỹ
**Files:** Create `src/server/cashbook/schemas.ts`, `service.ts`, `actions.ts`, `tests/integration/cashbook.test.ts`.

**Interfaces:**
- Consumes: `LedgerRow`, `depositMovement`, `summarize`, `depositHeld`; `recordLeasePayment`, `leaseDebt` (`@/server/invoices/service`); `addDepositEntry`, `markDepositDone` (`@/server/charges/service`); `recordAudit`.
- Produces: `listCashbook(db, ctx, input: { month?: string /* YYYY-MM, bỏ trống = tất cả */; facilityId?: string }): Promise<{ rows: LedgerRow[]; depositHeld: number }>` (chỉ cơ sở trong quyền `billing`); `addExpense(db, ctx, input: unknown)`, `updateExpense(db, ctx, id, input: unknown)`, `deleteExpense(db, ctx, id)` (có audit, entity `expense`); `listCollectableLeases(db, ctx, facilityId?): Promise<{ leaseId; roomCode; tenantName; facilityId; debt }[]>` (hợp đồng đang hiệu lực có dư nợ > 0); `listDepositTargets(db, ctx)` hợp đồng đang hiệu lực để thu/hoàn cọc. Actions bọc bằng `toActionResult`, `revalidatePath('/cashbook')` (và `/invoices`, `/contracts` layout cho thu tiền, cọc): `addExpenseAction`, `updateExpenseAction`, `deleteExpenseAction`, `collectRentAction(leaseId, input)`, `addDepositAction`, `markDepositDoneAction`.
- Zod `expenseInput`: `facilityId` uuid, `roomId` uuid nullable, `category` enum, `date` iso, `amount` int > 0 an toàn, `method` enum `cash|transfer|other`, `payee` string, `note` string.
- [ ] Test tích hợp (PGlite, theo mẫu `tests/integration/lease-payment.test.ts`): dòng gộp đúng nguồn/hướng; `pending`, `deduct`, `forfeit` không vào `summarize`; thu từ `recordLeasePayment` hiện ra; người có quyền cơ sở A không thấy cơ sở B; `addExpense` từ chối amount ≤ 0 và loại lạ, từ chối khi không có quyền cơ sở; sửa/xoá chi có audit; `depositHeld` khớp tổng sổ cọc.
- [ ] Cài đặt service: ba truy vấn (payments join invoices→leases→rooms→tenants; deposit_entries join leases→rooms; expenses) rồi gộp, sắp xếp ngày giảm dần; lọc tháng theo `date`.
- [ ] Commit `feat: dịch vụ sổ quỹ thu chi`.

### Task 3: Giao diện tab Thu chi
**Files:** Create `src/app/(app)/cashbook/page.tsx`, `loading.tsx`, `src/features/cashbook/components/cashbook-list.tsx`, `expense-dialog.tsx`, `deposit-dialog.tsx`; Move `src/features/invoices/components/collect-payment-dialog.tsx` → `src/components/collect-payment-dialog.tsx` (đổi import ở `invoice-row-actions.tsx`; dùng action thu tiền hiện có `recordLeasePaymentAction` — chấp nhận để tab Thu chi gọi cùng action); Modify `src/components/app-shell/nav.ts` (thêm `{ href: '/cashbook', label: 'Thu chi', icon: Wallet, requires: 'billing' }` sau Hoá đơn), `src/domain/access.ts` (nhãn + mô tả `billing`).
- Trang: `PageHeader` "Thu chi" + mô tả ngắn; dải tổng quan 4 ô (Thu, Chi, Chênh lệch, Cọc đang giữ) từ dữ liệu đang lọc; một thanh lọc: Tháng (server, qua `searchParams.month`, mặc định tháng hiện tại, có "Tất cả"), Cơ sở, Loại (Tất cả / Thu tiền thuê / Cọc / Sửa chữa / Điện nước / Lương / Khác), tìm kiếm; bảng theo mẫu `invoice-list.tsx` (card `rounded-2xl border`, checkbox không cần, dưới `lg` thành dòng 2 dòng, `Pager`, chip loại, thu xanh/chi đỏ nhạt, tiền căn phải `tabular-nums`); dòng không counted ghi "không tiền mặt"/"chờ thu".
- Nút chính "Thêm khoản chi" mở `ExpenseDialog`; nút phụ "Thu tiền thuê" (chọn hợp đồng từ `listCollectableLeases`, mở `CollectPaymentDialog`) và "Thu/hoàn cọc" (`DepositDialog`). Dòng chi có Sửa/Xoá (xác nhận bằng `confirm-dialog`).
- [ ] Làm các bước trên; chạy dev server (`preview_start`), mở `/cashbook`, đối chiếu số với dữ liệu thật, thêm một khoản chi thử rồi xoá, chụp màn hình.
- [ ] Commit `feat: tab Thu chi`.

### Task 4: Hoá đơn và dọn dẹp
**Files:** Modify `src/app/(app)/invoices/[id]/page.tsx` (bỏ `PaymentDialog` và dữ liệu `payments` truyền vào), xoá `src/features/invoices/components/payment-dialog.tsx`, `src/features/invoices/components/invoice-list.tsx` (lời nhắc "Đã có khoản thu…" thêm "xem ở Thu chi"); Modify tests: `tests/e2e/invoices.spec.ts` chỉ nếu nhắc lịch sử thu; thêm `tests/e2e/cashbook.spec.ts` (mở tab Thu chi, thêm một khoản chi, thấy trong danh sách) — chỉ viết.
- [ ] Giữ icon thu tiền, `CollectPaymentDialog`, công nợ trên danh sách hoá đơn.
- [ ] Kiểm bằng dev server: `/invoices/[id]` không còn khối lịch sử thu, icon thu ở danh sách vẫn mở popup; thu thử không thực hiện (dữ liệu thật).
- [ ] Commit `feat: hoá đơn bỏ lịch sử thu, giữ thu nhanh`.
