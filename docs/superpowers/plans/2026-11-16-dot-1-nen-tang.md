# Siris — Đợt 1: Nền tảng

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng nhập, người dùng + phân quyền (tick cơ sở và nhóm quyền), cơ sở/phòng với sơ đồ phòng, cài đặt + loại phí + đơn giá, lưu file, khách thuê 3 loại với ảnh giấy tờ, trang nhắc việc visa — chạy trên Supabase với dữ liệu giả để người dùng test.

**Architecture:** Next.js App Router; trang là server components đọc qua service, ghi qua server actions; service `(db, ctx, input)` dùng Drizzle nối Postgres của Supabase; phân quyền ở server qua `AccessContext`; RLS bật không policy; logic nghiệp vụ là hàm thuần trong `src/domain/`; test service trên PGlite; dữ liệu giả nạp bằng `npm run db:seed`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle + drizzle-kit, postgres.js, @supabase/ssr, zod, react-hook-form, Vitest + PGlite, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`
**Tổng quan các đợt:** `docs/superpowers/plans/README.md` · Số Task giữ theo thứ tự chung của toàn dự án.

**Điều kiện bắt đầu:** Có project Supabase Free (URL, anon key, service role key, chuỗi kết nối Postgres) do người dùng tạo.

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

### Task 1: Khởi tạo dự án, kết nối Supabase, hạ tầng test ✅

**Files:**
- Create: dự án Next.js ở thư mục gốc (giữ `README.md`, `docs/`), `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `src/db/client.ts`, `src/lib/supabase/{server.ts,admin.ts,client.ts}`, `src/components/app-shell/{sidebar.tsx,topbar.tsx,demo-banner.tsx,nav.ts}`, `src/app/(app)/layout.tsx`, `src/app/not-found.tsx`, `tests/helpers/db.ts`, `tests/unit/smoke.test.ts`, `scripts/seed/index.ts`

**Interfaces:**
- Produces: `db` và `type DB` (`src/db/client.ts`); `createTestDb(): Promise<DB>` (PGlite mới, đã chạy mọi migration); `NAV_ITEMS: { href; label; icon; requires?: Permission }[]` — Nhắc việc `/`, Cơ sở & phòng `/facilities`, Khách thuê `/tenants` (tenants_contracts), Hợp đồng `/contracts` (tenants_contracts), Điện nước `/meters` (meters), Hoá đơn `/invoices` (billing), Tài sản `/assets` (assets), Sự cố `/incidents` (incidents); và cho `settings`: Người dùng `/users`, Mẫu giấy tờ `/templates`, Nhập dữ liệu `/import`, Cài đặt `/settings`, Nhật ký `/audit`.

