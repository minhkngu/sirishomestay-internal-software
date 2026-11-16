# Giai đoạn A — Giao diện toàn hệ thống với dữ liệu giả: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web Next.js thật, đủ mọi màn hình và luồng của hệ thống (cơ sở/phòng, khách, người dùng, hợp đồng/phụ lục, bàn giao, điện nước, hoá đơn, sổ cọc, thanh lý, tài sản, sự cố, nhắc việc, nhập Excel, mẫu Word, cài đặt), chạy hoàn toàn bằng dữ liệu giả để người dùng duyệt giao diện và luồng trước khi gắn cơ sở dữ liệu.

**Architecture:** Màn hình (client components) chỉ gọi dữ liệu qua interface `Repo` (bất đồng bộ) bọc bởi TanStack Query. Giai đoạn A dùng `MockRepo`: trạng thái nằm trong store Zustand lưu vào `localStorage` (file/ảnh vào IndexedDB), khởi tạo từ bộ dữ liệu giả có sẵn, có nút "Đặt lại dữ liệu mẫu". Đăng nhập giả: chọn một người dùng mẫu. **Logic nghiệp vụ** (phân quyền, tính tiền, điện nước, sổ cọc, thanh lý, hạn thanh toán, nhắc việc) là các hàm thuần trong `src/domain/`, có unit test đầy đủ — giai đoạn B dùng lại nguyên trên server. Giai đoạn B thay `MockRepo` bằng `SupabaseRepo` gọi server actions, không sửa màn hình.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, TanStack Query v5, Zustand (persist), idb-keyval, zod, react-hook-form, docxtemplater + pizzip (điền mẫu Word ngay trên trình duyệt), exceljs, browser-image-compression, Vitest, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`

## Global Constraints

- Giao diện tiếng Việt hoàn toàn. Code, tên biến, kiểu dữ liệu bằng tiếng Anh.
- Tiền: số nguyên VND, hiển thị `1.500.000`. Ngày nghiệp vụ: chuỗi `yyyy-mm-dd`, hiển thị `dd/mm/yyyy`. "Hôm nay" tính theo `Asia/Ho_Chi_Minh`.
- Làm tròn tiền *(quyết định của Claude, chỉnh được ở giai đoạn B)*: mỗi dòng hoá đơn làm tròn tới đồng (`Math.round`), tổng = tổng các dòng đã làm tròn.
- Số điện thoại lưu E.164, duy nhất.
- Nhóm quyền cố định: `tenants_contracts`, `billing`, `meters`, `assets`, `incidents`, `settings` (admin, thấy mọi cơ sở). Quyền giống nhau ở mọi cơ sở được giao. Màn hình và menu ẩn/hiện theo quyền; `MockRepo` cũng kiểm quyền (gọi cùng hàm `assertCan`) để luồng giống giai đoạn B.
- Mỗi phòng tối đa 1 hợp đồng thuê đang hiệu lực + 1 hợp đồng cọc chờ.
- Dải thông báo cố định đầu trang: "Bản xem thử — dữ liệu giả, lưu trên trình duyệt này".
- Dùng tốt ở màn hình điện thoại (ghi điện nước, sự cố, bàn giao làm trên điện thoại).
- Màn hình không bao giờ import trực tiếp `MockRepo` hay store — chỉ qua `useRepo()`.
- Xuất PDF/PNG cần dịch vụ Gotenberg (giai đoạn B): ở giai đoạn A nút hiển thị nhưng báo "Có ở bản chính thức"; xuất `.docx` chạy thật.

## Review Focus

1. **Tính lẻ ngày ở ranh giới tháng**: vào ở ngày 1, ngày cuối tháng, tháng 2 năm nhuận, với cả `days_30` và `actual_days`; ra trước ngày vào trong cùng tháng không được ra số âm. → test ở Task 4.
2. **Thay đồng hồ và chỉ số giảm**: chỉ số mới nhỏ hơn chỉ số cũ mà không có lần thay đồng hồ → báo lỗi tại ô nhập, không tính tiền âm. → test ở Task 4 và Task 12.
3. **Thay đổi giữa kỳ sau khi hoá đơn đã duyệt** (chuyển phòng, gia hạn đổi giá) sinh đúng dòng điều chỉnh âm/dương ở kỳ sau, và không sinh lặp khi tạo lại nháp. → test ở Task 4 và Task 14.
4. **Người dùng sai cơ sở / thiếu quyền** mở thẳng URL chi tiết (phòng, khách, hoá đơn của cơ sở khác) → trang "Không tìm thấy", không lộ dữ liệu. → test ở Task 3 và Playwright Task 6.
5. **Dữ liệu trình duyệt hỏng hoặc trống** (localStorage bị xoá, phiên bản dữ liệu cũ) → tự nạp lại dữ liệu mẫu, không trắng trang. → test ở Task 2.

---

## Cấu trúc file

```
src/
  app/
    login/page.tsx                    chọn người dùng mẫu
    (app)/layout.tsx                  khung: thanh bên theo quyền, bộ chọn cơ sở, dải "bản xem thử"
    (app)/page.tsx                    nhắc việc
    (app)/facilities/[id]/page.tsx  (app)/rooms/[id]/page.tsx
    (app)/tenants/page.tsx  (app)/tenants/[id]/page.tsx
    (app)/contracts/page.tsx  (app)/contracts/[id]/page.tsx  (app)/contracts/new/page.tsx
    (app)/handovers/[id]/page.tsx
    (app)/meters/page.tsx
    (app)/invoices/page.tsx  (app)/invoices/[id]/page.tsx  (app)/invoices/generate/page.tsx
    (app)/assets/page.tsx  (app)/assets/[id]/page.tsx
    (app)/incidents/page.tsx  (app)/incidents/[id]/page.tsx
    (app)/users/page.tsx  (app)/import/page.tsx  (app)/templates/page.tsx  (app)/settings/page.tsx
    (app)/audit/page.tsx
  domain/                             HÀM THUẦN, có test — dùng lại ở giai đoạn B
    types.ts  access.ts  phone.ts  dates.ts  text.ts  money.ts
    proration.ts  meters.ts  rates.ts  invoice-builder.ts  adjustments.ts
    deposit.ts  liquidation.ts  due-date.ts  reminders.ts  room-status.ts
    contract-terms.ts  template-fields.ts
  data/
    repo.ts                           interface Repo
    mock/{seed.ts,store.ts,mock-repo.ts,files.ts}
    repo-provider.tsx                 RepoProvider + useRepo() + useSession()
    hooks/*.ts                        useTenants(), useInvoice(id)… (TanStack Query)
  features/<module>/components/*.tsx  form, bảng, panel theo từng phần
  lib/docx.ts  lib/excel.ts  lib/image.ts
tests/
  unit/domain/*.test.ts  unit/mock-repo.test.ts  e2e/*.spec.ts
public/templates/*.docx               mẫu Word mẫu (sinh bằng scripts/build-sample-templates.ts)
```

Quy ước: mọi phương thức `Repo` nhận `ctx: AccessContext` ngầm qua instance (`createMockRepo(ctx)`), trả Promise, ném `NotFoundError` / `ForbiddenError` / `ValidationError { fieldErrors }` từ `src/domain/errors.ts`. Hook hiển thị lỗi bằng toast tiếng Việt hoặc dưới ô nhập.

---

### Task 1: Khởi tạo dự án và khung giao diện

**Files:**
- Create: dự án Next.js tại thư mục gốc (giữ `README.md`, `docs/`), `vitest.config.ts`, `playwright.config.ts`, `src/app/(app)/layout.tsx`, `src/components/app-shell/{sidebar.tsx,topbar.tsx,demo-banner.tsx,facility-switcher.tsx}`, `src/app/not-found.tsx`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `NAV_ITEMS: { href: string; label: string; icon: LucideIcon; requires?: Permission }[]` (`src/components/app-shell/nav.ts`) — Nhắc việc `/`, Cơ sở & phòng `/facilities`, Khách thuê `/tenants` (tenants_contracts), Hợp đồng `/contracts` (tenants_contracts), Điện nước `/meters` (meters), Hoá đơn `/invoices` (billing), Tài sản `/assets` (assets), Sự cố `/incidents` (incidents), Người dùng `/users`, Mẫu giấy tờ `/templates`, Nhập dữ liệu `/import`, Cài đặt `/settings`, Nhật ký `/audit` (5 mục cuối: settings).

- [ ] **Step 1:** `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes` (thư mục không trống → tạo ở thư mục tạm rồi chép vào, giữ `README.md`/`docs/`). Cài `@tanstack/react-query zustand idb-keyval zod react-hook-form @hookform/resolvers lucide-react date-fns` và dev `vitest vite-tsconfig-paths @playwright/test tsx`. `npx shadcn@latest init --yes`; thêm button, input, select, checkbox, dialog, sheet, table, tabs, badge, card, dropdown-menu, sonner, form, textarea, popover, calendar, command.
- [ ] **Step 2:** Font Be Vietnam Pro (next/font/google, subset `vietnamese`). Khung: thanh bên trái (thu thành menu trượt dưới 768px), thanh trên có bộ chọn cơ sở ("Tất cả cơ sở" hoặc một cơ sở) và tên người dùng + "Đổi người dùng", dải demo-banner. Tạm hiện mọi mục menu (lọc quyền ở Task 3).
- [ ] **Step 3:** Playwright `shell.spec.ts`: mở `/` thấy dải "Bản xem thử"; ở viewport 390×844 menu mở được bằng nút ☰.
- [ ] **Step 4:** `npm run build` OK, `npx playwright test shell` PASS.
- [ ] **Step 5:** Commit `chore: khởi tạo Next.js, shadcn, khung giao diện`.

### Task 2: Kiểu dữ liệu, dữ liệu giả, MockRepo

**Files:**
- Create: `src/domain/types.ts`, `src/domain/errors.ts`, `src/data/repo.ts`, `src/data/mock/seed.ts`, `src/data/mock/store.ts`, `src/data/mock/mock-repo.ts`, `src/data/mock/files.ts`, `src/data/repo-provider.tsx`, `src/data/hooks/*.ts`
- Test: `tests/unit/mock-repo.test.ts`

**Interfaces:**
- Produces `types.ts` (mọi id là string uuid; ngày `ISODate = string`; tiền `number` nguyên):
  - `Facility { id, code, name, address, note, isActive, expectedInvoiceDay: number /*1–28*/ }`
  - `Room { id, facilityId, code, floor, roomType, areaM2?, listPrice?, capacity?, note, isActive }`
  - `Tenant` = discriminated union theo `kind: 'foreign'|'vietnamese'|'company'` với các trường đúng spec 6.2, chung `{ id, homeFacilityId, phone?, email?, note, documents: FileRef[] }`
  - `FileRef { id, name, contentType, thumbId?, createdAt }`
  - `User { id, email, fullName, isActive, facilityIds: string[], permissions: Permission[] }`
  - `FeeUnit { id, name }`; `FeeType { id, name, unitId, defaultPrice, billing: 'monthly_fixed'|'per_occurrence', quantityFrom: 'manual'|'occupants' }`
  - `UtilityRate { id, facilityId, utility: 'electric'|'water', pricePerUnit, effectiveFrom: ISODate }`
  - `Meter { id, roomId, utility, serial?, installedOn: ISODate, startReading: number, removedOn?: ISODate, finalReading?: number }`
  - `MeterReading { id, meterId, readOn: ISODate, value: number, period: 'YYYY-MM' }`
  - `ContractFee { feeTypeId, quantity, unitPrice }`
  - `DepositContract { id, roomId, tenantId, depositAmount, agreedRent, expectedMoveIn: ISODate, status: 'pending'|'converted'|'cancelled', cancelOutcome?: 'forfeit'|'refund', signStatus: SignStatus, signedFileId? }`
  - `Lease { id, code, roomId, tenantId, occupantIds: string[], startDate, endDate, monthlyRent, depositAmount, fees: ContractFee[], dueRule?: DueRule, proration?: Proration, fromDepositContractId?, status: 'active'|'ended', signStatus: SignStatus, signedFileId? }`
  - `Addendum { id, leaseId, type: 'extension'|'transfer'|'termination', effectiveDate, newEndDate?, newRoomId?, newMonthlyRent?, newDepositAmount?, newFees?: ContractFee[], newOccupantIds?: string[], depositForfeit?: { mode: 'all'|'partial'|'none'; amount?: number }, signStatus, signedFileId? }`
  - `SignStatus = 'draft'|'exported'|'signed'`
  - `Handover { id, leaseId, roomId, kind: 'check_in'|'check_out', date, items: { assetId, condition: string, photoIds: string[], damaged?: boolean, missing?: boolean, penalty?: number }[], meterReadings: { meterId, value }[] }`
  - `Invoice { id, code, leaseId, facilityId, kind: 'monthly'|'first'|'termination'|'deposit_topup', periodStart, periodEnd, issueDate?, dueDate?, status: 'draft'|'approved', lines: InvoiceLine[], note }` (đã thu một phần / đủ suy ra từ `payments`)
  - `InvoiceLine { id, type: 'rent'|'fee'|'electric'|'water'|'one_off'|'penalty'|'adjustment'|'deposit'|'deposit_offset', description, quantity, unitPrice, amount, meta?: Record<string, unknown> }`
  - `Payment { id, invoiceId, paidOn, amount, method: 'cash'|'transfer'|'other', receivedBy, note }`
  - `DepositEntry { id, leaseId?, depositContractId?, date, type: 'collect'|'topup'|'deduct'|'refund'|'forfeit', amount /*dương*/, status: 'pending'|'done', note }`
  - `OneOffCharge { id, leaseId, feeTypeId?, description, date, quantity, unitPrice, invoicedInId? }`
  - `PendingAdjustment { id, leaseId, description, amount /*có dấu*/, sourceKey: string /*chống lặp*/, invoicedInId? }`
  - `Asset { id, code, name, category, value, condition, location: { kind: 'room'|'common'|'warehouse'; id: string /*roomId|facilityId*/ }, status: 'in_use'|'broken'|'disposed' }`
  - `AssetMove { id, assetId, from, to, movedAt, by, reason }`
  - `Incident { id, facilityId, roomId?, assetId?, title, description, photoIds, priority: 'low'|'normal'|'high', status: 'new'|'in_progress'|'done'|'cancelled', reportedBy, assigneeId?, cost?, chargeToTenant: boolean, chargedInvoiceId?, createdAt }`
  - `DocTemplate { id, docType: DocType, name, fileId, isDefault }`; `DocType = 'deposit_contract'|'lease'|'addendum_extension'|'addendum_transfer'|'addendum_termination'|'handover_check_in'|'handover_check_out'|'invoice_monthly'|'invoice_termination'|'receipt'`
  - `Settings { visaWarningDays: 30, contractWarningDays: 30, proration: Proration, dueRule: DueRule, photoRetentionDays: 30 }`; `Proration = 'days_30'|'actual_days'`; `DueRule = { kind: 'day_of_next_month'; day: number } | { kind: 'days_after_approval'; days: number }` (mặc định `days_after_approval`, 5).
  - `AuditEntry { id, at, userId, action, entity, entityId, summary }`
- Produces `repo.ts`: `interface Repo` gồm nhóm phương thức theo module (`facilities`, `rooms`, `tenants`, `users`, `contracts`, `handovers`, `meters`, `invoices`, `payments`, `deposits`, `assets`, `incidents`, `templates`, `settings`, `files`, `audit`, `reminders`, `import`) — mỗi task sau thêm phương thức của mình vào interface **và** MockRepo cùng lúc. Task này định nghĩa `facilities.list/get`, `rooms.list/get`, `users.list`, `session.listDemoUsers()`.
- `seed.ts`: `buildSeed(today: ISODate): MockState` — 2 cơ sở (TD Thảo Điền: tầng 1–4 × 6 phòng; BT Bình Thạnh: tầng 1–4 × 4 phòng), 30 khách (14 nước ngoài với visa hết hạn tương đối −5, 0, 3, 9, 16, 24, 29, 30, 45, 70, 120, 200, 260, 330 ngày; 12 Việt Nam; 4 công ty), ~26 hợp đồng thuê đang chạy (vài cái hết hạn trong 30 ngày, 2 cái chưa ký), 3 hợp đồng cọc chờ, đồng hồ + chỉ số 3 tháng gần nhất, hoá đơn 2 tháng gần nhất (vài cái quá hạn chưa thu), sổ cọc, ~120 tài sản (phòng + khu chung + kho), 8 sự cố các trạng thái, 6 loại phí (Phí dịch vụ/người, Gửi xe máy/xe, Internet/phòng, Giặt ủi/kg, Dọn phòng thêm/lần, Nước/người), đơn giá điện 3.500đ/kWh và nước 18.000đ/m³ (có một lần đổi giá điện từ tháng này), 5 người dùng (Admin; Lan — Quản lý TD: tenants_contracts+billing; Minh — Kế toán cả hai: billing; Hùng — Kỹ thuật BT: meters+assets+incidents; Vy — Lễ tân TD: tenants_contracts+meters). Tên/số giấy tờ đều bịa; dùng PRNG có seed cố định để mọi lần tạo giống nhau.
- `store.ts`: Zustand + `persist` (key `siris-demo-v1`, có `version`; `migrate`/parse lỗi → `buildSeed`), `resetDemo()`. File nhị phân lưu IndexedDB qua `files.ts` (`putFile(blob): Promise<string>`, `getFileUrl(id)`).
- `repo-provider.tsx`: `RepoProvider`, `useRepo(): Repo`, `useSession(): { user: User; ctx: AccessContext; switchUser(id) }`; người dùng đang chọn lưu `localStorage`.

- [ ] **Step 1:** Viết test: `buildSeed('2026-11-16')` có 40 phòng, 30 khách (14/12/4), 5 người dùng; gọi hai lần cho kết quả giống hệt; mỗi phòng ≤1 lease active và ≤1 deposit contract pending; store với JSON hỏng trong localStorage → khởi tạo lại từ seed không ném lỗi.
- [ ] **Step 2:** `npx vitest run mock-repo` → FAIL. **Step 3:** Cài đặt. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(data): kiểu dữ liệu, dữ liệu giả, MockRepo`.

