# Siris — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web nội bộ quản lý khách thuê dài hạn đủ mọi phần trong spec, chạy trên Supabase ngay từ đầu. Trước tiên dùng dữ liệu giả để người dùng duyệt giao diện và luồng (điểm dừng ở Task 19), sau đó hoàn thiện để chạy thật.

**Architecture:** Next.js App Router. Trang là server components đọc dữ liệu qua các hàm service; thao tác ghi đi qua server actions. Service là hàm `(db, ctx, input)` dùng Drizzle ORM nối thẳng Postgres của Supabase. Supabase Auth chỉ lo đăng nhập. **Phân quyền thực thi ở server** qua một `AccessContext`. RLS bật cho mọi bảng nhưng không có policy nào, để chặn truy cập qua anon key / PostgREST. Logic nghiệp vụ (tính tiền, điện nước, sổ cọc, thanh lý, hạn thanh toán, nhắc việc) là hàm thuần trong `src/domain/`. Test service chạy trên PGlite (Postgres nhúng), không cần Docker. Dữ liệu giả và tài khoản mẫu được nạp vào Supabase bằng `npm run db:seed`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, Drizzle ORM + drizzle-kit, `postgres` (postgres.js), `@supabase/ssr` + `@supabase/supabase-js`, zod, react-hook-form, docxtemplater + pizzip, exceljs, browser-image-compression, `@aws-sdk/client-s3` (R2), Vitest + `@electric-sql/pglite`, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`

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

### Task 1: Khởi tạo dự án, kết nối Supabase, hạ tầng test

**Files:**
- Create: dự án Next.js ở thư mục gốc (giữ `README.md`, `docs/`), `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `src/db/client.ts`, `src/lib/supabase/{server.ts,admin.ts,client.ts}`, `src/components/app-shell/{sidebar.tsx,topbar.tsx,demo-banner.tsx,nav.ts}`, `src/app/(app)/layout.tsx`, `src/app/not-found.tsx`, `tests/helpers/db.ts`, `tests/unit/smoke.test.ts`, `scripts/seed/index.ts`

**Interfaces:**
- Produces: `db` và `type DB` (`src/db/client.ts`); `createTestDb(): Promise<DB>` (PGlite mới, đã chạy mọi migration); `NAV_ITEMS: { href; label; icon; requires?: Permission }[]` — Nhắc việc `/`, Cơ sở & phòng `/facilities`, Khách thuê `/tenants` (tenants_contracts), Hợp đồng `/contracts` (tenants_contracts), Điện nước `/meters` (meters), Hoá đơn `/invoices` (billing), Tài sản `/assets` (assets), Sự cố `/incidents` (incidents); và cho `settings`: Người dùng `/users`, Mẫu giấy tờ `/templates`, Nhập dữ liệu `/import`, Cài đặt `/settings`, Nhật ký `/audit`.