- [x] **Step 1:** Chạy `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`. Nếu báo thư mục không trống thì tạo ở thư mục tạm rồi chép vào, giữ `README.md` và `docs/`. Cài `drizzle-orm postgres zod react-hook-form @hookform/resolvers @supabase/ssr @supabase/supabase-js lucide-react`, dev `drizzle-kit vitest vite-tsconfig-paths @electric-sql/pglite @playwright/test tsx`. Chạy `npx shadcn@latest init --yes` rồi thêm button, input, select, checkbox, dialog, sheet, table, tabs, badge, card, dropdown-menu, sonner, form, textarea, popover, calendar, command.
- [x] **Step 2:** `.env.example` gồm `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_DEMO_MODE`, `DEMO_PASSWORD`, `STORAGE_DRIVER` (`supabase`|`r2`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `GOTENBERG_URL`. Scripts trong package.json: `db:generate`, `db:migrate`, `db:seed`, `test`, `test:e2e`.
- [x] **Step 3:** Khung giao diện: font Be Vietnam Pro (next/font, subset `vietnamese`), thanh bên trái thu thành menu trượt khi màn hình dưới 768px, thanh trên có bộ chọn cơ sở và tên người dùng, `demo-banner` khi bật demo mode.
- [x] **Step 4:** Viết `smoke.test.ts`: `createTestDb()` rồi `select 1` phải trả 1. Chạy `npm test` → PASS. Chạy `npm run build` → OK.
- [x] **Step 5:** README ghi cách tạo project Supabase Free, điền `.env.local`, chạy migrate và seed, chạy dev.
- [x] **Step 6:** Commit `chore: khởi tạo Next.js, Supabase, Drizzle, Vitest + PGlite, khung giao diện`.

### Task 2: Tiện ích dữ liệu ✅

**Files:**
- Create: `src/domain/{phone,dates,text,money,errors}.ts`, `src/lib/action-result.ts`
- Test: `tests/unit/domain/utils.test.ts`

**Interfaces:**
- Produces: `normalizePhone(input): string | null`, `todayVN(now?)`, `parseFlexibleDate(input: string|number|Date|null|undefined): string | null`, `formatDateVN(iso)`, `addDays(iso, n)`, `diffDays(a, b)`, `daysInMonth('YYYY-MM')`, `removeDiacritics(s)`, `buildSearchText(parts)`, `formatVND(n)`, `numberToVietnameseWords(n)`; `NotFoundError`, `ForbiddenError`, `ValidationError(message, fieldErrors?)`; `toActionResult(fn)` chuyển các lỗi trên thành `ActionResult`.

- [x] **Step 1: Viết test**

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

- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt. Lưu ý: chuỗi có `/` luôn đọc là `d/m/yyyy`; ngày dạng số của Excel tính từ mốc 1899-12-30; `todayVN` dùng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`.
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat(domain): điện thoại, ngày VN, tìm không dấu, tiền bằng chữ`.

### Task 3: Đăng nhập, người dùng, phân quyền, nhật ký ✅

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

- [x] **Step 1:** Viết test.
  - `access.test.ts`: ctx có `meters` tại A → `can(meters, A)` true, `can(meters, B)` false, `can(billing, A)` false; ctx có `settings` → mọi `can` true và scope là `'all'`; `assertCan` sai cơ sở → `NotFoundError`, thiếu quyền → `ForbiddenError`.
  - `users.test.ts` (PGlite, mock admin client): `updateUserAccess` thay toàn bộ cơ sở và quyền; ctx không phải admin → `ForbiddenError`; admin tự gỡ `settings` → lỗi; có dòng audit; `is_active=false` → `loadAccessContext` trả null.
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt.
  - Middleware làm mới phiên.
  - Menu lọc theo `can`.
  - Trang Người dùng: bảng gồm tên, email, cơ sở, quyền (badge), trạng thái. Sheet có 2 nhóm checkbox "Cơ sở được truy cập" và "Nhóm quyền", mỗi quyền kèm mô tả một dòng; tick Cài đặt thì hiện "Thấy mọi cơ sở".
  - Trang Nhật ký: bảng lọc theo người, theo đối tượng.
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat(auth): đăng nhập, phân quyền theo cơ sở + nhóm quyền, người dùng, nhật ký`.

### Task 5: Cơ sở, phòng, cài đặt, loại phí, đơn giá ✅

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

- [x] **Step 1:** Viết test.
  - Người chỉ được giao A → chỉ thấy A; `getRoom` của B → `NotFoundError`.
  - Người không có `settings` tạo phòng → `ForbiddenError`.
  - Trùng mã phòng → "Mã phòng đã tồn tại trong cơ sở này".
  - `createRoomsBulk` 301–305 khi đã có 303 → `created 4, skipped ['303']`.
  - `updateSettings` với 0 hoặc 400 → lỗi.
  - `roomStatus` đúng cho cả 5 trạng thái.
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt.
  - **Trang cơ sở:** dải số liệu (tổng phòng, đang ở, trống, đã cọc, sắp trả) và **sơ đồ phòng theo tầng** (ô màu theo trạng thái, có lọc trạng thái). Nút "Thêm phòng" và "Tạo nhanh nhiều phòng" mở Sheet.
  - **Trang phòng:** thông tin phòng. Các khu hợp đồng, tài sản, điện nước, sự cố để chỗ sẵn, các task sau điền vào.
  - **Trang cài đặt (tabs):**
    - *Chung:* ngưỡng visa và hợp đồng; cách tính lẻ ngày; quy tắc hạn thanh toán mặc định (radio "Ngày __ của tháng sau" / "__ ngày sau khi duyệt"); số ngày giữ ảnh sau thanh lý.
    - *Cơ sở:* thêm/sửa cơ sở, ngày tạo hoá đơn dự kiến.
    - *Đơn vị & loại phí.*
    - *Đơn giá điện nước:* lịch sử theo cơ sở, thêm mức mới kèm ngày hiệu lực.
- [x] **Step 4:** Chạy → PASS. Chạy `db:migrate` và `db:seed` lên Supabase dev, mở trang kiểm tra bằng tài khoản Admin.
- [x] **Step 5:** Commit `feat: cơ sở, sơ đồ phòng, cài đặt, loại phí, đơn giá`.

### Task 6: Lưu file ✅

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
- [x] **Step 1:** Viết test (memory adapter): người có quyền tải lên và xác nhận → có bản ghi; người khác cơ sở → `NotFoundError`; thiếu quyền → `ForbiddenError`; xoá → adapter `delete` được gọi cho cả file chính và thumbnail.
- [x] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat(storage): lưu file qua adapter, nén ảnh, URL ký có kiểm quyền`.

### Task 7: Khách thuê ✅

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
- [x] **Step 1:** Viết test.
  - `0901 234 567` được lưu thành `+84901234567`; khách thứ hai nhập `+84 90 123 4567` → lỗi trùng.
  - Tìm `nguyen van an` hoặc `NGUYEN` ra "Nguyễn Văn An"; tìm theo đuôi passport cũng ra.
  - Khách nước ngoài thiếu passport → `fieldErrors.passportNumber`.
  - Người chỉ được giao cơ sở A không tìm thấy khách của B, và `getTenant` khách của B → `NotFoundError`.
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt.
  - **Bảng khách:** tên, loại, SĐT, giấy tờ, cơ sở, phòng đang ở, visa còn N ngày (đỏ khi ≤7, cam khi ≤ ngưỡng). Tìm kiếm có debounce, lọc theo loại và cơ sở.
  - **Form:** chọn loại khách trước (3 nút lớn) rồi mới hiện các trường tương ứng. Dưới ô SĐT hiện "Sẽ lưu: +84 90 123 4567".
  - **Trang chi tiết:** thông tin theo loại khách; ảnh giấy tờ (chụp hoặc tải lên, bấm để xem lớn); các khu hợp đồng và công nợ để chỗ sẵn cho task sau.
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat: khách thuê 3 loại, tìm không dấu, ảnh giấy tờ`.

### Task 7b: Trang nhắc việc (bản đầu — visa) ✅

**Files:**
- Create: `src/domain/reminders.ts`, `src/server/dashboard/service.ts`, `src/app/(app)/page.tsx`, `src/features/dashboard/components/{reminder-card.tsx,stat-strip.tsx}`
- Test: `tests/unit/domain/reminders.test.ts`

**Interfaces:**
- Produces: `Reminder { kind; title; count; items: { label; sub; href; severity: 'danger'|'warning'|'info' }[] }`; `buildReminders(snapshot, ctx, today, settings): Reminder[]` — đợt này chỉ có loại `visa_expiring` (tenants_contracts, lọc theo cơ sở): `visa_expiry ≤ today + visaWarningDays`, gồm cả đã hết hạn, sắp xếp tăng dần; các đợt sau thêm loại mới vào cùng hàm (Task 17). `getDashboard(db, ctx)`.

- [x] **Step 1:** Test với `today='2026-11-16'`, ngưỡng 30: visa còn 0 / −6 / 30 ngày có mặt, 31 ngày không; người không có `tenants_contracts` → không có thẻ; người chỉ cơ sở A không thấy khách B; đổi ngưỡng 60 → visa còn 55 ngày xuất hiện.
- [x] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt UI: dải số liệu (tổng phòng, số khách, số visa sắp hết), thẻ "Visa sắp hết hạn" tối đa 8 dòng + "Xem tất cả" (danh sách khách lọc sẵn); badge đỏ "Đã hết hạn" khi đã quá, cam khi ≤ 7 ngày. **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat: trang nhắc việc — visa sắp hết hạn`.

### Điểm dừng đợt 1: người dùng test

- [ ] **Step 1:** `npm test` → PASS toàn bộ; `npm run lint` sạch; `npm run build` OK.
- [x] **Step 2:** Playwright (chạy trên Supabase dev, bỏ qua nếu thiếu `E2E_BASE_URL`) cho các luồng: đăng nhập nhanh bằng Admin thấy Nhắc việc; Hùng mở `/tenants` → "Không tìm thấy"; Admin tick thêm quyền cho Vy rồi Vy thấy menu mới; tạo nhanh phòng 501–503; thêm khách nước ngoài với SĐT trùng → báo lỗi, đổi số → lưu; tìm `nguyen van an`. `npx playwright test` → PASS.
- [ ] **Step 3:** `npm run db:migrate && npm run db:seed -- --reset` trên Supabase dev; triển khai bản thử lên Vercel (preview) với `NEXT_PUBLIC_DEMO_MODE=1`.
- [x] **Step 4:** Viết `docs/review/dot-1-checklist.md`: từng luồng cần bấm thử (các bước, điều cần để ý, ô ghi chú) cho phần của đợt này.
- [x] **Step 5:** Commit `test: e2e và checklist test đợt 1` (`4d71407`).
- [ ] **Step 6: Dừng lại.** Gửi link bản thử + checklist cho người dùng. Góp ý được cập nhật vào spec và kế hoạch các đợt sau rồi mới bắt đầu đợt tiếp theo.