### Task 3: Phân quyền, đăng nhập giả, tiện ích dữ liệu

**Files:**
- Create: `src/domain/access.ts`, `src/domain/phone.ts`, `src/domain/dates.ts`, `src/domain/text.ts`, `src/domain/money.ts`, `src/app/login/page.tsx`, `src/components/require-permission.tsx`
- Modify: `src/components/app-shell/sidebar.tsx` (lọc theo quyền), `src/data/mock/mock-repo.ts` (mọi phương thức gọi `assertCan`)
- Test: `tests/unit/domain/access.test.ts`, `phone.test.ts`, `dates.test.ts`, `text.test.ts`, `money.test.ts`, `tests/e2e/permissions.spec.ts`

**Interfaces:**
- Produces:
  - `PERMISSIONS`, `Permission`, `PERMISSION_LABELS` (Khách & hợp đồng, Hoá đơn & thu tiền, Ghi điện nước, Tài sản & kho, Sự cố & sửa chữa, Cài đặt).
  - `AccessContext { userId; fullName; permissions: Set<Permission>; facilityIds: Set<string>; isAdmin }`, `toAccessContext(user: User): AccessContext`.
  - `can(ctx, perm, facilityId?)`, `assertCan(ctx, perm, facilityId?)` (sai cơ sở → `NotFoundError`, thiếu quyền → `ForbiddenError`), `facilityScope(ctx): string[] | 'all'`, `canViewTenantIdentity(ctx, facilityId)` (= `can(ctx,'tenants_contracts',facilityId)`), `maskId(s)` → `•••••1234`.
  - `normalizePhone(input): string | null`, `todayVN(now?)`, `parseFlexibleDate(input)`, `formatDateVN(iso)`, `addDays(iso, n)`, `daysInMonth('YYYY-MM')`, `diffDays(a, b)`, `removeDiacritics`, `buildSearchText(parts)`, `formatVND(n)`, `numberToVietnameseWords(n)` ("Một triệu năm trăm nghìn đồng").
  - `<RequirePermission perm facilityId?>` hiển thị trang "Không tìm thấy" khi không đủ quyền.