- [ ] **Step 1:** Chạy `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`. Nếu báo thư mục không trống thì tạo ở thư mục tạm rồi chép vào, giữ `README.md` và `docs/`. Cài `drizzle-orm postgres zod react-hook-form @hookform/resolvers @supabase/ssr @supabase/supabase-js lucide-react`, dev `drizzle-kit vitest vite-tsconfig-paths @electric-sql/pglite @playwright/test tsx`. Chạy `npx shadcn@latest init --yes` rồi thêm button, input, select, checkbox, dialog, sheet, table, tabs, badge, card, dropdown-menu, sonner, form, textarea, popover, calendar, command.
- [ ] **Step 2:** `.env.example` gồm `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_DEMO_MODE`, `DEMO_PASSWORD`, `STORAGE_DRIVER` (`supabase`|`r2`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `GOTENBERG_URL`. Scripts trong package.json: `db:generate`, `db:migrate`, `db:seed`, `test`, `test:e2e`.
- [ ] **Step 3:** Khung giao diện: font Be Vietnam Pro (next/font, subset `vietnamese`), thanh bên trái thu thành menu trượt khi màn hình dưới 768px, thanh trên có bộ chọn cơ sở và tên người dùng, `demo-banner` khi bật demo mode.
- [ ] **Step 4:** Viết `smoke.test.ts`: `createTestDb()` rồi `select 1` phải trả 1. Chạy `npm test` → PASS. Chạy `npm run build` → OK.
- [ ] **Step 5:** README ghi cách tạo project Supabase Free, điền `.env.local`, chạy migrate và seed, chạy dev.
- [ ] **Step 6:** Commit `chore: khởi tạo Next.js, Supabase, Drizzle, Vitest + PGlite, khung giao diện`.

### Task 2: Tiện ích dữ liệu

**Files:**
- Create: `src/domain/{phone,dates,text,money,errors}.ts`, `src/lib/action-result.ts`
- Test: `tests/unit/domain/utils.test.ts`

**Interfaces:**
- Produces: `normalizePhone(input): string | null`, `todayVN(now?)`, `parseFlexibleDate(input: string|number|Date|null|undefined): string | null`, `formatDateVN(iso)`, `addDays(iso, n)`, `diffDays(a, b)`, `daysInMonth('YYYY-MM')`, `removeDiacritics(s)`, `buildSearchText(parts)`, `formatVND(n)`, `numberToVietnameseWords(n)`; `NotFoundError`, `ForbiddenError`, `ValidationError(message, fieldErrors?)`; `toActionResult(fn)` chuyển các lỗi trên thành `ActionResult`.

- [ ] **Step 1: Viết test**

```ts
expect(normalizePhone('0901 234 567')).toBe('+84901234567')
expect(normalizePhone('84901234567')).toBe('+84901234567')
expect(normalizePhone('+84 90 123 4567')).toBe('+84901234567')
expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100')
expect(normalizePhone('12345')).toBeNull()
expect(todayVN(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16')
expect(parseFlexibleDate('05/03/2027')).toBe('2027-03-05')
expect(parseFlexibleDate('5/3/2027')).toBe('2027-03-05')
expect(parseFlexibleDate(46451)).toBe('2027-03-05')
expect(parseFlexibleDate('31/02/2027')).toBeNull()
expect(removeDiacritics('Nguyễn Văn Đức')).toBe('Nguyen Van Duc')
expect(buildSearchText(['Nguyễn  Văn A', '+84901234567'])).toBe('nguyen van a +84901234567 0901234567')
expect(formatVND(1500000)).toBe('1.500.000')
expect(numberToVietnameseWords(1500000)).toBe('Một triệu năm trăm nghìn đồng')
expect(numberToVietnameseWords(2005000)).toBe('Hai triệu không trăm linh năm nghìn đồng')
```

- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt. Lưu ý: chuỗi có `/` luôn đọc là `d/m/yyyy`; ngày dạng số của Excel tính từ mốc 1899-12-30; `todayVN` dùng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(domain): điện thoại, ngày VN, tìm không dấu, tiền bằng chữ`.

### Task 3: Đăng nhập, người dùng, phân quyền, nhật ký

**Files:**
- Create: `src/db/schema/users.ts`, `src/db/schema/audit.ts`, `src/domain/access.ts`, `src/server/session.ts`, `src/server/audit.ts`, `src/server/users/{service.ts,actions.ts}`, `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/(app)/users/page.tsx`, `src/app/(app)/audit/page.tsx`, `src/features/users/components/{user-table.tsx,user-sheet.tsx}`, `src/components/require-permission.tsx`, `scripts/seed/users.ts`
- Test: `tests/unit/domain/access.test.ts`, `tests/integration/users.test.ts`

**Interfaces:**
- Bảng: `user_profiles(id = auth user id, email unique, full_name, is_active)`, `user_facilities(user_id, facility_id)`, `user_permissions(user_id, permission)` có check 6 giá trị, `audit_logs(id, user_id, action, entity, entity_id, facility_id, summary, before jsonb, after jsonb, created_at)`. Bảng `facilities` tạo ở Task 5; `user_facilities.facility_id` thêm khoá ngoại ở Task 5.
- Produces:
  - `PERMISSIONS`, `Permission`, `PERMISSION_LABELS`, `AccessContext { userId; fullName; permissions: Set<Permission>; facilityIds: Set<string>; isAdmin }`.
  - `can(ctx, perm, facilityId?)`, `assertCan(ctx, perm, facilityId?)` (sai cơ sở → `NotFoundError`, thiếu quyền → `ForbiddenError`), `facilityScope(ctx): string[] | 'all'`, `canViewTenantIdentity(ctx, facilityId)`, `maskId(s)` → `•••••1234`.
  - `loadAccessContext(db, userId): Promise<AccessContext | null>` (null nếu không có profile hoặc `is_active = false`); `getAccessContext()` đọc `auth.getUser()`, chuyển về `/login` nếu null.
  - `recordAudit(tx, ctx, { action, entity, entityId?, facilityId?, summary, before?, after? })`.
  - Service users: `listUsers`, `createUser(db, ctx, { email, fullName, facilityIds, permissions })` (tạo auth user bằng service role với mật khẩu tạm ngẫu nhiên, trả về một lần), `updateUserAccess(db, ctx, id, { fullName, facilityIds, permissions, isActive })`, `resetPassword`. Chỉ `settings`. Admin không tự gỡ `settings` hay tự khoá mình: lỗi "Không thể tự gỡ quyền quản trị của chính bạn".
  - Seed: 5 tài khoản mẫu với mật khẩu `DEMO_PASSWORD`. Ở demo mode, trang đăng nhập có 5 nút đăng nhập nhanh (server action đăng nhập bằng `DEMO_PASSWORD`).

- [ ] **Step 1:** Viết test.
  - `access.test.ts`: ctx có `meters` tại A → `can(meters, A)` true, `can(meters, B)` false, `can(billing, A)` false; ctx có `settings` → mọi `can` true và scope là `'all'`; `assertCan` sai cơ sở → `NotFoundError`, thiếu quyền → `ForbiddenError`.
  - `users.test.ts` (PGlite, mock admin client): `updateUserAccess` thay toàn bộ cơ sở và quyền; ctx không phải admin → `ForbiddenError`; admin tự gỡ `settings` → lỗi; có dòng audit; `is_active=false` → `loadAccessContext` trả null.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt.
  - Middleware làm mới phiên.
  - Menu lọc theo `can`.
  - Trang Người dùng: bảng gồm tên, email, cơ sở, quyền (badge), trạng thái. Sheet có 2 nhóm checkbox "Cơ sở được truy cập" và "Nhóm quyền", mỗi quyền kèm mô tả một dòng; tick Cài đặt thì hiện "Thấy mọi cơ sở".
  - Trang Nhật ký: bảng lọc theo người, theo đối tượng.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(auth): đăng nhập, phân quyền theo cơ sở + nhóm quyền, người dùng, nhật ký`.

### Task 4: Lõi tính tiền (hàm thuần)

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

- [ ] **Step 1: Viết test (giá trị lấy từ spec)**

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

- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(domain): lõi tính tiền — lẻ ngày, điện nước, điều chỉnh, sổ cọc, thanh lý`.

### Task 5: Cơ sở, phòng, cài đặt, loại phí, đơn giá

**Files:**
- Create: `src/db/schema/{facilities,settings,fees}.ts`, `src/domain/room-status.ts`, `src/server/{facilities,rooms,settings,fees}/{service.ts,actions.ts}`, `src/app/(app)/facilities/page.tsx`, `src/app/(app)/facilities/[id]/page.tsx`, `src/app/(app)/rooms/[id]/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/features/rooms/components/{room-map.tsx,room-sheet.tsx,bulk-rooms-dialog.tsx}`, `src/features/settings/components/*`, `scripts/seed/{facilities,settings}.ts`
- Test: `tests/integration/facilities-rooms.test.ts`, `tests/integration/settings.test.ts`, `tests/unit/domain/room-status.test.ts`

**Interfaces:**
- Bảng:
  - `facilities(code unique, name, address, note, is_active, expected_invoice_day int 1–28)`
  - `rooms(facility_id, code, floor, room_type, area_m2, list_price, capacity, note, is_active)`, unique `(facility_id, code)`
  - `app_settings(key pk, value jsonb)`
  - `fee_units(name)`
  - `fee_types(name, unit_id, default_price, billing 'monthly_fixed'|'per_occurrence', quantity_from 'manual'|'occupants', is_active)`
  - `utility_rates(facility_id, utility 'electric'|'water', price_per_unit, effective_from date)`, unique `(facility_id, utility, effective_from)`
- Produces:
  - `SETTINGS_DEFAULTS = { visaWarningDays: 30, contractWarningDays: 30, proration: 'actual_days', dueRule: { kind: 'days_after_approval', days: 5 }, photoRetentionDays: 30 }`, `getSettings(db)`, `updateSettings(db, ctx, partial)` (chỉ `settings`; số ngày 1–365).
  - `listFacilities(db, ctx)` lọc theo phạm vi; `getRoom(db, ctx, id)` → `NotFoundError` nếu ngoài phạm vi; `createRoom`, `updateRoom`, `setRoomActive`, `createRoomsBulk(db, ctx, { facilityId, prefix?, floor, from, to, roomType?, listPrice?, capacity? }) → { created; skipped: string[] }`. Không xoá cứng.
  - `roomStatus(room, activeLease?, pendingDeposit?, today, contractWarningDays)` → `'vacant'|'deposited'|'occupied'|'ending_soon'|'occupied_with_next'` (Trống / Đã cọc / Đang ở / Sắp trả / Đang ở · có cọc chờ). Hợp đồng được truyền vào từ Task 9; trước đó trạng thái là Trống.
  - Phí và đơn giá: `listFeeTypes`, `createFeeType`, `updateFeeType`, `archiveFeeType`, `listFeeUnits`, `createFeeUnit`, `listRates(facilityId)`, `createRate`.

- [ ] **Step 1:** Viết test.
  - Người chỉ được giao A → chỉ thấy A; `getRoom` của B → `NotFoundError`.
  - Người không có `settings` tạo phòng → `ForbiddenError`.
  - Trùng mã phòng → "Mã phòng đã tồn tại trong cơ sở này".
  - `createRoomsBulk` 301–305 khi đã có 303 → `created 4, skipped ['303']`.
  - `updateSettings` với 0 hoặc 400 → lỗi.
  - `roomStatus` đúng cho cả 5 trạng thái.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt.
  - **Trang cơ sở:** dải số liệu (tổng phòng, đang ở, trống, đã cọc, sắp trả) và **sơ đồ phòng theo tầng** (ô màu theo trạng thái, có lọc trạng thái). Nút "Thêm phòng" và "Tạo nhanh nhiều phòng" mở Sheet.
  - **Trang phòng:** thông tin phòng. Các khu hợp đồng, tài sản, điện nước, sự cố để chỗ sẵn, các task sau điền vào.
  - **Trang cài đặt (tabs):**
    - *Chung:* ngưỡng visa và hợp đồng; cách tính lẻ ngày; quy tắc hạn thanh toán mặc định (radio "Ngày __ của tháng sau" / "__ ngày sau khi duyệt"); số ngày giữ ảnh sau thanh lý.
    - *Cơ sở:* thêm/sửa cơ sở, ngày tạo hoá đơn dự kiến.
    - *Đơn vị & loại phí.*
    - *Đơn giá điện nước:* lịch sử theo cơ sở, thêm mức mới kèm ngày hiệu lực.
- [ ] **Step 4:** Chạy → PASS. Chạy `db:migrate` và `db:seed` lên Supabase dev, mở trang kiểm tra bằng tài khoản Admin.
- [ ] **Step 5:** Commit `feat: cơ sở, sơ đồ phòng, cài đặt, loại phí, đơn giá`.

### Task 6: Lưu file

**Files:**
- Create: `src/server/storage/{types.ts,supabase.ts,r2.ts,memory.ts,index.ts}`, `src/db/schema/files.ts`, `src/app/api/files/[id]/route.ts`, `src/lib/image.ts`, `src/components/file-upload.tsx`
- Test: `tests/integration/files.test.ts`

**Interfaces:**
- Bảng: `files(id, storage_key, thumb_key, content_type, size, owner_type text, owner_id uuid, facility_id, uploaded_by, delete_after date null)`.
- Produces:
  - `interface StorageAdapter { createUploadUrl(key, contentType, maxBytes); createDownloadUrl(key, expiresSec); delete(key) }`; `getStorage()` chọn theo `STORAGE_DRIVER` (`supabase` mặc định, bucket riêng tư `siris`; `r2` dùng ở Task 21; `memory` trong test).
  - `requestUpload(db, ctx, { ownerType, ownerId, contentType }) → { fileId, uploadUrl, thumbUploadUrl }` (tối đa 2MB mỗi ảnh); `confirmUpload(db, ctx, fileId)`; `deleteFile(db, ctx, fileId)`.
  - `fileAccessPermission(ownerType)`: `tenant_document` → tenants_contracts; `handover_photo` → tenants_contracts; `incident_photo` → incidents; `signed_contract` → tenants_contracts; `template` → settings; `export` → theo đối tượng gốc.
  - Route `GET /api/files/[id]?thumb=1`: kiểm quyền theo owner và cơ sở, rồi chuyển hướng 302 sang URL ký có hạn 5 phút.
  - `compressImage(file): Promise<{ main: Blob; thumb: Blob }>`; `<FileUpload ownerType ownerId accept capture multiple onUploaded>`.
- [ ] **Step 1:** Viết test (memory adapter): người có quyền tải lên và xác nhận → có bản ghi; người khác cơ sở → `NotFoundError`; thiếu quyền → `ForbiddenError`; xoá → adapter `delete` được gọi cho cả file chính và thumbnail.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(storage): lưu file qua adapter, nén ảnh, URL ký có kiểm quyền`.

### Task 7: Khách thuê

**Files:**
- Create: `src/db/schema/tenants.ts`, `src/server/tenants/{schemas.ts,service.ts,actions.ts}`, `src/app/(app)/tenants/page.tsx`, `src/app/(app)/tenants/[id]/page.tsx`, `src/app/(app)/tenants/new/page.tsx`, `src/features/tenants/components/{tenant-form.tsx,tenant-table.tsx,tenant-documents.tsx}`, `scripts/seed/tenants.ts`
- Test: `tests/integration/tenants.test.ts`

**Interfaces:**
- Bảng `tenants`:
  - Cột: `kind` enum `('foreign','vietnamese','company')`, `home_facility_id`, `phone` unique null, `email`, `note`, `full_name`, `nationality`, `passport_number`, `passport_expiry`, `visa_type`, `visa_expiry`, `id_number`, `id_issue_date`, `id_issue_place`, `date_of_birth`, `permanent_address`, `company_name`, `tax_code`, `company_address`, `representative`, `contact_person`, `search_text`.
  - Check theo loại: cá nhân phải có `full_name` và `phone`; khách nước ngoài phải có `passport_number`; khách Việt Nam phải có `id_number`; công ty phải có `company_name` và `tax_code`.
  - Unique partial: `passport_number`, `id_number`, `tax_code`.
  - `home_facility_id` = cơ sở quản lý khách *(Claude quyết)*, để phân quyền được cả khi khách chưa có hợp đồng.
- Produces:
  - `tenantInput` là zod discriminated union: CCCD đúng 12 số; mã số thuế 10 hoặc 13 số (cho phép `-`); phone bắt buộc với cá nhân, tuỳ chọn với công ty, và được chuẩn hoá qua `normalizePhone`.
  - `createTenant`, `updateTenant`: cần `tenants_contracts` tại `homeFacilityId`, đồng thời cập nhật `search_text`.
  - Lỗi trùng: "Số điện thoại đã thuộc về khách khác", "Số passport đã tồn tại", "Số CCCD đã tồn tại", "Mã số thuế đã tồn tại".
  - `searchTenants(db, ctx, { q?, kind?, facilityId?, limit, offset })`, `getTenant`, `displayName(t)`.
  - Ảnh giấy tờ dùng `ownerType = 'tenant_document'`.
- [ ] **Step 1:** Viết test.
  - `0901 234 567` được lưu thành `+84901234567`; khách thứ hai nhập `+84 90 123 4567` → lỗi trùng.
  - Tìm `nguyen van an` hoặc `NGUYEN` ra "Nguyễn Văn An"; tìm theo đuôi passport cũng ra.
  - Khách nước ngoài thiếu passport → `fieldErrors.passportNumber`.
  - Người chỉ được giao cơ sở A không tìm thấy khách của B, và `getTenant` khách của B → `NotFoundError`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt.
  - **Bảng khách:** tên, loại, SĐT, giấy tờ, cơ sở, phòng đang ở, visa còn N ngày (đỏ khi ≤7, cam khi ≤ ngưỡng). Tìm kiếm có debounce, lọc theo loại và cơ sở.
  - **Form:** chọn loại khách trước (3 nút lớn) rồi mới hiện các trường tương ứng. Dưới ô SĐT hiện "Sẽ lưu: +84 90 123 4567".
  - **Trang chi tiết:** thông tin theo loại khách; ảnh giấy tờ (chụp hoặc tải lên, bấm để xem lớn); các khu hợp đồng và công nợ để chỗ sẵn cho task sau.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: khách thuê 3 loại, tìm không dấu, ảnh giấy tờ`.

### Task 8: Mẫu giấy tờ Word

**Files:**
- Create: `src/db/schema/templates.ts`, `src/domain/template-fields.ts`, `src/lib/docx.ts`, `src/server/templates/{service.ts,actions.ts}`, `scripts/build-sample-templates.ts`, `public/templates/*.docx`, `src/app/(app)/templates/page.tsx`, `src/features/templates/components/*`, `scripts/seed/templates.ts`
- Test: `tests/unit/domain/template-fields.test.ts`, `tests/unit/docx.test.ts`

**Interfaces:**
- Bảng: `doc_templates(doc_type, name, file_id, is_default)`. `doc_type` ∈ `deposit_contract`, `lease`, `addendum_extension`, `addendum_transfer`, `addendum_termination`, `handover_check_in`, `handover_check_out`, `invoice_monthly`, `invoice_termination`, `receipt`.
- Produces:
  - `TEMPLATE_FIELDS: Record<DocType, Field[]>`. Ví dụ:
    - lease: `ten_khach, loai_khach, so_giay_to, so_dien_thoai, email, ten_cong_ty, ma_so_thue, co_so, dia_chi_co_so, so_phong, ngay_bat_dau, ngay_ket_thuc, gia_thue, gia_thue_bang_chu, tien_coc, tien_coc_bang_chu, ngay_lap`; vòng lặp `phi_dich_vu[] {ten, don_vi, so_luong, don_gia}` và `nguoi_o[] {ho_ten, giay_to}`.
    - invoice: `ma_hoa_don, ky, ngay_lap, han_thanh_toan, tong_tien, tong_tien_bang_chu`; vòng lặp `dong[] {mo_ta, so_luong, don_gia, thanh_tien}`.
    - handover: vòng lặp `tai_san[] {ma, ten, tinh_trang, phat}` và `chi_so[] {loai, so_dong_ho, chi_so}`.
  - `buildTemplateData(docType, entities)`: định dạng sẵn tiền, ngày và số tiền bằng chữ.
  - `renderDocx(templateBuf, data): { blob; warnings: string[] }`: dùng docxtemplater với delimiters `{` `}` và `paragraphLoop`. Chỗ điền thiếu dữ liệu thì để trống và ghi vào `warnings`.
  - `exportDocument(db, ctx, { docType, entityId, templateId? }) → fileId`: lưu bản xuất với `ownerType = 'export'`.
- [ ] **Step 1:** Test: `buildTemplateData('lease', …)` có `gia_thue = '9.000.000'`, `gia_thue_bang_chu = 'Chín triệu đồng'`, `ngay_bat_dau = '15/10/2026'`; `renderDocx` với `lease.docx` mẫu cho ra file chứa "Chín triệu đồng".
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Script sinh mẫu cho đủ 10 loại (dùng thư viện `docx`, cài dạng dev dependency). Trang Mẫu giấy tờ gồm:
  - danh sách mẫu theo loại;
  - tải lên file `.docx` và đặt mẫu mặc định;
  - **bảng chỗ điền** (mã, ý nghĩa, ví dụ, nút sao chép `{mã}`);
  - nút "Thử xuất với dữ liệu mẫu".
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: mẫu Word, bảng chỗ điền, xuất docx`.

### Task 9: Hợp đồng cọc và hợp đồng thuê

**Files:**
- Create: `src/db/schema/contracts.ts`, `src/server/contracts/{service.ts,actions.ts}`, `src/app/(app)/contracts/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `src/features/contracts/components/{deposit-form.tsx,lease-wizard.tsx,contract-summary.tsx,sign-status.tsx,export-menu.tsx}`, `scripts/seed/contracts.ts`
- Test: `tests/integration/contracts.test.ts`

**Interfaces:**
- Bảng:
  - `deposit_contracts(room_id, tenant_id, deposit_amount, agreed_rent, expected_move_in, status 'pending'|'converted'|'cancelled', cancel_outcome, sign_status, signed_file_id)`
  - `leases(code unique, room_id, tenant_id, start_date, end_date, monthly_rent, deposit_amount, due_rule jsonb null, proration null, from_deposit_contract_id, status 'active'|'ended', sign_status, signed_file_id)`
  - `lease_occupants(lease_id, tenant_id)`
  - `lease_fees(lease_id, fee_type_id, quantity, unit_price)`
  - `deposit_entries(lease_id null, deposit_contract_id null, date, type 'collect'|'topup'|'deduct'|'refund'|'forfeit', amount, status 'pending'|'done', method, note)`
  - Partial unique index: một lease `active` mỗi phòng; một deposit contract `pending` mỗi phòng.
  - `sign_status` ∈ `draft`, `exported`, `signed`.
  - Mã hợp đồng *(Claude quyết)*: `<mã cơ sở>-HĐ-<năm>-<số thứ tự 4 chữ số>`.
- Produces:
  - `createDepositContract`; `cancelDepositContract(id, 'forfeit'|'refund')`, có ghi sổ cọc.
  - `createLease(db, ctx, input)` hoặc `convertDepositToLease(db, ctx, depositId, input)`: kiểm tra chồng ngày (lỗi "Phòng đã có hợp đồng trong khoảng thời gian này"); cọc giữ chỗ chuyển thành dòng `collect` của lease; tạo hoá đơn đầu tiên nháp bằng `buildFirstInvoice` (bảng hoá đơn có ở Task 14 — tới lúc đó mới nối, trước đó service trả về dữ liệu nháp).
  - `listLeases(db, ctx, { status?, facilityId?, expiringWithinDays?, unsigned? })`, `getLease`.
  - `setSignStatus(kind, id, status, signedFileId?)`, `exportContract(kind, id, templateId?)`.
  - Cảnh báo (vẫn cho lưu): ngày vào ở dự kiến của cọc chờ trước ngày kết thúc của lease hiện tại.
  - Nối `roomStatus` vào sơ đồ phòng.
- [ ] **Step 1:** Viết test.
  - Tạo cọc cho phòng trống → phòng thành `deposited`; tạo cọc thứ hai cho cùng phòng → lỗi.
  - Chuyển cọc thành lease → phòng thành `occupied`, sổ cọc có dòng `collect`.
  - Tạo lease chồng ngày → lỗi.
  - Người của cơ sở khác `getLease` → `NotFoundError`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt.
  - **Danh sách hợp đồng**, lọc: đang hiệu lực / sắp hết hạn / chưa ký / đã kết thúc / cọc chờ.
  - **Wizard tạo hợp đồng thuê:**
    1. Bên thuê & người ở.
    2. Thời hạn & giá.
    3. Phí dịch vụ (phí theo người tự lấy số người ở).
    4. Hạn thanh toán & cách tính lẻ ngày.
    5. Xem lại.
  - **Trang hợp đồng**, các tab: Tổng quan · Phụ lục · Bàn giao · Hoá đơn · Sổ cọc · Giấy tờ.
  - Dải trạng thái ký: Nháp → Đã xuất → Đã ký, kèm tải lên bản đã ký.
  - Trang phòng và trang khách hiện hợp đồng hiện tại.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: hợp đồng cọc, hợp đồng thuê, trạng thái ký, sổ cọc`.

### Task 10: Tài sản và kho

**Files:**
- Create: `src/db/schema/assets.ts`, `src/server/assets/{service.ts,actions.ts}`, `src/app/(app)/assets/page.tsx`, `[id]/page.tsx`, `src/features/assets/components/{asset-table.tsx,move-dialog.tsx,asset-form.tsx,location-tree.tsx}`, `scripts/seed/assets.ts`
- Test: `tests/integration/assets.test.ts`

**Interfaces:**
- Bảng:
  - `assets(code unique, name, category, value, condition, location_kind 'room'|'common'|'warehouse', location_id, facility_id, status 'in_use'|'broken'|'disposed')`
  - `asset_moves(asset_id, from_kind, from_id, to_kind, to_id, moved_at, moved_by, reason)`
  - Mỗi tài sản là một món có mã *(Claude quyết)*, để biên bản bàn giao liệt kê được từng món.
- Produces: `listAssets(db, ctx, { facilityId?, location?, q?, status? })`, `getAsset`, `createAsset`, `updateAsset`, `moveAssets(db, ctx, assetIds, to, reason)` (ghi một `asset_moves` cho mỗi món), `assetHistory(id)` (gồm di chuyển, bàn giao, sự cố), `setAssetStatus`. Cần quyền `assets`.
- [ ] **Step 1:** Test: chuyển 2 món từ kho sang phòng 301 → vị trí đổi và có 2 dòng lịch sử; người của cơ sở khác → `NotFoundError`; chuyển sang phòng thuộc cơ sở khác → `ValidationError`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI:
  - Bên trái là cây vị trí (Cơ sở → Kho / Khu chung / Phòng), bên phải là bảng tài sản.
  - Tick nhiều món thì hiện thanh nổi "Chuyển N tài sản".
  - Trên điện thoại: chọn món → Chuyển → chọn nơi đến.
  - Trang phòng hiện danh sách tài sản trong phòng.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: tài sản và kho, chuyển nhanh, lịch sử`.

### Task 11: Điện nước

**Files:**
- Create: `src/db/schema/meters.ts`, `src/server/meters/{service.ts,actions.ts}`, `src/app/(app)/meters/page.tsx`, `src/features/meters/components/{reading-grid.tsx,replace-meter-dialog.tsx,meter-history.tsx}`, `scripts/seed/meters.ts`
- Test: `tests/integration/meters.test.ts`

**Interfaces:**
- Bảng: `meters(room_id, utility, serial, installed_on, start_reading, removed_on, final_reading)`, `meter_readings(meter_id, period 'YYYY-MM', read_on, value)`, unique `(meter_id, period)`.
- Produces:
  - `listReadingSheet(db, ctx, facilityId, period)` → mỗi phòng gồm đồng hồ hiện tại, chỉ số kỳ trước, chỉ số kỳ này, tiêu thụ.
  - `saveReadings(db, ctx, period, rows)`: kiểm bằng `meterUsage`, trả lỗi theo từng dòng và vẫn lưu các dòng hợp lệ.
  - `replaceMeter(db, ctx, roomId, utility, { removedOn, finalReading, newSerial?, startReading })`.
  - Cần quyền `meters`.
- [ ] **Step 1:** Test: chỉ số nhỏ hơn kỳ trước → dòng đó bị lỗi, các dòng khác vẫn lưu; thay đồng hồ (cũ cuối 1260, mới đầu 0, rồi nhập 45) → tiêu thụ 105.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI:
  - Lưới nhập nhanh, trên điện thoại hiện bàn phím số; Enter chuyển sang ô kế tiếp.
  - Cảnh báo tiêu thụ bất thường (> 2× trung bình 3 kỳ).
  - Hiện tiến độ "Đã ghi 12/16 phòng".
  - Trang phòng hiện lịch sử đồng hồ và chỉ số.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: ghi chỉ số điện nước, thay đồng hồ`.

### Task 12: Bàn giao check-in / check-out

**Files:**
- Create: `src/db/schema/handovers.ts`, `src/server/handovers/{service.ts,actions.ts}`, `src/app/(app)/handovers/[id]/page.tsx`, `src/features/handovers/components/{handover-form.tsx,asset-condition-row.tsx}`, `scripts/seed/handovers.ts`
- Test: `tests/integration/handovers.test.ts`

**Interfaces:**
- Bảng: `handovers(lease_id, room_id, kind 'check_in'|'check_out', date, status 'draft'|'done')`, `handover_items(handover_id, asset_id, condition, note, damaged, missing, penalty)`. Ảnh dùng `ownerType = 'handover_photo'`, owner là handover item.
- Produces:
  - `startHandover(db, ctx, leaseId, kind)`: check-in lấy các tài sản đang ở phòng; check-out sao danh sách từ check-in.
  - `saveHandover(db, ctx, id, { items, meterReadings })`: chỉ số đồng hồ được ghi thành `meter_readings`.
  - `completeHandover(id)`, `exportHandover(id, templateId?)`.
  - Check-out: món mất thì phạt gợi ý = giá trị tài sản.
- [ ] **Step 1:** Test: check-in có đúng các tài sản trong phòng; check-out sao đúng danh sách; đánh dấu 1 món hư với phạt 500.000 → tổng phạt 500.000; chỉ số nhập ở bàn giao xuất hiện trong lịch sử đồng hồ.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI: danh sách dọc, nút to dễ bấm trên điện thoại; mỗi món chọn Tốt / Trầy xước / Hư, có ghi chú và chụp ảnh; check-out hiện cạnh tình trạng lúc check-in để so sánh.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: biên bản bàn giao check-in, check-out`.

### Task 13: Phí phát sinh theo lần

**Files:**
- Create: `src/db/schema/charges.ts`, `src/server/charges/{service.ts,actions.ts}`, `src/features/charges/components/one-off-dialog.tsx`, `src/features/deposits/components/deposit-ledger.tsx`
- Test: `tests/integration/charges.test.ts`

**Interfaces:**
- Bảng: `one_off_charges(lease_id, fee_type_id null, kind 'service'|'penalty', description, date, quantity, unit_price, invoice_id null, source text null)`, `pending_adjustments(lease_id, description, amount, source_key unique, invoice_id null)`.
- Produces: `addOneOff`, `listOneOffs`, `removeOneOff` (không xoá được nếu đã vào hoá đơn đã duyệt); `listDepositEntries(leaseId)`, `markDepositDone(entryId, { date, method })`, `addDepositEntry`.
- [ ] **Step 1:** Test: thêm "Giặt ủi 3kg × 25.000" → ở trạng thái chưa tính; đánh dấu khoản cọc bổ sung đã thu → `depositBalance` tăng 1.000.000.
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
  - `invoices(code unique, lease_id, facility_id, kind 'monthly'|'first'|'termination'|'manual', period_start, period_end, coefficient numeric null, full_month bool, issue_date, due_date, status 'draft'|'approved', note)`
  - `invoice_lines(invoice_id, type 'rent'|'fee'|'electric'|'water'|'one_off'|'penalty'|'adjustment'|'deposit'|'deposit_offset'|'refund', description, quantity numeric, unit_price, amount, meta jsonb)`
  - `payments(invoice_id, paid_on, amount, method 'cash'|'transfer'|'other', received_by, note)`
  - Mã hoá đơn *(Claude quyết)*: `<mã cơ sở>-HD-<YYYYMM>-<số thứ tự 4 chữ số>`.
- Produces:
  - `previewBatch(db, ctx, { facilityId, period })` → mỗi hợp đồng: `{ leaseId, lines, warnings }` (cảnh báo khi chưa ghi điện nước hoặc chưa có đơn giá).
  - `createDrafts(...)`: bỏ qua hợp đồng đã có hoá đơn kỳ đó; đánh dấu các phí phát sinh và điều chỉnh đã dùng.
  - `updateLines`: nháp hay đã duyệt đều sửa được; sửa hoá đơn đã duyệt thì ghi audit kèm trước/sau.
  - `setPeriod(id, { start, end, coefficient?, fullMonth? })`: tính lại dòng tiền phòng và phí cố định.
  - `approveInvoice(id, { dueRule? , dueDate? })`: thứ tự ưu tiên hạn thanh toán là hoá đơn > hợp đồng > cài đặt.
  - `deleteInvoice(id)`: nếu đã có khoản thu → `ValidationError('Gỡ các khoản đã thu trước khi xoá')`; xoá xong thì trả phí phát sinh và điều chỉnh về trạng thái chưa tính.
  - `addPayment`, `removePayment`, `invoiceStatus(invoice, payments, today)` → Nháp / Chưa thu / Thu một phần / Đã thu đủ / Quá hạn.
  - `listInvoices(db, ctx, { facilityId?, status?, period?, overdue? })`, `tenantBalance(tenantId)`.
  - Mỗi khi duyệt hoá đơn hoặc tạo phụ lục: tính `midPeriodAdjustments` rồi upsert vào `pending_adjustments` theo `source_key`.
  - Cần quyền `billing`.
- [ ] **Step 1:** Viết test.
  - Tạo nháp tháng 12 → dòng tiền phòng tháng 12, điện nước tháng 11, phí phát sinh.
  - Tạo nháp lần nữa → không trùng hoá đơn, không lặp điều chỉnh.
  - Sửa kỳ 01/12–28/02 → hệ số 3.
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
- Bảng: `addenda(lease_id, type 'extension'|'transfer'|'termination', effective_date, new_end_date, new_room_id, new_monthly_rent, new_deposit_amount, new_fees jsonb, new_occupant_ids jsonb, deposit_forfeit jsonb, sign_status, signed_file_id)`.
- Produces:
  - `createExtension(leaseId, { effectiveDate, newEndDate, newMonthlyRent?, newDepositAmount?, newFees? })`: nếu tiền cọc thay đổi thì sinh `deposit_entries` ở trạng thái pending (`depositDiffEntry`), và tính điều chỉnh giữa kỳ.
  - `createTransfer(leaseId, { effectiveDate, newRoomId, newMonthlyRent?, newFees? })`
    - Phòng đích phải trống, hoặc chỉ có cọc chờ của chính khách này.
    - Tự tạo check-out phòng cũ, check-in phòng mới, chốt chỉ số điện nước, và tính điều chỉnh.
  - `createTermination(leaseId, { endDate, forfeit })`
    - Tạo check-out rồi dựng hoá đơn thanh lý nháp bằng `buildTerminationInvoice` (lấy phạt từ check-out và nợ cũ).
    - Khi hoá đơn thanh lý được duyệt: lease chuyển `ended`, ghi sổ cọc (deduct, forfeit, refund pending), đặt `files.delete_after = endDate + photoRetentionDays` cho ảnh bàn giao và ảnh giấy tờ của khách.
  - Phụ lục có trạng thái ký và xuất Word như hợp đồng.
- [ ] **Step 1:** Viết test (cài đặt days_30).
  - Gia hạn tăng giá 9tr→10tr và cọc 9tr→10tr → sổ cọc có topup 1.000.000 pending.
  - Chuyển phòng 15/11 sang phòng 11tr, sau khi hoá đơn tháng 11 đã duyệt → `pending_adjustments` có +1.066.667.
  - Thanh lý 20/11 với phạt 500.000, không mất cọc → hoá đơn tổng −11.080.000; mất cọc toàn bộ → −2.080.000.
  - Sau khi duyệt hoá đơn thanh lý → phòng về Trống, hoặc Đã cọc nếu có cọc chờ.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI: mỗi phụ lục là một wizard ngắn, có bước "Xem trước tiền" trước khi lưu.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: phụ lục gia hạn, chuyển phòng, thanh lý`.

### Task 16: Sự cố và sửa chữa

**Files:**
- Create: `src/db/schema/incidents.ts`, `src/server/incidents/{service.ts,actions.ts}`, `src/app/(app)/incidents/page.tsx`, `[id]/page.tsx`, `src/features/incidents/components/{incident-form.tsx,incident-board.tsx}`, `scripts/seed/incidents.ts`
- Test: `tests/integration/incidents.test.ts`

**Interfaces:**
- Bảng: `incidents(facility_id, room_id null, asset_id null, title, description, priority 'low'|'normal'|'high', status 'new'|'in_progress'|'done'|'cancelled', reported_by, assignee_id, cost, charge_to_tenant bool, charged_one_off_id)`. Ảnh dùng `ownerType = 'incident_photo'`.
- Produces: `listIncidents(db, ctx, { facilityId?, status?, assigneeId? })`, `getIncident`, `createIncident`, `updateIncident`, `setIncidentStatus`; khi chuyển sang `done` với `charge_to_tenant` và có `cost` → tạo `one_off_charges` loại `penalty` cho hợp đồng đang ở phòng đó. Cần quyền `incidents`.
- [ ] **Step 1:** Test: sự cố ở phòng 301 xong với chi phí 350.000, do khách gây ra → có phí phạt 350.000 chưa tính; `assetHistory` có sự cố này; người của cơ sở khác → `NotFoundError`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI: bảng theo cột Mới / Đang xử lý / Xong; lọc "Việc của tôi"; form ngắn, có chụp ảnh, dùng tốt trên điện thoại; nút "Báo sự cố" ở trang phòng.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: sự cố và sửa chữa, tính phí cho khách`.

### Task 17: Bảng nhắc việc

**Files:**
- Create: `src/domain/reminders.ts`, `src/server/dashboard/service.ts`, `src/app/(app)/page.tsx`, `src/features/dashboard/components/{reminder-card.tsx,stat-strip.tsx}`
- Test: `tests/unit/domain/reminders.test.ts`, `tests/integration/dashboard.test.ts`

**Interfaces:**
- Produces: `buildReminders(snapshot, ctx, today, settings): Reminder[]` với `Reminder { kind; title; count; items: { label; sub; href; severity: 'danger'|'warning'|'info' }[] }`. Mỗi loại chỉ hiện khi người dùng có quyền tương ứng, và lọc theo cơ sở:
  - `overdue_invoices` (billing)
  - `visa_expiring` (tenants_contracts): `visa_expiry ≤ today + visaWarningDays`, gồm cả visa đã hết hạn
  - `contracts_ending` (tenants_contracts): chưa có phụ lục gia hạn hay thanh lý
  - `unsigned` (tenants_contracts)
  - `meters_missing` (meters)
  - `invoices_not_created` (billing): đã qua `expected_invoice_day` của cơ sở
  - `open_incidents` (incidents)
  - `pending_deposits` (billing)
  - `photos_expiring` (settings): ảnh sẽ bị xoá trong vòng 7 ngày

  `getDashboard(db, ctx)` lấy snapshot cần thiết rồi gọi `buildReminders`.
- [ ] **Step 1:** Test với `today = '2026-11-16'` và ngưỡng 30: visa còn 0 / −6 / 30 ngày có mặt, 31 ngày không; hoá đơn hạn 15/11 chưa thu có mặt, hạn 16/11 không; Hùng chỉ thấy `meters_missing` và `open_incidents` của Bình Thạnh.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI: dải số liệu (phòng đang ở / trống / đã cọc, tổng công nợ quá hạn); lưới thẻ xếp theo mức độ, mỗi thẻ tối đa 8 dòng, có "Xem tất cả" dẫn tới danh sách đã lọc sẵn.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: bảng nhắc việc`.

### Task 18: Nhập dữ liệu từ Excel

**Files:**
- Create: `src/lib/excel.ts`, `src/server/import/{targets.ts,validate.ts,run.ts,actions.ts}`, `src/features/import/components/{upload-step.tsx,mapping-step.tsx,preview-step.tsx}`, `src/app/(app)/import/page.tsx`, `tests/fixtures/build-fixtures.ts`
- Test: `tests/unit/import.test.ts`, `tests/integration/import-run.test.ts`

**Interfaces:**
- Produces:
  - `parseWorkbook(buf)`.
  - `IMPORT_TARGETS` cho `rooms`, `tenants`, `leases`, `deposits` (số dư cọc), `debts` (công nợ đầu kỳ thành hoá đơn `manual` "Công nợ chuyển từ hệ thống cũ"), `meter_readings`, `assets`. Mỗi trường có `aliases` không dấu.
  - `suggestMapping(headers, target)`.
  - `validateRows(target, rows, mapping)`: dùng lại zod schema của các module, không viết lại luật.
  - `runImport(db, ctx, target, rows) → { created; updated }`: một transaction; upsert theo khoá tự nhiên — phòng: mã cơ sở + mã phòng; khách: passport → CCCD → mã số thuế → SĐT; hợp đồng: mã phòng + ngày bắt đầu. Ghi audit `import`. Chỉ người có quyền `settings`.
- [ ] **Step 1:** Test:
  - `suggestMapping(['Số điện thoại','Họ tên','Hết hạn visa'])` → `phone, fullName, visaExpiry`.
  - `05/03/2027` và số Excel 46451 đều thành `2027-03-05`.
  - Dòng thiếu passport → `{ row: 3, field: 'passportNumber' }`.
  - Chạy cùng file 2 lần → lần 2 `created 0`; sửa SĐT trong file rồi chạy lại → `updated 1`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt UI 3 bước:
  1. Chọn loại dữ liệu, file và sheet.
  2. Ghép cột, có gợi ý sẵn.
  3. Xem trước: số dòng hợp lệ và lỗi, bảng lỗi theo dòng, nút "Nhập N dòng hợp lệ".

  Có nút "Tải file mẫu" cho từng loại. Giới hạn 10MB và 5.000 dòng.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: nhập dữ liệu từ Excel`.

### Task 19: Điểm dừng — người dùng duyệt giao diện với dữ liệu giả

**Files:**
- Create: `docs/review/checklist.md`, `tests/e2e/{login,tenants,contracts,invoices,termination}.spec.ts`

- [ ] **Step 1:** Viết các test Playwright chạy trên Supabase dev; bỏ qua nếu thiếu `E2E_BASE_URL`.
  1. Đăng nhập nhanh bằng Admin → thấy Nhắc việc.
  2. Hùng mở `/tenants` → "Không tìm thấy".
  3. Tạo khách → tạo cọc → chuyển thành hợp đồng thuê → check-in.
  4. Ghi điện nước → tạo hoá đơn tháng → duyệt → thu tiền.
  5. Thanh lý → hoá đơn thanh lý hiện "Hoàn khách".
- [ ] **Step 2:** `npm test` → PASS toàn bộ; `npx playwright test` → PASS; `npm run lint` → sạch; `npm run build` → OK.
- [ ] **Step 3:** Chạy `db:seed --reset` trên Supabase dev; triển khai bản thử lên Vercel (preview) với `NEXT_PUBLIC_DEMO_MODE=1`.
- [ ] **Step 4:** Viết `docs/review/checklist.md`: danh sách luồng để người dùng bấm thử và ghi góp ý. Mỗi luồng gồm các bước, điều cần để ý và ô ghi chú. Thứ tự: nhắc việc → khách → cọc → hợp đồng thuê → bàn giao → điện nước → hoá đơn → gia hạn / chuyển phòng / thanh lý → tài sản → sự cố → người dùng & phân quyền → mẫu Word → nhập Excel → cài đặt.
- [ ] **Step 5:** Commit `test: e2e các luồng chính; docs: checklist duyệt`.
- [ ] **Step 6: Dừng lại.** Người dùng duyệt. Góp ý được cập nhật vào spec và plan rồi mới làm tiếp. Các task từ 20 trở đi chỉ làm sau khi giao diện đã được duyệt.

### Task 20: Xuất PDF và ảnh (Gotenberg)

**Files:**
- Create: `src/server/convert/{gotenberg.ts,index.ts}`, `docs/operations/gotenberg.md`
- Modify: `src/server/templates/service.ts`, các menu xuất
- Test: `tests/integration/convert.test.ts` (dùng fetch giả)

**Interfaces:**
- Produces: `convertDocxToPdf(docx: Blob): Promise<Blob>` gọi `POST {GOTENBERG_URL}/forms/libreoffice/convert`; `convertPdfToPng(pdf: Blob): Promise<Blob>` lấy trang đầu, dùng `/forms/chromium/screenshot/html` với pdf.js hoặc `pdftoppm` trong cùng container (builder chọn); `exportDocument(..., format: 'docx'|'pdf'|'png')`.
- [ ] **Step 1:** Test: format `pdf` gọi đúng endpoint và lưu file `application/pdf`; Gotenberg lỗi → `ValidationError('Không chuyển được sang PDF, thử lại sau')`.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. Tài liệu `gotenberg.md`: chạy image `gotenberg/gotenberg:8` (Vercel container function hoặc dịch vụ nhỏ), cài font Times New Roman và Arial, đặt `GOTENBERG_URL`. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: xuất PDF và ảnh qua Gotenberg`.

### Task 21: Chuyển file sang R2 và tự xoá ảnh sau thanh lý

**Files:**
- Create: `src/app/api/cron/purge-files/route.ts`, `vercel.ts` (cron), `scripts/migrate-storage.ts`, `docs/operations/r2.md`
- Modify: `src/server/storage/r2.ts`, trang hợp đồng (nút "Giữ lại ảnh")
- Test: `tests/integration/purge.test.ts`

**Interfaces:**
- Produces:
  - `purgeExpiredFiles(db, storage, today)`: xoá file có `delete_after ≤ today` khi hợp đồng không bật `keep_photos`, rồi ghi audit.
  - Cột `leases.keep_photos bool default false`.
  - Route cron chạy mỗi ngày, có bảo vệ bằng `CRON_SECRET`.
  - `scripts/migrate-storage.ts`: chép file từ Supabase Storage sang R2 rồi đổi `STORAGE_DRIVER=r2`.
- [ ] **Step 1:** Test: file có `delete_after` hôm qua bị xoá; hợp đồng `keep_photos` thì không xoá; biên bản đã xuất (`ownerType = 'export'`) không bao giờ bị xoá.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. Tài liệu `r2.md` gồm cách tạo bucket, CORS, khoá truy cập. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: R2, tự xoá ảnh sau thanh lý, nút giữ lại`.

### Task 22: Sao lưu cơ sở dữ liệu ra Google Drive

**Files:**
- Create: `.github/workflows/backup.yml`, `docs/operations/backup-restore.md`

- [ ] **Step 1:** Workflow chạy `cron: '0 19 * * *'` (2h sáng giờ Việt Nam), kèm `workflow_dispatch`.
  - Cài `postgresql-client` major 17.
  - Chạy `pg_dump --format=custom --no-owner --no-privileges "$BACKUP_DATABASE_URL" -f siris-backup-$(TZ=Asia/Ho_Chi_Minh date +%F).dump`, có cả schema `auth` để giữ tài khoản đăng nhập.
  - Tải lên Drive bằng `rclone` (service account, `root_folder_id`), rồi chỉ giữ 30 file mới nhất.
  - Bước nào lỗi thì workflow fail (GitHub gửi email). Secrets: `BACKUP_DATABASE_URL`, `GDRIVE_SERVICE_ACCOUNT_JSON`, `GDRIVE_FOLDER_ID`.
- [ ] **Step 2:** Viết `backup-restore.md` bằng tiếng Việt: tạo service account, chia sẻ thư mục Drive cho service account, thêm secrets, chạy tay, khôi phục bằng `pg_restore --clean --if-exists --no-owner`, và checklist chạy thử khôi phục trước khi dùng thật.
- [ ] **Step 3:** Chạy `npx --yes action-validator .github/workflows/backup.yml` → không lỗi.
- [ ] **Step 4:** Commit `ops: sao lưu cơ sở dữ liệu mỗi đêm ra Google Drive, giữ 30 bản`.

### Task 23: Chuyển sang chạy thật

**Files:**
- Create: `docs/operations/go-live.md`
- Modify: `README.md`

- [ ] **Step 1:** Viết `go-live.md`, các bước theo thứ tự:
  1. Tắt `NEXT_PUBLIC_DEMO_MODE`.
  2. Chạy `db:seed --purge-demo` (xoá dữ liệu giả và tài khoản mẫu).
  3. Tạo tài khoản admin thật (`npm run seed:admin`).
  4. Nhập dữ liệu thật từ Excel của phần mềm cũ.
  5. Tải mẫu Word thật lên.
  6. Cài đơn giá, loại phí.
  7. Bật sao lưu và chạy thử khôi phục.
  8. Chuyển file sang R2.
- [ ] **Step 2:** Cài đặt `db:seed --purge-demo` và `seed:admin` kèm test: sau khi purge không còn bản ghi nào có `is_demo = true`, tài khoản mẫu bị xoá khỏi Supabase Auth, cài đặt và mẫu Word người dùng đã tải lên vẫn còn.
- [ ] **Step 3:** `npm test` → PASS; `npm run build` → OK.
- [ ] **Step 4:** Commit `ops: hướng dẫn chuyển sang chạy thật, xoá dữ liệu giả`.
