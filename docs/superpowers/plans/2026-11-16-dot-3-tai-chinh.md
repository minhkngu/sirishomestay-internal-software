# Siris — Đợt 3: Tài chính

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lõi tính tiền (lẻ ngày, hệ số, điện nước, đổi giá, điều chỉnh giữa kỳ, sổ cọc, thanh lý), phí phát sinh, hoá đơn hàng loạt + duyệt + thu tiền + công nợ, phụ lục gia hạn / chuyển phòng / thanh lý — trên dữ liệu giả.

**Architecture:** Next.js App Router; trang là server components đọc qua service, ghi qua server actions; service `(db, ctx, input)` dùng Drizzle nối Postgres của Supabase; phân quyền ở server qua `AccessContext`; RLS bật không policy; logic nghiệp vụ là hàm thuần trong `src/domain/`; test service trên PGlite; dữ liệu giả nạp bằng `npm run db:seed`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle + drizzle-kit, postgres.js, @supabase/ssr, zod, react-hook-form, Vitest + PGlite, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`
**Tổng quan các đợt:** `docs/superpowers/plans/README.md` · Số Task giữ theo thứ tự chung của toàn dự án.

**Điều kiện bắt đầu:** Đợt 2 đã được người dùng duyệt.

## Global Constraints

- Giao diện tiếng Việt hoàn toàn. Code, tên bảng, tên biến bằng tiếng Anh.
- Tiền là số nguyên VND (`bigint` mode number), hiển thị `1.500.000`. Ngày nghiệp vụ dùng kiểu `date`, chuỗi `yyyy-mm-dd`, hiển thị `dd/mm/yyyy`. "Hôm nay" tính theo `Asia/Ho_Chi_Minh`.
- Làm tròn tiền *(Claude quyết)*: mỗi dòng hoá đơn làm tròn tới đồng (`Math.round`); tổng = tổng các dòng đã làm tròn.
- Số điện thoại lưu E.164, duy nhất.
- Nhóm quyền cố định: `tenants_contracts` (Khách & hợp đồng), `billing` (Hoá đơn & thu tiền), `meters` (Ghi điện nước), `assets` (Tài sản & kho), `incidents` (Sự cố & sửa chữa), `settings` (Cài đặt — kiêm admin, thấy mọi cơ sở). Quyền giống nhau ở mọi cơ sở được giao.
- Số passport/CCCD và ảnh giấy tờ chỉ người có `tenants_contracts` (hoặc `settings`) xem được.
- Mỗi phòng tối đa 1 hợp đồng thuê đang hiệu lực + 1 hợp đồng cọc chờ.
- Mọi thao tác ghi đều ghi `audit_logs` trong cùng transaction.
- Mỗi server action bắt đầu bằng `const ctx = await getAccessContext()`, kiểm input bằng zod, gọi service, và trả `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }`.
- Không dùng extension Postgres ngoài mặc định, để chạy được như nhau trên PGlite và Supabase.
- Ảnh nén trên trình duyệt trước khi tải lên: cạnh dài 1600px, chất lượng 0.75, kèm thumbnail 300px.
- Hạ tầng: Supabase Free (Postgres, Auth, Storage cho giai đoạn thử), Cloudflare R2 cho file khi chạy thật (Task 21), Vercel cho app. Sao lưu: chỉ cơ sở dữ liệu, mỗi đêm ra Google Drive, giữ 30 bản.
- Khi `NEXT_PUBLIC_DEMO_MODE=1`: hiện dải "Môi trường thử — dữ liệu giả" và trang đăng nhập có nút đăng nhập nhanh bằng tài khoản mẫu.

## Review Focus

1. **Tính lẻ ngày ở ranh giới tháng**: vào ở ngày 1, ngày cuối tháng, tháng 2 năm nhuận, với cả `days_30` và `actual_days`; ngày ra trước ngày vào không được ra số âm. → test ở Task 4.
2. **Thay đồng hồ và chỉ số giảm**: chỉ số mới nhỏ hơn chỉ số cũ mà không có lần thay đồng hồ phải báo lỗi tại ô nhập, không tính tiền âm. → test ở Task 4 và Task 12.
3. **Thay đổi giữa kỳ sau khi hoá đơn đã duyệt** (chuyển phòng, gia hạn đổi giá) phải sinh đúng dòng điều chỉnh âm/dương ở kỳ sau, và không sinh lặp khi tạo lại nháp. → test ở Task 4 và Task 14.
4. **Người dùng sai cơ sở / thiếu quyền** mở thẳng URL hoặc gọi action của cơ sở khác → "Không tìm thấy", không lộ dữ liệu. → test ở Task 3 và trong service test của mọi module.
5. **Nhập trùng / nhập lại**: số điện thoại nhiều kiểu (`0901 234 567`, `+84 90 123 4567`) trùng nhau phải báo lỗi tiếng Việt, không phải lỗi 500; nhập lại cùng file Excel không tạo trùng. → test ở Task 7 và Task 18.

---

## Cấu trúc file

```
src/
  app/
    login/page.tsx
    (app)/layout.tsx  (app)/page.tsx (nhắc việc)
    (app)/facilities/…  rooms/[id]  tenants/…  contracts/…  handovers/[id]  meters  invoices/…
    (app)/assets/…  incidents/…  users  templates  import  settings  audit
    api/files/[id]/route.ts              cấp URL ký sau khi kiểm quyền
  db/
    client.ts  schema/<module>.ts  index.ts
  domain/                                hàm thuần, có unit test
    access.ts errors.ts phone.ts dates.ts text.ts money.ts
    proration.ts meters.ts rates.ts due-date.ts contract-terms.ts adjustments.ts
    invoice-builder.ts deposit.ts liquidation.ts reminders.ts room-status.ts template-fields.ts
  server/
    session.ts  audit.ts  storage/{types,supabase,r2,memory,index}.ts
    <module>/service.ts                 (db, ctx, input) → kết quả; ném NotFound/Forbidden/Validation
    <module>/actions.ts                 "use server"
  features/<module>/components/*.tsx
  lib/{docx,excel,image,action-result}.ts
scripts/seed/{index.ts,<module>.ts}      dữ liệu giả, PRNG có seed cố định
scripts/build-sample-templates.ts
drizzle/                                 migration
tests/helpers/db.ts  tests/unit/**  tests/integration/**  tests/e2e/**
.github/workflows/backup.yml  docs/operations/*.md  docs/review/checklist.md
```

**Quy ước cho mọi task có bảng mới:** viết schema Drizzle trong `src/db/schema/<module>.ts` → `npm run db:generate` → thêm `enable row level security` cho bảng mới trong cùng migration → thêm dữ liệu giả của module vào `scripts/seed/<module>.ts` (đăng ký trong `scripts/seed/index.ts`) → `npm run db:migrate` và `npm run db:seed` lên Supabase dev. Mọi bảng có `id uuid default gen_random_uuid()`, `created_at`, `updated_at`; bảng nào có dữ liệu giả thì thêm `is_demo bool default false` (seed đặt `true`) để Task 23 xoá sạch được.

**Dữ liệu giả (tổng hợp từ các task):** 2 cơ sở (TD Thảo Điền: tầng 1–4 × 6 phòng; BT Bình Thạnh: tầng 1–4 × 4 phòng); 30 khách (14 nước ngoài với visa hết hạn tương đối so với ngày seed: −5, 0, 3, 9, 16, 24, 29, 30, 45, 70, 120, 200, 260, 330 ngày; 12 Việt Nam; 4 công ty); ~26 hợp đồng thuê (vài cái hết hạn trong 30 ngày, 2 cái chưa ký); 3 hợp đồng cọc chờ; đồng hồ và chỉ số 3 tháng; hoá đơn 2 tháng (vài cái quá hạn); sổ cọc; ~120 tài sản; 8 sự cố; 6 loại phí; đơn giá điện 3.500đ/kWh (đổi lên 3.800đ từ đầu tháng hiện tại) và nước 18.000đ/m³; 5 tài khoản mẫu: Admin (settings); Lan — Quản lý TD (tenants_contracts, billing); Minh — Kế toán TD+BT (billing); Hùng — Kỹ thuật BT (meters, assets, incidents); Vy — Lễ tân TD (tenants_contracts, meters). Tên và số giấy tờ đều bịa. `db:seed --reset` xoá dữ liệu rồi nạp lại.

---

### Task 4: Lõi tính tiền (hàm thuần) ✅

**Files:**
- Create: `src/domain/{proration,meters,rates,due-date,contract-terms,adjustments,invoice-builder,deposit,liquidation}.ts`, `src/domain/types.ts` (kiểu đầu vào thuần, không phụ thuộc Drizzle)
- Test: `tests/unit/domain/billing.test.ts`

**Interfaces:**
- Produces:
  - `prorate(monthly, from, to, mode: 'days_30'|'actual_days'): { coefficient; amount }`
    - Tính cả hai đầu `from..to`, cộng theo từng tháng dương lịch: tháng đủ = 1, tháng thiếu = số ngày ở / (30 hoặc số ngày thực của tháng).
    - `coefficient` làm tròn 4 chữ số. `amount = Math.round(monthly × Σ)`, với Σ là tổng chưa làm tròn.
    - `to < from` → `{ coefficient: 0, amount: 0 }`.
  - `fullMonthCoefficient(from, to)`: số tháng dương lịch mà khoảng ngày chạm tới.
  - `meterUsage(meters, readings, periodStart, periodEnd): { usage; segments }`
    - Cộng phần chạy trên từng đồng hồ có hiệu lực trong kỳ: đồng hồ gỡ giữa kỳ dùng `finalReading`, đồng hồ mới tính từ `startReading`.
    - Chỉ số giảm trên cùng một đồng hồ → `ValidationError('Chỉ số mới nhỏ hơn chỉ số cũ')`.
  - `rateFor(rates, facilityId, utility, periodStart)`: lấy mức có `effectiveFrom` lớn nhất mà ≤ `periodStart`. Không có mức nào → `ValidationError('Chưa cài đơn giá')`.
  - `computeDueDate(rule, approvedOn)`, với `rule = { kind: 'day_of_next_month'; day } | { kind: 'days_after_approval'; days }`. Ngày vượt quá số ngày của tháng sau → lấy ngày cuối tháng.
  - `contractTermsAt(lease, addenda, date)` → `{ roomId, monthlyRent, depositAmount, fees, occupantIds, endDate }`: lấy hợp đồng gốc rồi áp lần lượt theo ngày các phụ lục có `effectiveDate ≤ date`.
  - `midPeriodAdjustments({ lease, addenda, approvedInvoices, proration })` → `{ description, amount (có dấu), sourceKey }[]`
    - Với mỗi phụ lục có hiệu lực bên trong kỳ của một hoá đơn đã duyệt: tính chênh lệch tiền phòng và phí cố định cho số ngày còn lại của kỳ. `sourceKey = addendumId:invoiceId`.
    - Ngoại lệ: gia hạn đổi giá khi khách đã trả trước vượt sang tháng của phụ lục → không sinh điều chỉnh, giữ giá cũ.
  - `buildMonthlyInvoice({ terms, period, proration, meters, readings, rates, oneOffs, pending, occupantsCount, overridePeriod?, fullMonth? })` → `{ lines, periodStart, periodEnd, warnings }`
    - Tiền phòng và phí cố định tính cho **kỳ N**, hoặc cho khoảng ngày sửa tay kèm hệ số. Phí `quantityFrom: 'occupants'` lấy số lượng theo số người ở.
    - Điện, nước tính cho **tháng N−1**; bỏ qua nếu hợp đồng bắt đầu trong tháng N.
    - Thêm phí theo lần chưa xuất hoá đơn có ngày ≤ cuối tháng N−1, và các điều chỉnh đang chờ.
    - Hợp đồng bắt đầu hoặc kết thúc giữa kỳ → tính lẻ ngày, trừ khi bật `fullMonth`.
  - `buildFirstInvoice(terms, startDate, proration, depositCollected)`: tiền cọc còn thiếu, cộng tiền phòng và phí từ ngày bắt đầu tới cuối tháng.
  - `depositBalance(entries)`: chỉ tính dòng `done`; collect/topup cộng, deduct/refund/forfeit trừ.
  - `depositDiffEntry(old, new, date)`: trả dòng topup hoặc refund ở trạng thái `pending`, hoặc null nếu không đổi.
  - `buildTerminationInvoice({ terms, endDate, approvedInvoices, meterUsage…, oneOffs, pending, penalties, unpaidTotal, depositBalance, forfeit: { mode: 'all'|'partial'|'none'; amount? }, proration })` → `{ lines, total }`
    - `total` > 0 nghĩa là khách phải trả thêm; < 0 nghĩa là hoàn cho khách.
    - Tiền phòng đã trả trước vượt `endDate` → thành dòng hoàn (âm).
    - Dòng trừ cọc = −(số dư cọc − phần mất cọc).

- [x] **Step 1: Viết test (giá trị lấy từ spec)**

```ts
expect(prorate(9_000_000,'2026-10-15','2026-10-31','actual_days')).toEqual({ coefficient: 0.5484, amount: 4_935_484 })
expect(prorate(9_000_000,'2026-10-15','2026-10-31','days_30')).toEqual({ coefficient: 0.5667, amount: 5_100_000 })
expect(prorate(9_000_000,'2026-10-01','2026-12-31','actual_days').coefficient).toBe(3)
expect(prorate(9_000_000,'2028-02-15','2028-02-29','actual_days').amount).toBe(4_655_172)
expect(prorate(9_000_000,'2026-10-20','2026-10-10','actual_days')).toEqual({ coefficient: 0, amount: 0 })
// thay đồng hồ: đồng hồ cũ 1200→1260 (gỡ ngày 20/10), đồng hồ mới 0→45 vào cuối tháng → 105
// chỉ số giảm trên cùng đồng hồ → ném 'Chỉ số mới nhỏ hơn chỉ số cũ'
// đổi giá điện từ 01/11: kỳ tháng 10 = 3500, kỳ tháng 11 = 3800
expect(computeDueDate({kind:'days_after_approval',days:5},'2026-11-03')).toBe('2026-11-08')
expect(computeDueDate({kind:'day_of_next_month',day:31},'2027-01-20')).toBe('2027-02-28')
// chuyển phòng 15/11 từ phòng 9tr sang phòng 11tr, hoá đơn tháng 11 (days_30) đã duyệt
//   → +1.066.667; chạy lại cùng sourceKey không sinh thêm
// gia hạn tăng giá 9tr→10tr từ 01/12, khách đã trả trước tới 31/12 → không có điều chỉnh
// gia hạn tăng cọc 9tr→10tr → dòng topup 1.000.000, trạng thái pending
// hoá đơn tháng 11 gồm: tiền phòng tháng 11 + điện nước tháng 10 + giặt ủi tháng 10 + điều chỉnh đang chờ
// thanh lý 20/11 (days_30), đã trả đủ tháng 11 (9tr), cọc 9tr, điện nước 420.000, phạt 500.000:
//   không mất cọc → total -11_080_000; mất cọc toàn bộ → total -2_080_000
```

- [x] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat(domain): lõi tính tiền — lẻ ngày, điện nước, điều chỉnh, sổ cọc, thanh lý`.

### Task 4b: Bổ sung lõi tính tiền (sau rà soát spec 16/11)

Task 4 chưa xử lý: thay đổi điều khoản *bên trong* kỳ của hoá đơn chưa duyệt (spec 6.3 "hoá đơn kỳ đó tách theo ngày ở mỗi phòng"), đổi số người ở giữa kỳ (spec 6.5), nước tính theo người thay cho đồng hồ (spec 6.6), và trạng thái của hoá đơn âm (hoàn khách).

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/contract-terms.ts`, `src/domain/invoice-builder.ts`, `src/domain/adjustments.ts`
- Test: `tests/unit/domain/billing.test.ts` (thêm ca)

**Interfaces:**
- Consumes: `contractTermsAt`, `prorate`, `meterUsage`, `rateFor` (Task 4).
- Produces:
  - `Addendum.type` thêm `'occupants'` (đổi người ở; chỉ dùng `newOccupantIds`).
  - `Lease` và `LeaseTerms` thêm `billingCycleMonths: number` (1–12, mặc định 1) và `billWaterByMeter: boolean` (mặc định true).
  - `termSegments(lease, addenda, from, to): { from: ISODate; to: ISODate; terms: LeaseTerms }[]` trong `contract-terms.ts` — cắt khoảng `from..to` tại mỗi `effectiveDate` của phụ lục rơi vào trong khoảng.
  - `MonthlyInvoiceInput`: thay `terms` + `occupantsCount` bằng `lease: Lease` + `addenda: Addendum[]`; `meters` gồm đồng hồ của **mọi phòng** hợp đồng đã ở trong tháng N−1. Tiền phòng và phí cố định tính theo từng đoạn của `termSegments` (mỗi đoạn một dòng, mô tả ghi phòng và khoảng ngày); điện nước N−1 cộng `meterUsage` của từng phòng trong đoạn ở phòng đó; `billWaterByMeter = false` → không có dòng nước đồng hồ.
  - `nextBillingPeriod(lease, lastBilledEnd: ISODate | null, period: 'YYYY-MM'): { start; end } | null` trong `invoice-builder.ts` — kỳ kế tiếp dài `billingCycleMonths` tháng bắt đầu từ `lastBilledEnd + 1` (hoặc `startDate`); trả `null` nếu kỳ đó bắt đầu sau cuối tháng `period` (khách đã trả trước, hoặc đã có hoá đơn kỳ đó); `end` không vượt `endDate` của hợp đồng.
  - `midPeriodAdjustments` tính cả chênh lệch phí `quantityFrom: 'occupants'` khi phụ lục `occupants` có hiệu lực trong kỳ đã duyệt.
  - `invoiceStatus` (Task 14) dùng `settlementState(total, paid): 'unpaid'|'partial'|'paid'|'refund_pending'|'refunded'` trong `invoice-builder.ts`: `total < 0` → khoản thu âm (tiền đã hoàn) so với `total`.

- [ ] **Step 1: Viết test (days_30)**

```ts
// chuyển phòng 15/11 từ phòng 9tr sang 11tr, hoá đơn tháng 11 CHƯA tạo
//   → 2 dòng tiền phòng: 9.000.000 × 14/30 = 4.200.000 và 11.000.000 × 16/30 = 5.866.667
// hoá đơn tháng 12 sau chuyển phòng: phòng cũ tiêu thụ 60 kWh tới 15/11 + phòng mới 40 kWh → điện 100 kWh
// phí 200.000/người, 2 → 3 người từ 16/11, hoá đơn tháng 11 đã duyệt → điều chỉnh +100.000
// billWaterByMeter = false → không có dòng 'water'
const q = { ...lease, billingCycleMonths: 3, startDate: '2026-10-01' }
expect(nextBillingPeriod(q, null, '2026-10')).toEqual({ start: '2026-10-01', end: '2026-12-31' })
expect(nextBillingPeriod(q, '2026-12-31', '2026-11')).toBeNull()          // đã trả tới hết tháng 12
expect(nextBillingPeriod(q, '2026-12-31', '2027-01')).toEqual({ start: '2027-01-01', end: '2027-03-31' })
expect(nextBillingPeriod({ ...q, billingCycleMonths: 1 }, '2027-02-28', '2027-01')).toBeNull() // sửa tay kỳ tới 28/02
expect(nextBillingPeriod({ ...q, billingCycleMonths: 1 }, '2026-11-30', '2026-11')).toBeNull() // đã có hoá đơn tháng 11
expect(nextBillingPeriod({ ...q, endDate: '2027-02-15' }, '2026-12-31', '2027-01')).toEqual({ start: '2027-01-01', end: '2027-02-15' }) // không vượt ngày kết thúc HĐ
expect(settlementState(-11_080_000, 0)).toBe('refund_pending')
expect(settlementState(-11_080_000, -11_080_000)).toBe('refunded')
```

- [ ] **Step 2:** Chạy `npx vitest run tests/unit/domain/billing.test.ts` → FAIL.
- [ ] **Step 3:** Cài đặt. Các test cũ của Task 4 phải vẫn đúng (chỉ đổi cách truyền đầu vào).
- [ ] **Step 4:** Chạy → PASS toàn bộ `billing.test.ts`.
- [ ] **Step 5:** Commit `feat(domain): tách kỳ theo phụ lục, đổi người ở, kỳ thanh toán nhiều tháng, hoá đơn hoàn khách`.

### Task 13: Phí phát sinh theo lần

**Files:**
- Create: `src/db/schema/charges.ts`, `src/server/charges/{service.ts,actions.ts}`, `src/features/charges/components/one-off-dialog.tsx`, `src/features/deposits/components/deposit-ledger.tsx`
- Test: `tests/integration/charges.test.ts`

**Interfaces:**
- Bảng: `one_off_charges(lease_id, fee_type_id null, kind 'service'|'penalty', description, date, quantity, unit_price, invoice_id null, source text null)`, `pending_adjustments(lease_id, description, amount, source_key unique, invoice_id null)`.
- Produces: `addOneOff`, `listOneOffs`, `removeOneOff` (không xoá được nếu đã vào hoá đơn đã duyệt); `listDepositEntries(leaseId)`, `markDepositDone(entryId, { date, method })`, `addDepositEntry`. Tất cả có dạng `(db, ctx, …)` và cần quyền `billing` tại cơ sở của hợp đồng.
- [ ] **Step 1:** Test: thêm "Giặt ủi 3kg × 25.000" → ở trạng thái chưa tính; đánh dấu khoản cọc bổ sung đã thu → `depositBalance` tăng 1.000.000; người chỉ có `meters` gọi `addOneOff` → `ForbiddenError`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI: nút "Thêm phí phát sinh" ở trang hợp đồng và trang phòng; sổ cọc dạng bảng (ngày, loại, số tiền, trạng thái, số dư luỹ kế).
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: phí phát sinh theo lần, sổ cọc`.

### Task 14: Hoá đơn và thu tiền

**Files:**
- Create: `src/db/schema/invoices.ts`, `src/server/invoices/{service.ts,actions.ts}`, `src/app/(app)/invoices/page.tsx`, `generate/page.tsx`, `[id]/page.tsx`, `src/features/invoices/components/{generate-wizard.tsx,invoice-editor.tsx,payment-dialog.tsx,invoice-status.tsx}`, `scripts/seed/invoices.ts`
- Modify: `src/server/contracts/service.ts` (tạo hoá đơn đầu tiên nháp thật)
- Test: `tests/integration/invoices.test.ts`

**Interfaces:**
- Bảng:
  - `invoices(code unique, lease_id, facility_id, kind 'monthly'|'first'|'termination'|'manual', period_start, period_end, coefficient numeric null, full_month bool, proration 'days_30'|'actual_days' null, issue_date, due_date, status 'draft'|'approved', source text null, note)` — `proration` ghi đè cách tính lẻ ngày cho riêng hoá đơn này (spec 6.5); thứ tự ưu tiên: hoá đơn > hợp đồng > cài đặt. `source` dùng cho nhập Excel (Task 18).
  - Thêm cột vào `leases` (migration của task này): `billing_cycle_months int not null default 1` (check 1–12) — "kỳ thanh toán mặc định" của spec 6.3; `bill_water_by_meter bool not null default true`. Wizard hợp đồng (Task 9) bước 4 thêm hai ô này.
  - `invoice_lines(invoice_id, type 'rent'|'fee'|'electric'|'water'|'one_off'|'penalty'|'adjustment'|'deposit'|'deposit_offset'|'refund', description, quantity numeric, unit_price, amount, meta jsonb)`
  - `payments(invoice_id, paid_on, amount, method 'cash'|'transfer'|'other', received_by, note)`
  - Mã hoá đơn *(Claude quyết)*: `<mã cơ sở>-HD-<YYYYMM>-<số thứ tự 4 chữ số>`.
- Produces:
  - `previewBatch(db, ctx, { facilityId, period })` → mỗi hợp đồng: `{ leaseId, lines, warnings }` (cảnh báo khi chưa ghi điện nước hoặc chưa có đơn giá).
  - `createDrafts(...)`: kỳ của mỗi hợp đồng lấy từ `nextBillingPeriod(lease, max(period_end) các hoá đơn của hợp đồng, period)`; `null` (đã trả trước tới sau tháng này, hoặc đã có hoá đơn kỳ đó) → bỏ qua và ghi vào danh sách "Đã trả trước tới dd/mm/yyyy" ở bước xem trước. Đánh dấu các phí phát sinh và điều chỉnh đã dùng.
  - `updateLines`: nháp hay đã duyệt đều sửa được; sửa hoá đơn đã duyệt thì ghi audit kèm trước/sau.
  - `setPeriod(id, { start, end, coefficient?, fullMonth?, proration? })`: tính lại dòng tiền phòng và phí cố định.
  - `approveInvoice(id, { dueRule? , dueDate? })`: thứ tự ưu tiên hạn thanh toán là hoá đơn > hợp đồng > cài đặt.
  - `deleteInvoice(id)`: nếu đã có khoản thu → `ValidationError('Gỡ các khoản đã thu trước khi xoá')`; xoá xong thì trả phí phát sinh và điều chỉnh về trạng thái chưa tính.
  - `addPayment`, `removePayment`, `invoiceStatus(invoice, payments, today)` → Nháp / Chưa thu / Thu một phần / Đã thu đủ / Quá hạn / Chờ hoàn khách / Đã hoàn (hai trạng thái sau cho hoá đơn tổng âm, dựa trên `settlementState` của Task 4b). Hoá đơn tổng âm: `addPayment` nhận số âm (tiền đã hoàn cho khách); hoá đơn dương thì số âm bị từ chối.
  - `exportReceipt(db, ctx, paymentId, templateId?) → fileId`: xuất phiếu thu (`doc_type = 'receipt'`) từ một khoản thu; nút "Xuất phiếu thu" trong danh sách khoản thu của hoá đơn.
  - `listInvoices(db, ctx, { facilityId?, status?, period?, overdue? })`, `tenantBalance(db, ctx, tenantId)`.
  - Mỗi khi duyệt hoá đơn hoặc tạo phụ lục: tính `midPeriodAdjustments` rồi upsert vào `pending_adjustments` theo `source_key`.
  - Cần quyền `billing`.
- [ ] **Step 1:** Viết test.
  - Tạo nháp tháng 12 → dòng tiền phòng tháng 12, điện nước tháng 11, phí phát sinh.
  - Tạo nháp lần nữa → không trùng hoá đơn, không lặp điều chỉnh.
  - Sửa kỳ 01/12–28/02 → hệ số 3; tạo hàng loạt tháng 01 và tháng 02 → hợp đồng đó bị bỏ qua, hiện "Đã trả trước tới 28/02/2027".
  - Hợp đồng `billing_cycle_months = 3` bắt đầu 01/10 → nháp tháng 10 có kỳ 01/10–31/12, tháng 11 và 12 không sinh hoá đơn.
  - Hoá đơn có `proration = 'days_30'` trong khi cài đặt là `actual_days` → dòng tiền phòng lẻ ngày tính theo 30.
  - Duyệt với "ngày 5 của tháng sau" → hạn 05/01.
  - Thu một phần → "Thu một phần"; xoá → lỗi; quá hạn → "Quá hạn".
  - Người chỉ có quyền `meters` → `ForbiddenError`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI.
  - **Danh sách:** bộ lọc nhanh Nháp / Chưa thu / Quá hạn / Kỳ.
  - **Wizard tạo hàng loạt:** chọn cơ sở và kỳ → xem trước kèm cảnh báo → tạo nháp.
  - **Editor:** bảng dòng hoá đơn sửa trực tiếp (thêm dòng, chọn loại phí, phạt, điều chỉnh); sửa kỳ và hệ số; chọn hạn thanh toán; ghi thu; xem công nợ của khách.
  - **Menu xuất:** Word chạy ngay; PDF và Ảnh sẽ có ở Task 20, trước đó các nút này báo "Sắp có".
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: hoá đơn hàng loạt, sửa, duyệt, thu tiền, công nợ`.

### Task 15: Phụ lục — gia hạn, chuyển phòng, thanh lý

**Files:**
- Create: `src/db/schema/addenda.ts`, `src/server/addenda/{service.ts,actions.ts}`, `src/features/contracts/components/{extension-dialog.tsx,transfer-wizard.tsx,termination-wizard.tsx}`
- Test: `tests/integration/addenda.test.ts`

**Interfaces:**
- Bảng: `addenda(lease_id, type 'extension'|'transfer'|'termination'|'occupants', effective_date, new_end_date, new_room_id, new_monthly_rent, new_deposit_amount, new_fees jsonb, new_occupant_ids jsonb, deposit_forfeit jsonb, adjustment_target 'next'|'current', sign_status, signed_file_id)`.
- Quyền: tạo phụ lục cần `tenants_contracts`; bước "Xem trước tiền" hiện số tiền cho người đó; duyệt hoá đơn thanh lý cần `billing` (Task 14).
- Produces:
  - Mọi phụ lục có hiệu lực bên trong kỳ của hoá đơn đã duyệt cho chọn `adjustmentTarget` (spec 6.5): `'next'` (mặc định) → upsert `pending_adjustments`; `'current'` → thêm dòng `adjustment` thẳng vào hoá đơn đã duyệt đó, ghi audit kèm trước/sau, không tạo `pending_adjustments`.
  - `createOccupantChange(db, ctx, leaseId, { effectiveDate, occupantIds, adjustmentTarget? })`: người ở phải là khách cá nhân (không phải công ty); cập nhật `lease_occupants` từ ngày hiệu lực và tính điều chỉnh cho phí theo người. Nút "Đổi người ở" ở tab Tổng quan của hợp đồng.
  - `createExtension(leaseId, { effectiveDate, newEndDate, newMonthlyRent?, newDepositAmount?, newFees? })`: nếu tiền cọc thay đổi thì sinh `deposit_entries` ở trạng thái pending (`depositDiffEntry`), và tính điều chỉnh giữa kỳ.
  - `createTransfer(leaseId, { effectiveDate, newRoomId, newMonthlyRent?, newFees? })`
    - Phòng đích phải trống, hoặc chỉ có cọc chờ của chính khách này.
    - Tự tạo check-out phòng cũ, check-in phòng mới, chốt chỉ số điện nước, và tính điều chỉnh.
  - `createTermination(leaseId, { endDate, forfeit })`
    - Tạo check-out rồi dựng hoá đơn thanh lý nháp bằng `buildTerminationInvoice` (lấy phạt từ check-out và nợ cũ).
    - Khi hoá đơn thanh lý được duyệt: lease chuyển `ended`; ghi sổ cọc `forfeit` (phần mất cọc) và `deduct` (phần cọc còn lại, đã trừ vào hoá đơn) ở trạng thái `done` để số dư cọc về 0; tiền hoàn cho khách theo dõi trên chính hoá đơn thanh lý (Chờ hoàn khách → Đã hoàn, Task 14), không ghi thêm dòng `refund` để khỏi trừ hai lần.
    - Đặt `files.delete_after = endDate + photoRetentionDays` cho ảnh bàn giao của hợp đồng; ảnh giấy tờ của bên thuê và người ở chỉ đặt khi khách đó **không còn** hợp đồng thuê `active` hay cọc `pending` nào khác.
  - Phụ lục có trạng thái ký và xuất Word như hợp đồng.
- [ ] **Step 1:** Viết test (cài đặt days_30).
  - Gia hạn tăng giá 9tr→10tr và cọc 9tr→10tr → sổ cọc có topup 1.000.000 pending.
  - Chuyển phòng 15/11 sang phòng 11tr, sau khi hoá đơn tháng 11 đã duyệt → `pending_adjustments` có +1.066.667; cùng ca với `adjustmentTarget: 'current'` → hoá đơn tháng 11 có thêm dòng +1.066.667, không có `pending_adjustments`.
  - Đổi người ở 2 → 3 từ 16/11 (phí 200.000/người), hoá đơn tháng 11 đã duyệt → `pending_adjustments` có +100.000; thêm khách công ty làm người ở → `ValidationError`.
  - Thanh lý 20/11 với phạt 500.000, không mất cọc → hoá đơn tổng −11.080.000; mất cọc toàn bộ → −2.080.000.
  - Sau khi duyệt hoá đơn thanh lý → phòng về Trống, hoặc Đã cọc nếu có cọc chờ; số dư cọc = 0; hoá đơn ở "Chờ hoàn khách".
  - Khách có ảnh passport còn một hợp đồng khác đang hiệu lực → ảnh giấy tờ không bị đặt `delete_after`.
  - Người chỉ có `billing` tạo phụ lục → `ForbiddenError`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI: mỗi phụ lục là một wizard ngắn, có bước "Xem trước tiền" trước khi lưu.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: phụ lục gia hạn, chuyển phòng, thanh lý`.

### Điểm dừng đợt 3: người dùng test

- [ ] **Step 1:** `npm test` → PASS toàn bộ; `npm run lint` sạch; `npm run build` OK.
- [ ] **Step 2:** Playwright (chạy trên Supabase dev, bỏ qua nếu thiếu `E2E_BASE_URL`) cho các luồng: ghi điện nước → tạo hoá đơn tháng hàng loạt → sửa kỳ thành 3 tháng → duyệt → thu một phần; gia hạn tăng giá và cọc → sổ cọc có khoản thu bổ sung; chuyển phòng giữa tháng → dòng điều chỉnh ở kỳ sau; thanh lý → hoá đơn thanh lý hiện "Hoàn khách". `npx playwright test` → PASS.
- [ ] **Step 3:** `npm run db:migrate && npm run db:seed -- --reset` trên Supabase dev; triển khai bản thử lên Vercel (preview) với `NEXT_PUBLIC_DEMO_MODE=1`.
- [ ] **Step 4:** Viết `docs/review/dot-3-checklist.md`: từng luồng cần bấm thử (các bước, điều cần để ý, ô ghi chú) cho phần của đợt này.
- [ ] **Step 5:** Commit `test: e2e và checklist test đợt 3`.
- [ ] **Step 6: Dừng lại.** Gửi link bản thử + checklist cho người dùng. Góp ý được cập nhật vào spec và kế hoạch các đợt sau rồi mới bắt đầu đợt tiếp theo.