- [ ] **Step 1: Viết test**

```ts
expect(normalizePhone('0901 234 567')).toBe('+84901234567')
expect(normalizePhone('84901234567')).toBe('+84901234567')
expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100')
expect(normalizePhone('12345')).toBeNull()
expect(todayVN(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16')
expect(parseFlexibleDate('05/03/2027')).toBe('2027-03-05')
expect(parseFlexibleDate(46451)).toBe('2027-03-05')
expect(parseFlexibleDate('31/02/2027')).toBeNull()
expect(removeDiacritics('Nguyễn Văn Đức')).toBe('Nguyen Van Duc')
expect(buildSearchText(['Nguyễn  Văn A', '+84901234567'])).toBe('nguyen van a +84901234567 0901234567')
expect(formatVND(1500000)).toBe('1.500.000')
expect(numberToVietnameseWords(1500000)).toBe('Một triệu năm trăm nghìn đồng')
expect(numberToVietnameseWords(2005000)).toBe('Hai triệu không trăm linh năm nghìn đồng')
// access: ctx meters@A → can meters A true, meters B false, billing A false; settings → all true, scope 'all'
```

- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt; trang `/login` hiện 5 thẻ người dùng mẫu (tên, vai trò tóm tắt, cơ sở) — bấm để vào; menu lọc theo `can`.
- [ ] **Step 4:** Playwright `permissions.spec.ts`: đăng nhập "Hùng — Kỹ thuật BT" → menu không có Khách thuê/Hoá đơn; mở thẳng `/tenants` → "Không tìm thấy"; bộ chọn cơ sở chỉ có Bình Thạnh. Unit + e2e PASS.
- [ ] **Step 5:** Commit `feat(access): phân quyền, đăng nhập giả, tiện ích ngày/điện thoại/tiền`.

### Task 4: Lõi tính tiền (hàm thuần)

**Files:**
- Create: `src/domain/proration.ts`, `meters.ts`, `rates.ts`, `due-date.ts`, `adjustments.ts`, `invoice-builder.ts`, `deposit.ts`, `liquidation.ts`, `contract-terms.ts`
- Test: `tests/unit/domain/billing.test.ts` (một file mỗi module là được)

**Interfaces:**
- Produces:
  - `prorate(monthly: number, from: ISODate, to: ISODate, mode: Proration): { coefficient: number; amount: number }` — `from..to` tính cả hai đầu; cộng từng tháng dương lịch: tháng đủ = 1, tháng thiếu = số ngày / (30 hoặc số ngày thực của tháng); `coefficient` làm tròn 4 chữ số; `amount = Math.round(monthly × Σ)`; `to < from` → `{0,0}`.
  - `fullMonthCoefficient(from, to): number` — số tháng chạm tới (dùng khi bật "tính full tháng").
  - `meterUsage(meters: Meter[], readings: MeterReading[], periodStart, periodEnd): { usage: number; segments: { meterId; start; end }[] }` — cộng phần chạy trên từng đồng hồ có hiệu lực trong kỳ (đồng hồ gỡ giữa kỳ dùng `finalReading`, đồng hồ mới bắt đầu từ `startReading`); chỉ số giảm trong cùng đồng hồ → ném `ValidationError('Chỉ số mới nhỏ hơn chỉ số cũ')`.
  - `rateFor(rates: UtilityRate[], facilityId, utility, periodStart): number` — mức có `effectiveFrom` lớn nhất ≤ `periodStart`; không có → `ValidationError('Chưa cài đơn giá')`.
  - `computeDueDate(rule: DueRule, approvedOn: ISODate): ISODate` — `day_of_next_month` với ngày > số ngày tháng sau → ngày cuối tháng.
  - `contractTermsAt(lease: Lease, addenda: Addendum[], date: ISODate): { roomId; monthlyRent; depositAmount; fees: ContractFee[]; occupantIds; endDate }` — hợp đồng gốc + phụ lục có `effectiveDate ≤ date`, áp theo thứ tự ngày.
  - `midPeriodAdjustments(input: { lease; addenda; approvedInvoices: Invoice[]; settings }): PendingAdjustment[]` — với mỗi phụ lục có hiệu lực **bên trong** kỳ của một hoá đơn đã duyệt: chênh lệch tiền phòng và phí cố định cho số ngày còn lại của kỳ (theo `prorate`), `sourceKey = \`${addendumId}:${invoiceId}\``; **ngoại lệ trả trước nhiều tháng**: nếu hoá đơn đã duyệt có `periodEnd` vượt quá tháng của phụ lục và là thay đổi *giá* do gia hạn (không phải chuyển phòng/đổi người), không sinh điều chỉnh cho phần đã trả (giữ giá cũ).
  - `buildMonthlyInvoice(input: { lease; addenda; period: 'YYYY-MM'; settings; meters; readings; rates; oneOffs: OneOffCharge[]; pending: PendingAdjustment[]; occupantsCount: number; overridePeriod?: { start; end; coefficient? }; fullMonth?: boolean }): { lines: InvoiceLine[]; periodStart; periodEnd; warnings: string[] }` — dòng `rent` + `fee` (monthly_fixed, số lượng `occupants` lấy theo số người ở) cho **kỳ N** (hoặc khoảng sửa tay với hệ số); `electric`/`water` cho **tháng N−1** (bỏ qua nếu hợp đồng bắt đầu trong tháng N); `one_off` chưa xuất hoá đơn có ngày ≤ cuối tháng N−1; `adjustment` từ `pending` chưa xuất. Hợp đồng bắt đầu/kết thúc giữa kỳ → `prorate` (trừ khi `fullMonth`).
  - `buildFirstInvoice(lease, settings, depositCollected: number): InvoiceLine[]` — tiền cọc còn thiếu (`deposit`) + tiền phòng/phí từ `startDate` tới cuối tháng.
  - `depositBalance(entries: DepositEntry[]): number` (chỉ `done`; collect/topup cộng, deduct/refund/forfeit trừ); `depositDiffEntry(oldAmount, newAmount, date): DepositEntry | null` (topup hoặc refund, `pending`).
  - `buildTerminationInvoice(input: { lease; addenda; endDate; approvedInvoices; meters; readings; rates; oneOffs; pending; penalties: { description; amount }[]; unpaidTotal: number; depositBalance: number; forfeit: { mode; amount? }; settings }): { lines: InvoiceLine[]; total: number /* >0 khách trả thêm, <0 hoàn khách */ }` — tiền phòng đã trả trước vượt `endDate` → dòng hoàn (âm); điện nước từ đầu tháng tới `endDate`; phí phạt; nợ cũ; `deposit_offset` = −(số dư cọc − phần mất cọc).

- [ ] **Step 1: Viết test (giá trị lấy từ spec)**

```ts
// lẻ ngày: vào 15/10/2026, giá 9.000.000
expect(prorate(9_000_000,'2026-10-15','2026-10-31','actual_days')).toEqual({ coefficient: 0.5484, amount: 4_935_484 })
expect(prorate(9_000_000,'2026-10-15','2026-10-31','days_30')).toEqual({ coefficient: 0.5667, amount: 5_100_000 })
expect(prorate(9_000_000,'2026-10-01','2026-12-31','actual_days').coefficient).toBe(3)      // trả 3 tháng
expect(prorate(9_000_000,'2028-02-15','2028-02-29','actual_days').amount).toBe(4_655_172)    // năm nhuận 15/29
expect(prorate(9_000_000,'2026-10-20','2026-10-10','actual_days')).toEqual({ coefficient: 0, amount: 0 })
// thay đồng hồ: cũ 1200→1260 (gỡ 20/10), mới 0→45 cuối tháng
expect(meterUsage(meters, readings,'2026-10-01','2026-10-31').usage).toBe(105)
// chỉ số giảm cùng đồng hồ
expect(() => meterUsage(m1, [{value:1200},{value:1190}], …)).toThrow('Chỉ số mới nhỏ hơn chỉ số cũ')
// đổi giá điện từ 01/11: kỳ tháng 10 vẫn 3.500, kỳ tháng 11 là 3.800
expect(rateFor(rates,'TD','electric','2026-10-01')).toBe(3500)
expect(rateFor(rates,'TD','electric','2026-11-01')).toBe(3800)
// hạn thanh toán
expect(computeDueDate({kind:'days_after_approval',days:5},'2026-11-03')).toBe('2026-11-08')
expect(computeDueDate({kind:'day_of_next_month',day:31},'2027-01-20')).toBe('2027-02-28')
// chuyển phòng 15/11 từ 9tr sang 11tr, hoá đơn tháng 11 (days_30) đã duyệt → +1.066.667, chạy lại không sinh thêm (cùng sourceKey)
// gia hạn tăng giá 9tr→10tr từ 01/12, khách đã trả trước tới 31/12 → không sinh điều chỉnh
// gia hạn tăng tiền cọc 9tr→10tr → depositDiffEntry = topup 1.000.000 pending
// hoá đơn tháng 11: tiền phòng tháng 11 + điện nước tháng 10 + giặt ủi tháng 10 + điều chỉnh đang chờ
// thanh lý 20/11 (days_30), đã trả tháng 11 đủ 9tr, cọc 9tr, điện nước 420.000, phạt 500.000, không mất cọc
//   → total = -11_080_000 (hoàn khách: 9.000.000 + 3.000.000 − 420.000 − 500.000)
// cùng ca nhưng mất cọc toàn bộ → total = -2_080_000
```

- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt. **Step 4:** PASS (`npx vitest run domain`).
- [ ] **Step 5:** Commit `feat(domain): lõi tính tiền — lẻ ngày, điện nước, điều chỉnh, sổ cọc, thanh lý`.

### Task 5: Người dùng và cài đặt

**Files:**
- Create: `src/features/users/components/{user-table.tsx,user-sheet.tsx}`, `src/app/(app)/users/page.tsx`, `src/features/settings/components/*`, `src/app/(app)/settings/page.tsx`, `tests/e2e/users-settings.spec.ts`
- Modify: `src/data/repo.ts`, `src/data/mock/mock-repo.ts`

**Interfaces:**
- Produces Repo: `users.list/create/update/setActive`, `settings.get/update`, `feeUnits.list/create/update`, `feeTypes.list/create/update/archive`, `rates.list/create` (theo cơ sở + loại, có ngày hiệu lực), `facilities.create/update`, `audit.list({ entity?, userId? })`. Mọi thao tác ghi thêm `AuditEntry`.
- Quy tắc: admin không tự gỡ `settings` của mình ("Không thể tự gỡ quyền quản trị của chính bạn").

- [ ] **Step 1:** Playwright: Admin mở Người dùng → sửa "Vy" tick thêm "Hoá đơn & thu tiền" → lưu → đổi sang người dùng Vy → menu có "Hoá đơn". Admin thử bỏ tick "Cài đặt" của chính mình → thấy lỗi.
- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt UI:
  - Người dùng: bảng (tên, email, cơ sở, quyền dạng badge, trạng thái); Sheet với 2 nhóm checkbox "Cơ sở được truy cập" và "Nhóm quyền" kèm mô tả một dòng; tick Cài đặt hiện "Thấy mọi cơ sở".
  - Cài đặt (tabs): *Chung* (ngưỡng visa/hợp đồng, cách tính lẻ ngày, quy tắc hạn thanh toán mặc định: radio "Ngày __ của tháng sau" / "__ ngày sau khi duyệt", số ngày giữ ảnh sau thanh lý); *Cơ sở* (thêm/sửa, ngày tạo hoá đơn dự kiến); *Đơn vị & loại phí*; *Đơn giá điện nước* (bảng lịch sử theo cơ sở, thêm mức mới với ngày hiệu lực); trang `/audit` bảng nhật ký.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): người dùng, cài đặt, loại phí, đơn giá, nhật ký`.

### Task 6: Cơ sở và phòng

**Files:**
- Create: `src/app/(app)/facilities/page.tsx`, `src/app/(app)/facilities/[id]/page.tsx`, `src/app/(app)/rooms/[id]/page.tsx`, `src/features/rooms/components/{room-map.tsx,room-sheet.tsx,bulk-rooms-dialog.tsx}`, `src/domain/room-status.ts`, `tests/unit/domain/room-status.test.ts`, `tests/e2e/rooms.spec.ts`

**Interfaces:**
- Produces: `roomStatus(room, leases, depositContracts, today, contractWarningDays): 'vacant'|'deposited'|'occupied'|'ending_soon'|'occupied_with_next'` (nhãn: Trống / Đã cọc / Đang ở / Sắp trả / Đang ở · có cọc chờ). Repo: `rooms.create/update/setActive/createBulk({ facilityId, prefix?, floor, from, to, roomType?, listPrice?, capacity? }) → { created; skipped: string[] }`.

- [ ] **Step 1:** Unit test `roomStatus` cho 5 trạng thái; Playwright: Admin tạo nhanh phòng tầng 5, 501–503 ở Thảo Điền → sơ đồ có 3 ô "Trống"; tạo lại 501–504 → báo "Đã tạo 1, bỏ qua 501, 502, 503"; Lan mở URL phòng của Bình Thạnh → "Không tìm thấy".
- [ ] **Step 2:** FAIL. **Step 3:** UI: trang cơ sở = thẻ số liệu (tổng phòng, đang ở, trống, đã cọc, sắp trả) + **sơ đồ phòng theo tầng** (ô màu theo trạng thái, tên khách rút gọn — ẩn tên nếu không `canViewTenantIdentity`), lọc trạng thái; trang phòng: thông tin, hợp đồng hiện tại + cọc chờ, tài sản trong phòng, đồng hồ & chỉ số gần nhất, sự cố, lịch sử hợp đồng; nút tắt "Tạo hợp đồng cọc", "Tạo hợp đồng thuê", "Báo sự cố".
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): cơ sở, sơ đồ phòng, chi tiết phòng`.

### Task 7: Khách thuê

**Files:**
- Create: `src/app/(app)/tenants/page.tsx`, `src/app/(app)/tenants/[id]/page.tsx`, `src/features/tenants/{schemas.ts,components/tenant-form.tsx,components/tenant-table.tsx,components/tenant-documents.tsx}`, `src/lib/image.ts`, `tests/unit/tenant-schema.test.ts`, `tests/e2e/tenants.spec.ts`

**Interfaces:**
- Produces: `tenantInput` (zod discriminated union; CCCD 12 số; mã số thuế 10 hoặc 13 số, cho phép `-`; phone bắt buộc với cá nhân, tuỳ chọn với công ty), Repo `tenants.search({ q, kind?, facilityId? })` (khớp `buildSearchText`), `tenants.get/create/update`, `tenants.addDocument(id, file)`, `tenants.removeDocument(id, fileId)`; lỗi trùng: "Số điện thoại đã thuộc về khách khác", "Số passport đã tồn tại", "Số CCCD đã tồn tại", "Mã số thuế đã tồn tại". `compressImage(file): Promise<{ main: Blob; thumb: Blob }>` (1600px/0.75 và 300px).

- [ ] **Step 1:** Unit test schema (CCCD 11 số lỗi, foreign thiếu passport lỗi `passportNumber`); Playwright: tìm `nguyen van an` ra "Nguyễn Văn An"; thêm khách nước ngoài với SĐT `0901 234 567` trùng khách có sẵn → thấy lỗi trùng dưới ô; đổi số → lưu → mở trang chi tiết; tải một ảnh → thấy thumbnail.
- [ ] **Step 2:** FAIL. **Step 3:** UI: bảng (tên, loại, SĐT, giấy tờ, cơ sở, phòng đang ở, visa còn N ngày tô màu đỏ ≤7/cam ≤ngưỡng), tìm kiếm debounce, lọc; form chọn loại trước (3 nút lớn) rồi hiện trường, dưới ô SĐT hiện "Sẽ lưu: +84 90 123 4567"; trang chi tiết: thông tin theo loại, ảnh giấy tờ (chụp/tải, xem lớn), hợp đồng hiện tại & lịch sử, công nợ, nút "Tạo hợp đồng cọc/thuê".
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): khách thuê 3 loại, tìm không dấu, ảnh giấy tờ`.

### Task 8: Mẫu giấy tờ Word

**Files:**
- Create: `src/domain/template-fields.ts`, `src/lib/docx.ts`, `scripts/build-sample-templates.ts`, `public/templates/*.docx`, `src/app/(app)/templates/page.tsx`, `src/features/templates/components/*`, `tests/unit/domain/template-fields.test.ts`, `tests/unit/docx.test.ts`

**Interfaces:**
- Produces:
  - `TEMPLATE_FIELDS: Record<DocType, { key: string; label: string; example: string; loop?: { key: string; fields: {key;label;example}[] } }[]>` — ví dụ lease: `ten_khach, loai_khach, so_giay_to, so_dien_thoai, email, ten_cong_ty, ma_so_thue, co_so, dia_chi_co_so, so_phong, ngay_bat_dau, ngay_ket_thuc, gia_thue, gia_thue_bang_chu, tien_coc, tien_coc_bang_chu, ngay_lap`, vòng lặp `phi_dich_vu[] {ten, don_vi, so_luong, don_gia}`, `nguoi_o[] {ho_ten, giay_to}`; invoice: `ma_hoa_don, ky, ngay_lap, han_thanh_toan, tong_tien, tong_tien_bang_chu`, vòng lặp `dong[] {mo_ta, so_luong, don_gia, thanh_tien}`; handover: `tai_san[] {ma, ten, tinh_trang, phat}`, `chi_so[] {loai, so_dong_ho, chi_so}`.
  - `buildTemplateData(docType, entities): Record<string, unknown>` (định dạng tiền, ngày, bằng chữ).
  - `renderDocx(templateBuf: ArrayBuffer, data): Blob` (docxtemplater, delimiters `{` `}`, `paragraphLoop: true`; chỗ điền không có dữ liệu → để trống, liệt kê trong `warnings`).
  - Repo `templates.list/upload(docType, name, file)/setDefault/remove`.

- [ ] **Step 1:** Test: `buildTemplateData('lease', …)` có `gia_thue = '9.000.000'`, `gia_thue_bang_chu = 'Chín triệu đồng'`, `ngay_bat_dau = '15/10/2026'`; `renderDocx` với mẫu mẫu `lease.docx` không ném lỗi và kết quả chứa "Chín triệu đồng" (đọc lại bằng pizzip).
- [ ] **Step 2:** FAIL. **Step 3:** Script sinh mẫu mẫu (thư viện `docx`, dev dependency) cho cả 10 loại; trang Mẫu giấy tờ: danh sách theo loại, tải lên `.docx`, đặt mặc định, xem **bảng chỗ điền** (mã, ý nghĩa, ví dụ, nút sao chép `{mã}`), "Thử xuất với dữ liệu mẫu".
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(templates): mẫu Word, bảng chỗ điền, xuất docx`.

### Task 9: Hợp đồng cọc và hợp đồng thuê

**Files:**
- Create: `src/app/(app)/contracts/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `src/features/contracts/components/{deposit-form.tsx,lease-wizard.tsx,contract-summary.tsx,sign-status.tsx,export-menu.tsx}`, `tests/e2e/contracts.spec.ts`

**Interfaces:**
- Produces Repo: `deposits.createContract/cancel(id, outcome)/convertToLease(id, leaseInput)`, `leases.list({ status?, facilityId?, expiringWithinDays? })/get/create/updateDraft`, `contracts.setSignStatus(kind, id, status, signedFile?)`, `contracts.export(kind, id, templateId) → Blob`. Ràng buộc: phòng đã có lease active và tạo lease mới chồng ngày → `ValidationError`; cọc chờ có `expectedMoveIn` < `endDate` của lease hiện tại → cảnh báo (vẫn cho lưu). Tạo lease → tự tạo hoá đơn đầu tiên nháp (`buildFirstInvoice`) và dòng sổ cọc.

- [ ] **Step 1:** Playwright: tạo hợp đồng cọc cho phòng trống → phòng chuyển "Đã cọc"; chuyển thành hợp đồng thuê qua wizard (bước: bên thuê & người ở → thời hạn & giá → phí dịch vụ (chọn loại phí, số lượng; phí theo người tự lấy số người ở) → hạn thanh toán & cách tính lẻ ngày → xem lại) → có hoá đơn đầu tiên nháp; xuất Word tải được file; đánh dấu "Đã ký" + đính kèm file → nhắc "chưa ký" biến mất.
- [ ] **Step 2:** FAIL. **Step 3:** UI: danh sách hợp đồng (lọc: đang hiệu lực / sắp hết hạn / chưa ký / đã kết thúc / cọc chờ); trang hợp đồng có tab Tổng quan · Phụ lục · Bàn giao · Hoá đơn · Sổ cọc · Giấy tờ; dải trạng thái ký với các bước Nháp → Đã xuất → Đã ký.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): hợp đồng cọc, hợp đồng thuê, trạng thái ký`.

### Task 10: Bàn giao check-in / check-out

**Files:**
- Create: `src/app/(app)/handovers/[id]/page.tsx`, `src/features/handovers/components/{handover-form.tsx,asset-condition-row.tsx}`, `tests/e2e/handover.spec.ts`

**Interfaces:**
- Produces Repo: `handovers.start(leaseId, kind) → Handover` (check-in: lấy tài sản đang ở phòng; check-out: sao danh sách từ check-in), `handovers.save(h)`, `handovers.export(id, templateId)`. Check-out: món `damaged/missing` có `penalty` (gợi ý = giá trị tài sản nếu mất). Lưu chỉ số đồng hồ → tạo `MeterReading`.

- [ ] **Step 1:** Playwright (viewport điện thoại): check-in cho hợp đồng vừa tạo → mỗi tài sản chọn tình trạng (Tốt / Trầy xước / Hư — ghi chú) + chụp ảnh (file test) → nhập chỉ số điện nước → lưu → xuất Word; check-out: đánh dấu 1 món hư, phạt 500.000 → tổng phạt hiện 500.000.
- [ ] **Step 2:** FAIL. **Step 3:** UI dạng danh sách dọc dễ bấm trên điện thoại; so sánh check-in/check-out cạnh nhau.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): biên bản bàn giao check-in, check-out`.

### Task 11: Phụ lục — gia hạn, chuyển phòng, thanh lý

**Files:**
- Create: `src/features/contracts/components/{extension-dialog.tsx,transfer-wizard.tsx,termination-wizard.tsx}`, `tests/e2e/addenda.spec.ts`

**Interfaces:**
- Consumes: `contractTermsAt`, `depositDiffEntry`, `midPeriodAdjustments`, `buildTerminationInvoice`.
- Produces Repo: `addenda.createExtension(leaseId, { effectiveDate, newEndDate, newMonthlyRent?, newDepositAmount?, newFees? })` (sinh `DepositEntry` pending nếu cọc đổi; tính `PendingAdjustment`), `addenda.createTransfer(leaseId, { effectiveDate, newRoomId, newMonthlyRent?, newFees? })` (yêu cầu phòng đích trống hoặc chỉ có cọc chờ của chính khách này; tạo check-out phòng cũ + check-in phòng mới; chốt chỉ số; điều chỉnh giữa kỳ), `addenda.createTermination(leaseId, { endDate, forfeit })` → chạy check-out → tạo hoá đơn thanh lý nháp; khi hoá đơn thanh lý được duyệt → lease `ended`, phòng về Trống (hoặc Đã cọc nếu có cọc chờ).

- [ ] **Step 1:** Playwright: gia hạn tăng giá 9tr→10tr và cọc 9tr→10tr → sổ cọc có "Thu cọc bổ sung 1.000.000 — chờ thu"; chuyển phòng 15/11 sang phòng 11tr → hoá đơn kỳ sau có dòng "Điều chỉnh chuyển phòng 15/11–30/11" +1.066.667 (cài đặt days_30); thanh lý với phạt 500.000, không mất cọc → hoá đơn thanh lý hiện "Hoàn khách 11.080.000"; chọn "Mất cọc toàn bộ" → "Hoàn khách 2.080.000".
- [ ] **Step 2:** FAIL. **Step 3:** UI: mỗi phụ lục là wizard ngắn có bước "Xem trước tiền" trước khi lưu; phụ lục có trạng thái ký và xuất Word như hợp đồng.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): phụ lục gia hạn, chuyển phòng, thanh lý`.

### Task 12: Điện nước

**Files:**
- Create: `src/app/(app)/meters/page.tsx`, `src/features/meters/components/{reading-grid.tsx,replace-meter-dialog.tsx,meter-history.tsx}`, `tests/e2e/meters.spec.ts`

**Interfaces:**
- Produces Repo: `meters.listByFacility(facilityId, period)` → mỗi phòng: đồng hồ hiện tại, chỉ số kỳ trước, chỉ số kỳ này (nếu có), tiêu thụ; `meters.saveReadings(period, { meterId, value, readOn }[])` (validate qua `meterUsage`, trả lỗi theo từng dòng); `meters.replace(roomId, utility, { removedOn, finalReading, newSerial?, startReading })`.

- [ ] **Step 1:** Playwright: chọn Bình Thạnh, tháng này → nhập chỉ số cho 3 phòng bằng phím Enter chuyển ô; nhập chỉ số nhỏ hơn kỳ trước → ô đỏ "Chỉ số mới nhỏ hơn chỉ số cũ" và không lưu dòng đó; thay đồng hồ cho phòng 201 (cũ cuối 1260, mới đầu 0) rồi nhập 45 → tiêu thụ hiện đúng tổng hai đồng hồ.
- [ ] **Step 2:** FAIL. **Step 3:** UI: lưới nhập nhanh tối ưu điện thoại (bàn phím số), cột tiêu thụ và cảnh báo bất thường (> 2× trung bình 3 kỳ), tiến độ "Đã ghi 12/16 phòng".
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): ghi chỉ số điện nước, thay đồng hồ`.

### Task 13: Phí theo lần và sổ cọc

**Files:**
- Create: `src/features/charges/components/one-off-dialog.tsx`, `src/features/deposits/components/deposit-ledger.tsx`, `tests/e2e/charges-deposits.spec.ts`

**Interfaces:**
- Produces Repo: `oneOffs.create(leaseId, { feeTypeId?, description, date, quantity, unitPrice })/list(leaseId)/remove(id)` (không xoá được nếu đã vào hoá đơn đã duyệt), `deposits.list(leaseId)`, `deposits.markDone(entryId, { date, method })`, `deposits.addEntry(leaseId, entry)`.

- [ ] **Step 1:** Playwright: thêm "Giặt ủi 3kg × 25.000" cho một hợp đồng → hiện trong danh sách "Chưa tính"; sổ cọc: đánh dấu khoản thu bổ sung đã thu → số dư cọc tăng.
- [ ] **Step 2:** FAIL. **Step 3:** UI: nút "Thêm phí phát sinh" ở trang hợp đồng, trang phòng và trang hoá đơn; sổ cọc dạng bảng sổ (ngày, loại, số tiền, trạng thái, số dư luỹ kế).
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): phí phát sinh theo lần, sổ cọc`.

### Task 14: Hoá đơn và thu tiền

**Files:**
- Create: `src/app/(app)/invoices/page.tsx`, `generate/page.tsx`, `[id]/page.tsx`, `src/features/invoices/components/{generate-wizard.tsx,invoice-editor.tsx,payment-dialog.tsx,invoice-status.tsx}`, `tests/e2e/invoices.spec.ts`

**Interfaces:**
- Consumes: `buildMonthlyInvoice`, `computeDueDate`, `midPeriodAdjustments`.
- Produces Repo: `invoices.previewBatch({ facilityId, period }) → { leaseId; lines; warnings }[]` (cảnh báo: chưa ghi điện nước, chưa có đơn giá), `invoices.createDrafts(...)` (bỏ qua hợp đồng đã có hoá đơn kỳ đó), `invoices.get/list({ facilityId?, status?, period?, overdue? })`, `invoices.updateLines(id, lines)` (nháp và đã duyệt đều sửa được; đã duyệt → ghi nhật ký), `invoices.setPeriod(id, { start, end, coefficient?, fullMonth? })`, `invoices.approve(id, { dueRule? | dueDate? })`, `invoices.delete(id)` (đã có khoản thu → `ValidationError('Gỡ các khoản đã thu trước khi xoá')`; xoá trả các phí theo lần/điều chỉnh về "chưa tính"), `payments.create/remove`, `invoices.export(id, templateId)`. Trạng thái hiển thị: Nháp / Đã duyệt · Chưa thu / Thu một phần / Đã thu đủ / Quá hạn.

- [ ] **Step 1:** Playwright: Minh (kế toán) → Tạo hoá đơn → Thảo Điền, tháng 12 → xem trước có cảnh báo phòng chưa ghi điện nước → tạo nháp → mở một hoá đơn: dòng tiền phòng tháng 12 + điện nước tháng 11 + phí phát sinh → sửa kỳ thành 01/12–28/02 → hệ số 3 và tiền phòng ×3 → duyệt với "Ngày 5 của tháng sau" → hạn 05/01 → ghi thu một phần → trạng thái "Thu một phần" → thử xoá → báo lỗi gỡ khoản thu; Hùng (kỹ thuật) mở `/invoices` → "Không tìm thấy".
- [ ] **Step 2:** FAIL. **Step 3:** UI: danh sách với bộ lọc nhanh (Nháp, Chưa thu, Quá hạn, Kỳ); editor dòng hoá đơn dạng bảng sửa trực tiếp (thêm dòng, chọn loại phí, phạt, điều chỉnh); tóm tắt công nợ khách; menu Xuất: Word (chạy), PDF / Ảnh (báo "Có ở bản chính thức").
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): tạo hoá đơn hàng loạt, sửa, duyệt, thu tiền, công nợ`.

### Task 15: Tài sản và kho

**Files:**
- Create: `src/app/(app)/assets/page.tsx`, `[id]/page.tsx`, `src/features/assets/components/{asset-table.tsx,move-dialog.tsx,asset-form.tsx}`, `tests/e2e/assets.spec.ts`

**Interfaces:**
- Produces Repo: `assets.list({ facilityId?, location?, q?, status? })/get/create/update`, `assets.move(assetIds: string[], to: Location, reason)` (ghi `AssetMove` cho từng món), `assets.history(id)` (di chuyển + bàn giao + sự cố), `assets.setStatus(id, status)`.

- [ ] **Step 1:** Playwright: Hùng chọn kho Bình Thạnh → tick 2 máy lạnh → "Chuyển" → chọn phòng 301 → lý do → xong; trang phòng 301 có 2 máy lạnh; lịch sử từng máy có dòng "Kho → Phòng 301".
- [ ] **Step 2:** FAIL. **Step 3:** UI: cây vị trí bên trái (Cơ sở → Kho / Khu chung / Phòng), bảng bên phải, tick nhiều + thanh thao tác nổi "Chuyển N tài sản"; trên điện thoại chuyển bằng 3 chạm (chọn món → Chuyển → chọn nơi).
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): tài sản và kho, chuyển nhanh, lịch sử`.

### Task 16: Sự cố và sửa chữa

**Files:**
- Create: `src/app/(app)/incidents/page.tsx`, `[id]/page.tsx`, `src/features/incidents/components/{incident-form.tsx,incident-board.tsx}`, `tests/e2e/incidents.spec.ts`

**Interfaces:**
- Produces Repo: `incidents.list({ facilityId?, status?, assigneeId? })/get/create/update/setStatus`, `incidents.chargeTenant(id)` → tạo `OneOffCharge` loại phạt cho lease đang ở phòng đó (chỉ khi `chargeToTenant` và có `cost`); hoàn thành có thay thiết bị → gợi ý cập nhật tài sản.

- [ ] **Step 1:** Playwright: báo sự cố "Máy lạnh chảy nước" ở phòng 301, gắn tài sản, ưu tiên cao → giao Hùng → Đang xử lý → Xong với chi phí 350.000, "Do khách" → hoá đơn kỳ sau của phòng 301 có dòng phạt 350.000; lịch sử tài sản có sự cố này.
- [ ] **Step 2:** FAIL. **Step 3:** UI: bảng dạng cột theo trạng thái (Mới / Đang xử lý / Xong), lọc "Việc của tôi"; form ngắn tối ưu điện thoại có chụp ảnh.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): sự cố và sửa chữa, tính phí cho khách`.

### Task 17: Bảng nhắc việc

**Files:**
- Create: `src/domain/reminders.ts`, `tests/unit/domain/reminders.test.ts`, `src/app/(app)/page.tsx`, `src/features/dashboard/components/{reminder-card.tsx,stat-strip.tsx}`, `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Produces: `buildReminders(state: MockState-like snapshot, ctx: AccessContext, today: ISODate, settings): Reminder[]` với `Reminder { kind; title; count; items: { label; sub; href; severity: 'danger'|'warning'|'info' }[] }`, các loại (mỗi loại chỉ khi có quyền tương ứng, lọc theo cơ sở):
  - `overdue_invoices` (billing) — đã duyệt, quá `dueDate`, chưa thu đủ;
  - `visa_expiring` (tenants_contracts) — `visa_expiry ≤ today + visaWarningDays`, gồm đã hết hạn;
  - `contracts_ending` (tenants_contracts) — `endDate ≤ today + contractWarningDays`, chưa có phụ lục gia hạn/thanh lý;
  - `unsigned` (tenants_contracts) — hợp đồng/phụ lục `signStatus ≠ 'signed'`;
  - `meters_missing` (meters) — kỳ trước chưa ghi đủ;
  - `invoices_not_created` (billing) — đã qua `expectedInvoiceDay` của cơ sở mà kỳ này còn hợp đồng chưa có hoá đơn;
  - `open_incidents` (incidents); `pending_deposits` (billing) — sổ cọc `pending`;
  - `photos_expiring` (settings) — ảnh bàn giao sẽ xoá trong 7 ngày (thanh lý + `photoRetentionDays`).

- [ ] **Step 1:** Unit test với `today='2026-11-16'`, ngưỡng 30: visa 0 / −6 / 30 ngày có, 31 ngày không; hoá đơn hạn 15/11 chưa thu có trong overdue, hạn 16/11 không; Hùng chỉ thấy `meters_missing` và `open_incidents` của Bình Thạnh.
- [ ] **Step 2:** FAIL. **Step 3:** UI: dải số liệu (phòng đang ở / trống / đã cọc, công nợ quá hạn tổng tiền), lưới thẻ nhắc việc xếp theo mức độ, mỗi thẻ tối đa 8 dòng + "Xem tất cả" dẫn tới danh sách đã lọc.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): bảng nhắc việc đầy đủ`.

### Task 18: Nhập dữ liệu từ Excel

**Files:**
- Create: `src/lib/excel.ts`, `src/features/import/{targets.ts,validate.ts}`, `src/features/import/components/{upload-step.tsx,mapping-step.tsx,preview-step.tsx}`, `src/app/(app)/import/page.tsx`, `tests/unit/import.test.ts`, `tests/fixtures/build-fixtures.ts`

**Interfaces:**
- Produces: `parseWorkbook(buf): Promise<{ sheets: { name; headers; rows }[] }>`; `IMPORT_TARGETS` cho `rooms`, `tenants`, `leases` (mã phòng, SĐT/giấy tờ khách, ngày bắt đầu/kết thúc, giá thuê, tiền cọc), `deposits` (số dư cọc theo hợp đồng), `debts` (công nợ đầu kỳ → hoá đơn "Công nợ chuyển từ hệ thống cũ"), `meter_readings`, `assets` — mỗi trường có `aliases` không dấu để gợi ý ghép cột; `suggestMapping(headers, target)`; `validateRows(target, rows, mapping)` dùng lại zod schema của các form (không viết lại luật); Repo `import.run(target, rows) → { created; updated }` upsert theo khoá tự nhiên (phòng: mã cơ sở + mã phòng; khách: passport → CCCD → mã số thuế → SĐT; hợp đồng: mã phòng + ngày bắt đầu).

- [ ] **Step 1:** Test: `suggestMapping(['Số điện thoại','Họ tên','Hết hạn visa'])` → `phone, fullName, visaExpiry`; ngày `05/03/2027` và số Excel 46451 đều thành `2027-03-05`; dòng thiếu passport → lỗi `{ row: 3, field: 'passportNumber' }`; chạy `import.run` cùng dữ liệu 2 lần → lần 2 `created 0`.
- [ ] **Step 2:** FAIL. **Step 3:** UI 3 bước (chọn loại dữ liệu + file + sheet → ghép cột với gợi ý → xem trước số dòng hợp lệ/lỗi, bảng lỗi theo dòng, nút "Nhập N dòng hợp lệ"); có nút "Tải file mẫu" cho từng loại.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(ui): nhập dữ liệu từ Excel`.

### Task 19: Rà soát toàn bộ và bàn giao để người dùng duyệt

**Files:**
- Modify: `README.md`
- Create: `docs/review/giai-doan-a-checklist.md`

- [ ] **Step 1:** `npx vitest run` → PASS toàn bộ; `npx playwright test` → PASS; `npm run lint` sạch; `npm run build` OK.
- [ ] **Step 2:** Kiểm tra tay ở 1440px và 390px, chế độ sáng: mọi trang trong menu mở được với cả 5 người dùng mẫu, không lỗi console, không cuộn ngang.
- [ ] **Step 3:** README: `npm install`, `npm run dev`, mở `http://localhost:3000`, chọn người dùng mẫu, nút "Đặt lại dữ liệu mẫu" ở menu người dùng.
- [ ] **Step 4:** `docs/review/giai-doan-a-checklist.md`: danh sách luồng để người dùng bấm thử và ghi góp ý (mỗi luồng: các bước, điều cần để ý, ô ghi chú) — theo thứ tự: nhắc việc → khách → hợp đồng cọc → hợp đồng thuê → bàn giao → điện nước → hoá đơn → gia hạn / chuyển phòng / thanh lý → tài sản → sự cố → người dùng & phân quyền → mẫu Word → nhập Excel → cài đặt.
- [ ] **Step 5:** Commit `docs: hướng dẫn chạy và checklist duyệt giai đoạn A`.
- [ ] **Step 6: Điểm dừng.** Người dùng duyệt; góp ý được cập nhật vào spec và plan. Sau khi giao diện được duyệt mới viết lại kế hoạch giai đoạn B (gắn cơ sở dữ liệu) — xem `docs/superpowers/plans/2026-11-16-dot-1-nen-tang.md`.
