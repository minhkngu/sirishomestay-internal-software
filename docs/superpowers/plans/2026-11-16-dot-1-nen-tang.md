# Giai đoạn B · Đợt 1 — Nền tảng (gắn cơ sở dữ liệu): Implementation Plan

> **Trạng thái: CHƯA THỰC HIỆN.** Làm sau khi giao diện giai đoạn A (`2026-11-16-giai-doan-a-giao-dien-du-lieu-gia.md`) được người dùng duyệt. Kế hoạch này sẽ được viết lại khi đó: dự án đã có sẵn (bỏ phần khởi tạo), các hàm trong `src/domain/` dùng lại, việc chính là thay `MockRepo` bằng `SupabaseRepo` + server actions, đăng nhập thật, R2, sao lưu. Nội dung dưới đây (lược đồ, phân quyền server, test PGlite, sao lưu) giữ làm tham chiếu.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web nội bộ chạy được với đăng nhập nhân viên, phân quyền theo cơ sở + nhóm quyền (dạng tick), quản lý cơ sở/phòng, khách thuê (nước ngoài / Việt Nam / công ty) kèm ảnh giấy tờ, bảng nhắc việc (visa sắp hết hạn), nhập dữ liệu từ Excel, và sao lưu cơ sở dữ liệu mỗi đêm ra Google Drive.

**Architecture:** Next.js App Router (TypeScript) render server-side; mọi đọc/ghi dữ liệu đi qua server actions / server queries dùng Drizzle ORM kết nối thẳng Postgres của Supabase. Supabase Auth chỉ dùng cho đăng nhập; **phân quyền thực thi ở tầng server** qua một `AccessContext` duy nhất. RLS bật và không có policy nào (chặn mọi truy cập qua anon key / PostgREST). File lưu ở Cloudflare R2 qua một adapter. Test chạy trên PGlite (Postgres nhúng, không cần Docker).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, Drizzle ORM + drizzle-kit, `postgres` (postgres.js), `@supabase/ssr` + `@supabase/supabase-js`, zod, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2), `browser-image-compression`, `exceljs`, Vitest + `@electric-sql/pglite`, Playwright (1 smoke test), npm.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`

## Global Constraints

- Giao diện tiếng Việt hoàn toàn (nhãn, thông báo lỗi, định dạng). Code, tên biến, tên bảng bằng tiếng Anh.
- Tiền: số nguyên VND (`bigint`/`integer`), hiển thị `1.500.000`. Ngày nghiệp vụ: kiểu `date`, hiển thị `dd/mm/yyyy`. "Hôm nay" luôn tính theo múi giờ `Asia/Ho_Chi_Minh`.
- Số điện thoại lưu chuẩn E.164 (`+84901234567`), duy nhất.
- Nhóm quyền cố định: `tenants_contracts` (Khách & hợp đồng), `billing` (Hoá đơn & thu tiền), `meters` (Ghi điện nước), `assets` (Tài sản & kho), `incidents` (Sự cố & sửa chữa), `settings` (Cài đặt — kiêm admin, thấy mọi cơ sở). Quyền giống nhau ở mọi cơ sở được giao.
- Số passport/CCCD và ảnh giấy tờ chỉ người có `tenants_contracts` (hoặc `settings`) xem được.
- Phân quyền kiểm tra ở server; ẩn nút trên UI chỉ là phụ.
- Mọi thao tác ghi (tạo/sửa/xoá) cơ sở, phòng, khách, người dùng, cài đặt đều ghi `audit_logs`.
- Ảnh nén trên trình duyệt trước khi tải lên: cạnh dài tối đa 1600px, chất lượng ~0.75, kèm thumbnail 300px.
- Hạ tầng: Supabase Free (Postgres + Auth), Cloudflare R2 cho file, Vercel cho app. Sao lưu: chỉ cơ sở dữ liệu, mỗi đêm ra Google Drive, giữ 30 bản.
- Không dùng extension Postgres ngoài mặc định (để chạy được trên PGlite và Supabase như nhau).

## Review Focus

1. **Số điện thoại nhập nhiều kiểu** (`0901 234 567`, `0901-234-567`, `84901234567`, `+84 90 123 4567`, số nước ngoài `+1 415 555 0100`) phải chuẩn hoá về cùng một giá trị; nhập trùng số đã có phải báo lỗi tiếng Việt rõ ràng, không phải lỗi 500. → test ở Task 3 và Task 8.
2. **Người dùng mở thẳng URL / gọi action của cơ sở không được giao** (ví dụ `/rooms/<id>` của cơ sở B khi chỉ được giao A) phải nhận 404, không lộ dữ liệu. → test ở Task 4 và Task 7.
3. **Tìm kiếm không dấu**: gõ `nguyen van a` hoặc `NGUYEN` phải ra "Nguyễn Văn A"; gõ một phần số passport/điện thoại cũng ra. → test ở Task 8.
4. **Ngày trong Excel** có thể là ngày thật của Excel, chuỗi `dd/mm/yyyy`, `d/m/yyyy` hoặc `yyyy-mm-dd`; `05/03/2027` phải hiểu là 5 tháng 3, không phải 3 tháng 5. Nhập lại cùng file không tạo trùng. → test ở Task 3 và Task 11.
5. **Ranh giới visa**: visa hết hạn hôm nay, đã hết hạn, và hết hạn đúng ngày thứ 30 đều phải hiện trên bảng nhắc việc; "hôm nay" tính theo giờ Việt Nam (lúc 6h sáng giờ VN vẫn là ngày hôm trước theo UTC). → test ở Task 10.

---

## Cấu trúc file

```
src/
  app/
    (auth)/login/page.tsx              trang đăng nhập
    (app)/layout.tsx                   khung app: thanh điều hướng theo quyền
    (app)/page.tsx                     bảng nhắc việc
    (app)/facilities/...               cơ sở + phòng
    (app)/tenants/...                  khách thuê
    (app)/users/...                    người dùng
    (app)/settings/page.tsx            cài đặt chung
    (app)/import/page.tsx              nhập Excel
    api/files/[...key]/route.ts        cấp URL ký cho file (kiểm quyền)
  db/
    client.ts                          kết nối Drizzle (postgres.js) — dùng chung
    schema/{users,facilities,tenants,settings,audit}.ts
    index.ts                           re-export schema
  lib/
    access.ts                          PERMISSIONS, AccessContext, can/assert/scope
    session.ts                         getAccessContext() từ Supabase Auth + DB
    audit.ts                           recordAudit()
    phone.ts  dates.ts  text.ts  money.ts
    supabase/{server.ts,admin.ts}
    storage/{types.ts,r2.ts,index.ts}
    image/compress.ts                  (client)
  features/
    users/{actions.ts,queries.ts,schemas.ts,components/*}
    facilities/{...}  rooms/{...}  tenants/{...}  settings/{...}  dashboard/{...}
    import/{parse.ts,mappers.ts,run.ts,actions.ts,components/*}
  middleware.ts                        làm mới phiên, chuyển về /login
tests/
  helpers/db.ts                        tạo PGlite + chạy migration cho mỗi file test
  unit/*.test.ts  integration/*.test.ts  e2e/smoke.spec.ts
drizzle/                               migration SQL do drizzle-kit sinh
scripts/seed-admin.ts
.github/workflows/backup.yml
docs/operations/backup-restore.md
```

Quy ước: mỗi `features/<x>/actions.ts` là `"use server"`, mỗi action **bắt đầu bằng** `const ctx = await getAccessContext()` rồi `assert...`, nhận input qua zod schema trong `schemas.ts`, trả `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }`. Logic DB tách thành hàm thuần nhận `(db, ctx, input)` trong `queries.ts`/`service` để test được trên PGlite mà không cần Next.

---

### Task 1: Khởi tạo dự án và hạ tầng test

**Files:**
- Create: dự án Next.js tại thư mục gốc (giữ `README.md`, `docs/`), `drizzle.config.ts`, `vitest.config.ts`, `.env.example`, `src/db/client.ts`, `tests/helpers/db.ts`, `tests/unit/smoke.test.ts`
- Modify: `README.md` (cách chạy dev, test, biến môi trường)

**Interfaces:**
- Produces: `db` (Drizzle instance, `src/db/client.ts`); `type DB = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>` (export `DB`); `createTestDb(): Promise<DB>` (tests/helpers/db.ts) — PGlite mới, đã chạy toàn bộ migration trong `drizzle/`.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes` (nếu báo thư mục không trống, tạo ở thư mục tạm rồi chép vào, giữ `README.md`/`docs/`). Cài `drizzle-orm postgres zod @supabase/ssr @supabase/supabase-js` và dev `drizzle-kit vitest @electric-sql/pglite vite-tsconfig-paths tsx`. `npx shadcn@latest init --yes` (base color neutral). Bật `"strict": true`.
- [ ] **Step 2:** `.env.example` gồm: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. `drizzle.config.ts` trỏ `src/db/schema/*`, out `drizzle/`, dialect postgresql. Scripts: `db:generate`, `db:migrate`, `test`, `test:e2e`, `seed:admin`.
- [ ] **Step 3:** Viết `tests/unit/smoke.test.ts`: `createTestDb()` rồi `db.execute(sql\`select 1 as x\`)` trả `x = 1`.
- [ ] **Step 4:** Chạy `npm test` → PASS. Chạy `npm run build` → build thành công.
- [ ] **Step 5:** Commit `chore: khởi tạo Next.js, Drizzle, Vitest + PGlite`.

### Task 2: Lược đồ dữ liệu lõi

**Files:**
- Create: `src/db/schema/users.ts`, `facilities.ts`, `tenants.ts`, `settings.ts`, `audit.ts`, `src/db/index.ts`, migration trong `drizzle/` (sinh bằng `npm run db:generate`) + một migration SQL viết tay `enable_rls` bật RLS cho mọi bảng
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces (bảng, cột tiếng Anh, `id uuid default gen_random_uuid()`, `created_at/updated_at timestamptz`):
  - `user_profiles(id uuid pk = auth user id, email text unique, full_name text, is_active bool default true)`
  - `user_facilities(user_id, facility_id)` pk kép
  - `user_permissions(user_id, permission text)` pk kép; `permission` ∈ 6 giá trị trong Global Constraints (check constraint)
  - `facilities(id, code text unique, name text, address text, note text, is_active bool default true)`
  - `rooms(id, facility_id fk, code text, floor text null, room_type text null, area_m2 numeric null, list_price integer null, capacity integer null, note text, is_active bool)`; unique `(facility_id, code)`
  - `tenants(id, kind tenant_kind enum('foreign','vietnamese','company'), home_facility_id fk facilities, phone text unique null, email text null, note text, full_name text null, nationality text null, passport_number text null, passport_expiry date null, visa_type text null, visa_expiry date null, id_number text null, id_issue_date date null, id_issue_place text null, date_of_birth date null, permanent_address text null, company_name text null, tax_code text null, company_address text null, representative text null, contact_person text null, search_text text not null default '')`; check: `kind<>'company'` ⇒ `full_name` và `phone` not null; `kind='company'` ⇒ `company_name`, `tax_code` not null; `kind='foreign'` ⇒ `passport_number` not null; `kind='vietnamese'` ⇒ `id_number` not null. Unique partial: `passport_number` (where kind='foreign'), `id_number` (where kind='vietnamese'), `tax_code` (where kind='company').
  - `tenant_documents(id, tenant_id fk cascade, storage_key text, thumb_key text, content_type text, label text, uploaded_by uuid, created_at)`
  - `app_settings(key text pk, value jsonb)`
  - `audit_logs(id, user_id uuid null, action text, entity text, entity_id uuid null, facility_id uuid null, before jsonb null, after jsonb null, created_at)`
  - Ghi chú: `home_facility_id` = cơ sở quản lý khách (quyết định của Claude — khách chưa có hợp đồng vẫn cần thuộc một cơ sở để phân quyền). Đợt 2 khách còn thấy được qua hợp đồng.

- [ ] **Step 1:** Viết test `schema.test.ts`: (a) chèn 2 phòng cùng `code` trong một cơ sở → lỗi unique; cùng `code` ở 2 cơ sở → được; (b) chèn tenant `kind='foreign'` thiếu `passport_number` → lỗi check; (c) chèn `user_permissions` với `permission='superuser'` → lỗi check; (d) 2 tenant cùng `phone` → lỗi unique; 2 tenant company `phone = null` → được.
- [ ] **Step 2:** `npm test -- schema` → FAIL (bảng chưa có).
- [ ] **Step 3:** Viết schema Drizzle, `npm run db:generate`, thêm migration `enable_rls` (`alter table ... enable row level security` cho mọi bảng trên, không tạo policy).
- [ ] **Step 4:** `npm test -- schema` → PASS.
- [ ] **Step 5:** Commit `feat(db): lược đồ người dùng, cơ sở, phòng, khách, cài đặt, nhật ký`.

### Task 3: Tiện ích dữ liệu (điện thoại, ngày, chữ, tiền)

**Files:**
- Create: `src/lib/phone.ts`, `src/lib/dates.ts`, `src/lib/text.ts`, `src/lib/money.ts`
- Test: `tests/unit/phone.test.ts`, `dates.test.ts`, `text.test.ts`, `money.test.ts`

**Interfaces:**
- Produces:
  - `normalizePhone(input: string): string | null` — trả E.164 hoặc `null` nếu không hợp lệ.
  - `todayVN(now?: Date): string` — `yyyy-mm-dd` theo `Asia/Ho_Chi_Minh`.
  - `parseFlexibleDate(input: string | number | Date | null | undefined): string | null` — trả `yyyy-mm-dd`.
  - `formatDateVN(iso: string | null): string` — `dd/mm/yyyy`, rỗng nếu null.
  - `addDays(iso: string, n: number): string`
  - `removeDiacritics(s: string): string` (đ→d, Đ→D), `buildSearchText(parts: (string | null | undefined)[]): string` (bỏ dấu, chữ thường, gộp khoảng trắng, nối bằng một khoảng trắng; số điện thoại thêm cả dạng `0xxxxxxxxx`).
  - `formatVND(n: number): string` → `1.500.000`.

- [ ] **Step 1: Viết test**

```ts
// phone
expect(normalizePhone('0901 234 567')).toBe('+84901234567')
expect(normalizePhone('0901-234-567')).toBe('+84901234567')
expect(normalizePhone('84901234567')).toBe('+84901234567')
expect(normalizePhone('+84 90 123 4567')).toBe('+84901234567')
expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100')
expect(normalizePhone('12345')).toBeNull()
// dates
expect(todayVN(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16')
expect(parseFlexibleDate('05/03/2027')).toBe('2027-03-05')
expect(parseFlexibleDate('5/3/2027')).toBe('2027-03-05')
expect(parseFlexibleDate('2027-03-05')).toBe('2027-03-05')
expect(parseFlexibleDate(46451)).toBe('2027-03-05')   // số ngày Excel
expect(parseFlexibleDate('31/02/2027')).toBeNull()
expect(formatDateVN('2027-03-05')).toBe('05/03/2027')
// text
expect(removeDiacritics('Nguyễn Văn Đức')).toBe('Nguyen Van Duc')
expect(buildSearchText(['Nguyễn  Văn A', '+84901234567'])).toBe('nguyen van a +84901234567 0901234567')
// money
expect(formatVND(1500000)).toBe('1.500.000')
```

- [ ] **Step 2:** `npm test -- unit` → FAIL.
- [ ] **Step 3:** Cài đặt. `normalizePhone`: bỏ ký tự không phải số trừ `+` đầu; `0` + 9 số → `+84…`; bắt đầu `84` + 9 số → `+84…`; có `+` → giữ, yêu cầu tổng 8–15 chữ số. `todayVN` dùng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`. Số Excel: epoch 1899-12-30. Chuỗi có `/` luôn là `d/m/yyyy`.
- [ ] **Step 4:** `npm test -- unit` → PASS.
- [ ] **Step 5:** Commit `feat(lib): chuẩn hoá điện thoại, ngày VN, tìm không dấu, định dạng tiền`.

### Task 4: Đăng nhập, phân quyền và khung app

**Files:**
- Create: `src/lib/access.ts`, `src/lib/session.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx` + action, `src/app/(app)/layout.tsx`, `src/components/app-nav.tsx`, `scripts/seed-admin.ts`
- Test: `tests/unit/access.test.ts`, `tests/integration/session.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSIONS = ['tenants_contracts','billing','meters','assets','incidents','settings'] as const`; `type Permission`; `PERMISSION_LABELS: Record<Permission, string>` (nhãn tiếng Việt như Global Constraints).
  - `type AccessContext = { userId: string; email: string; fullName: string; permissions: Set<Permission>; facilityIds: Set<string>; isAdmin: boolean }` (`isAdmin = permissions.has('settings')`).
  - `can(ctx, perm: Permission, facilityId?: string): boolean` — admin luôn true; ngược lại cần có `perm` và (nếu truyền) `facilityId ∈ facilityIds`.
  - `assertCan(ctx, perm, facilityId?)` — ném `NotFoundError` (dùng `notFound()` ở route, `{ok:false,error:'Không tìm thấy'}` ở action) khi sai cơ sở; ném `ForbiddenError` khi thiếu nhóm quyền.
  - `facilityScope(ctx): string[] | 'all'`.
  - `loadAccessContext(db: DB, userId: string): Promise<AccessContext | null>` — null nếu không có profile hoặc `is_active = false`.
  - `getAccessContext(): Promise<AccessContext>` — đọc user từ Supabase (`auth.getUser()`), gọi `loadAccessContext`, chuyển về `/login` nếu null.
  - `ActionResult<T>` (khai báo trong `src/lib/action-result.ts`).

- [ ] **Step 1: Viết test**
  - `access.test.ts`: ctx có `meters` + cơ sở A → `can(ctx,'meters',A)` true, `can(ctx,'meters',B)` false, `can(ctx,'billing',A)` false; ctx có `settings` → mọi `can` true, `facilityScope` = `'all'`; `assertCan` sai cơ sở → `NotFoundError`, thiếu quyền → `ForbiddenError`.
  - `session.test.ts` (PGlite): tạo profile + quyền + cơ sở → `loadAccessContext` trả đúng tập; `is_active=false` → null; không có profile → null.
- [ ] **Step 2:** `npm test -- access session` → FAIL.
- [ ] **Step 3:** Cài đặt `access.ts`, `session.ts`, Supabase server client (`@supabase/ssr` cookies), middleware làm mới phiên và chuyển người chưa đăng nhập về `/login` (trừ `/login`). Trang đăng nhập email + mật khẩu (shadcn Card/Input/Button), lỗi hiển thị "Email hoặc mật khẩu không đúng". Layout `(app)`: thanh bên với mục hiện theo quyền — Nhắc việc (mọi người), Cơ sở & phòng (mọi người, chỉ xem nếu không `settings`), Khách thuê (`tenants_contracts`), Người dùng / Cài đặt / Nhập dữ liệu (`settings`); góc phải tên người dùng + Đăng xuất. Trên điện thoại thanh bên thu thành menu.
- [ ] **Step 4:** `scripts/seed-admin.ts` (`npm run seed:admin -- --email x --name "Y"`): tạo user Supabase bằng service role với mật khẩu ngẫu nhiên in ra một lần, tạo `user_profiles` + quyền `settings`.
- [ ] **Step 5:** `npm test` → PASS; `npm run build` → OK.
- [ ] **Step 6:** Commit `feat(auth): đăng nhập, AccessContext, phân quyền theo cơ sở và nhóm quyền`.

### Task 5: Nhật ký thao tác

**Files:**
- Create: `src/lib/audit.ts`
- Test: `tests/integration/audit.test.ts`

**Interfaces:**
- Produces: `recordAudit(db: DB, ctx: AccessContext, e: { action: 'create'|'update'|'delete'|'import'; entity: string; entityId?: string; facilityId?: string; before?: unknown; after?: unknown }): Promise<void>`. Gọi trong cùng transaction với thao tác ghi. Trường nhạy cảm (`passport_number`, `id_number`) vẫn ghi (nhật ký chỉ admin xem).

- [ ] **Step 1:** Test: gọi `recordAudit` trong transaction rồi rollback → không còn dòng; commit → có dòng với `user_id = ctx.userId`.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(audit): ghi nhật ký thao tác`.

### Task 6: Quản lý người dùng (tick cơ sở + nhóm quyền)

**Files:**
- Create: `src/features/users/{schemas.ts,service.ts,actions.ts,queries.ts}`, `src/features/users/components/{user-form.tsx,user-table.tsx}`, `src/app/(app)/users/page.tsx`, `src/app/(app)/users/[id]/page.tsx`
- Test: `tests/integration/users.test.ts`

**Interfaces:**
- Consumes: `assertCan`, `recordAudit`, `supabaseAdmin()` (`src/lib/supabase/admin.ts`).
- Produces:
  - `userInput = z.object({ email, fullName, facilityIds: z.array(uuid), permissions: z.array(z.enum(PERMISSIONS)).min(1) })`.
  - `saveUserAccess(db, ctx, userId, input: { fullName; facilityIds; permissions; isActive }): Promise<void>` — thay toàn bộ `user_facilities`/`user_permissions` của user.
  - Actions: `createUser(input)` (tạo auth user qua admin API, mật khẩu tạm ngẫu nhiên trả về một lần để admin gửi cho nhân viên), `updateUser(id, input)`, `setUserActive(id, active)`, `resetUserPassword(id)` → trả mật khẩu tạm mới.
  - Quy tắc: chỉ `settings`; admin không tự gỡ quyền `settings` của chính mình hoặc tự khoá chính mình (lỗi "Không thể tự gỡ quyền quản trị của chính bạn").

- [ ] **Step 1:** Test `saveUserAccess`: lưu 2 cơ sở + `billing,meters` → `loadAccessContext` khớp; lưu lại 1 cơ sở + `meters` → tập cũ bị thay; ctx không phải admin → `ForbiddenError`; admin tự gỡ `settings` của mình → lỗi; có dòng audit.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt service + actions + UI: bảng người dùng (tên, email, cơ sở, nhóm quyền dạng badge, trạng thái); form với hai nhóm checkbox "Cơ sở được truy cập" và "Nhóm quyền" (nhãn tiếng Việt, mô tả ngắn dưới mỗi nhóm); tick `settings` thì hiện ghi chú "Thấy mọi cơ sở". **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(users): quản lý người dùng, tick cơ sở và nhóm quyền`.

### Task 7: Cơ sở và phòng

**Files:**
- Create: `src/features/facilities/{schemas.ts,service.ts,actions.ts}`, `src/features/rooms/{schemas.ts,service.ts,actions.ts}`, components, `src/app/(app)/facilities/page.tsx`, `src/app/(app)/facilities/[id]/page.tsx`, `src/app/(app)/rooms/[id]/page.tsx`
- Test: `tests/integration/facilities-rooms.test.ts`

**Interfaces:**
- Produces:
  - `listFacilities(db, ctx): Promise<Facility[]>` — lọc theo `facilityScope`.
  - `getFacility(db, ctx, id)` / `getRoom(db, ctx, id)` — ném `NotFoundError` nếu ngoài phạm vi.
  - `createFacility/updateFacility` (chỉ `settings`); `createRoom/updateRoom/setRoomActive(db, ctx, …)` (chỉ `settings`); `listRooms(db, ctx, { facilityId, q?, includeInactive? })`.
  - `createRoomsBulk(db, ctx, facilityId, { prefix?: string; floor: string; from: number; to: number; roomType?; listPrice?; capacity? })` — tạo nhanh phòng theo dải (ví dụ tầng 3, 301–310), bỏ qua mã đã tồn tại, trả `{ created: number; skipped: string[] }`.
  - Trạng thái phòng đợt 1 luôn hiển thị "Trống" (đợt 2 suy ra từ hợp đồng) — UI để sẵn cột.
  - Không xoá cứng cơ sở/phòng: chỉ `is_active=false`.

- [ ] **Step 1:** Test: người dùng chỉ có cơ sở A gọi `listFacilities` → chỉ A; `getRoom` phòng thuộc B → `NotFoundError`; người không có `settings` gọi `createRoom` → `ForbiddenError`; tạo trùng mã phòng → `{ok:false, error:'Mã phòng đã tồn tại trong cơ sở này'}`; `createRoomsBulk` 301–305 khi 303 đã có → `created 4, skipped ['303']`.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt + UI: danh sách cơ sở dạng thẻ (số phòng); trang cơ sở có bảng phòng (lọc tầng, tìm mã), nút "Thêm phòng" và "Tạo nhanh nhiều phòng"; form dùng `Sheet` bên phải để không rời trang. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(facilities): cơ sở và phòng, tạo nhanh nhiều phòng`.

### Task 8: Khách thuê

**Files:**
- Create: `src/features/tenants/{schemas.ts,service.ts,actions.ts,mask.ts}`, components (`tenant-form.tsx` có 3 tab loại khách, `tenant-table.tsx`), `src/app/(app)/tenants/page.tsx`, `src/app/(app)/tenants/new/page.tsx`, `src/app/(app)/tenants/[id]/page.tsx`
- Test: `tests/integration/tenants.test.ts`, `tests/unit/tenant-schema.test.ts`

**Interfaces:**
- Consumes: `normalizePhone`, `parseFlexibleDate`, `buildSearchText`, `assertCan`, `recordAudit`.
- Produces:
  - `tenantInput = z.discriminatedUnion('kind', [foreignSchema, vietnameseSchema, companySchema])`, chung: `homeFacilityId`, `phone` (bắt buộc với cá nhân, tuỳ chọn với công ty; transform qua `normalizePhone`, lỗi "Số điện thoại không hợp lệ"), `email` (tuỳ chọn, kiểm định dạng), `note`. CCCD: đúng 12 chữ số. Mã số thuế: 10 hoặc 13 chữ số (cho phép dấu `-` ở dạng 10-3).
  - `createTenant(db, ctx, input) / updateTenant(db, ctx, id, input)` — cần `tenants_contracts` tại `homeFacilityId`; cập nhật `search_text` từ tên/tên công ty, điện thoại, email, passport, CCCD, mã số thuế. Trùng → lỗi tiếng Việt theo trường: "Số điện thoại đã thuộc về khách khác", "Số passport đã tồn tại", "Số CCCD đã tồn tại", "Mã số thuế đã tồn tại".
  - `searchTenants(db, ctx, { q?, kind?, facilityId?, limit=50, offset })` — lọc theo phạm vi cơ sở; `q` → `buildSearchText([q])` rồi `search_text ILIKE %q%`.
  - `getTenant(db, ctx, id)`; `maskTenant(t, ctx)` — người không có `tenants_contracts` (ví dụ chỉ `billing`) thấy `passport_number`/`id_number` dạng `•••••1234`. (Đợt 1 trang khách chỉ mở cho `tenants_contracts`; `maskTenant` dùng cho các màn hình đợt sau.)
  - `displayName(t)`: công ty → `company_name`, cá nhân → `full_name`.

- [ ] **Step 1:** Test: số `0901 234 567` lưu thành `+84901234567`; tạo khách thứ hai với `+84 90 123 4567` → lỗi "Số điện thoại đã thuộc về khách khác"; tìm `nguyen van a` ra "Nguyễn Văn A"; tìm `NGUYEN` ra; tìm `1234` (đuôi passport) ra; khách foreign thiếu passport → `fieldErrors.passportNumber`; CCCD 11 số → lỗi; người chỉ được giao cơ sở A tìm kiếm không thấy khách của B và `getTenant` khách B → `NotFoundError`; `maskTenant` với ctx chỉ có `billing` che số giấy tờ.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt + UI: danh sách có ô tìm kiếm (debounce), lọc loại khách và cơ sở, cột: tên, loại, điện thoại, giấy tờ, visa hết hạn (tô đỏ nếu ≤ ngưỡng); form chọn loại khách trước rồi hiện trường tương ứng; trang chi tiết có khu ảnh giấy tờ (Task 9). **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(tenants): khách nước ngoài, Việt Nam, công ty; tìm không dấu`.

### Task 9: Lưu file (R2) và ảnh giấy tờ khách

**Files:**
- Create: `src/lib/storage/{types.ts,r2.ts,memory.ts,index.ts}`, `src/lib/image/compress.ts`, `src/features/tenants/documents.ts` (service + actions), `src/features/tenants/components/tenant-documents.tsx`, `src/app/api/files/[...key]/route.ts`
- Test: `tests/integration/tenant-documents.test.ts`

**Interfaces:**
- Produces:
  - `interface StorageAdapter { createUploadUrl(key: string, contentType: string, maxBytes: number): Promise<string>; createDownloadUrl(key: string, expiresSec: number): Promise<string>; delete(key: string): Promise<void> }`; `getStorage(): StorageAdapter` (R2 khi có biến môi trường, `memory` trong test).
  - Khoá file: `tenants/{tenantId}/docs/{uuid}.webp` và `…/{uuid}_thumb.webp`.
  - `compressImage(file: File): Promise<{ main: Blob; thumb: Blob }>` (client; 1600px/0.75 và 300px; WebP, fallback JPEG).
  - `requestTenantDocUpload(tenantId, contentType)` → `{ key, thumbKey, uploadUrl, thumbUploadUrl }` (giới hạn 2MB/ảnh); `confirmTenantDoc(tenantId, { key, thumbKey, label })` → tạo `tenant_documents`; `deleteTenantDoc(id)`; `listTenantDocs(db, ctx, tenantId)`.
  - Route `GET /api/files/<key>`: tìm bản ghi sở hữu key, `assertCan(ctx,'tenants_contracts', homeFacilityId)`, chuyển hướng 302 sang URL ký 5 phút. Không bao giờ trả URL công khai cố định.

- [ ] **Step 1:** Test (memory adapter): người có quyền xin URL tải lên và xác nhận → có bản ghi; người khác cơ sở → `NotFoundError`; người không có `tenants_contracts` → `ForbiddenError`; xoá → adapter `delete` được gọi cho cả hai key; `confirmTenantDoc` với key không nằm dưới `tenants/{tenantId}/` → từ chối.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt + UI: nút "Thêm ảnh giấy tờ" (cho chụp bằng camera trên điện thoại `accept="image/*" capture`), nén, tải lên thẳng R2 bằng URL ký, lưới thumbnail, bấm xem ảnh lớn, xoá có xác nhận. Ghi chú cấu hình CORS của bucket R2 trong README. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(storage): R2 adapter, nén ảnh, ảnh giấy tờ khách`.

### Task 10: Cài đặt chung và bảng nhắc việc (visa)

**Files:**
- Create: `src/features/settings/{service.ts,actions.ts}`, `src/app/(app)/settings/page.tsx`, `src/features/dashboard/{queries.ts,components/reminder-card.tsx}`, `src/app/(app)/page.tsx`
- Test: `tests/integration/dashboard.test.ts`, `tests/integration/settings.test.ts`

**Interfaces:**
- Produces:
  - `SETTINGS_DEFAULTS = { visaWarningDays: 30, contractWarningDays: 30, proration: 'actual_days' as 'days_30' | 'actual_days' }` (đợt 1 chỉ dùng `visaWarningDays`, các khoá khác khai báo sẵn cho đợt sau).
  - `getSettings(db): Promise<typeof SETTINGS_DEFAULTS>` (gộp mặc định + `app_settings`); `updateSettings(db, ctx, partial)` (chỉ `settings`, số ngày 1–365).
  - `getExpiringVisas(db, ctx, today: string = todayVN()): Promise<{ tenantId; name; facilityName; visaExpiry: string; daysLeft: number }[]>` — `kind='foreign'` và `visa_expiry <= today + visaWarningDays`, gồm cả đã hết hạn (daysLeft âm), sắp xếp tăng dần; lọc theo phạm vi cơ sở; chỉ trả nếu `can(ctx,'tenants_contracts')`, ngược lại `[]`.
  - Bảng nhắc việc là lưới `ReminderCard` (tiêu đề, số lượng, danh sách tối đa 10 dòng, link "Xem tất cả"); đợt 1 có một thẻ "Visa sắp hết hạn"; badge đỏ "Đã hết hạn" khi daysLeft < 0, cam khi ≤ 7.

- [ ] **Step 1:** Test với `today='2026-11-16'`, ngưỡng 30: visa `2026-11-16` (0), `2026-11-10` (−6), `2026-12-16` (30) có mặt; `2026-12-17` không; người không có `tenants_contracts` → `[]`; người chỉ cơ sở A không thấy khách B; đổi ngưỡng thành 60 → `2027-01-10` xuất hiện. `updateSettings` với 0 hoặc 400 → lỗi.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt + UI trang cài đặt (form số ngày cảnh báo visa, hợp đồng; cách tính lẻ ngày — lưu sẵn) và trang chủ. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(dashboard): bảng nhắc việc visa sắp hết hạn, cài đặt chung`.

### Task 11: Nhập dữ liệu từ Excel (cơ sở/phòng, khách)

**Files:**
- Create: `src/features/import/{parse.ts,targets.ts,validate.ts,run.ts,actions.ts}`, components (`upload-step.tsx`, `mapping-step.tsx`, `preview-step.tsx`), `src/app/(app)/import/page.tsx`
- Test: `tests/unit/import-validate.test.ts`, `tests/integration/import-run.test.ts`, fixture `tests/fixtures/rooms.xlsx`, `tests/fixtures/tenants.xlsx` (tạo bằng exceljs trong file helper `tests/fixtures/build.ts`)

**Interfaces:**
- Produces:
  - `parseWorkbook(buf: ArrayBuffer): Promise<{ sheets: { name: string; headers: string[]; rows: Record<string, unknown>[] }[] }>` (exceljs; dòng đầu là tiêu đề; bỏ dòng trống).
  - `IMPORT_TARGETS: Record<'rooms'|'tenants', { label: string; fields: { key: string; label: string; required: boolean; aliases: string[] }[] }>` — `aliases` (không dấu, thường) dùng để tự gợi ý ghép cột, ví dụ phone ← `['sdt','so dien thoai','dien thoai','phone']`.
    - rooms: `facilityCode`, `facilityName`, `roomCode`, `floor`, `roomType`, `areaM2`, `listPrice`, `capacity`.
    - tenants: `kind` (chấp nhận `nuoc ngoai|foreign|viet nam|vn|cong ty|company`), `facilityCode`, `fullName`, `phone`, `email`, `nationality`, `passportNumber`, `passportExpiry`, `visaType`, `visaExpiry`, `idNumber`, `idIssueDate`, `idIssuePlace`, `dateOfBirth`, `permanentAddress`, `companyName`, `taxCode`, `companyAddress`, `representative`, `contactPerson`, `note`.
  - `suggestMapping(headers: string[], target): Record<string, string | null>`.
  - `validateRows(target, rows, mapping): { valid: NormalizedRow[]; errors: { row: number; field: string; message: string }[] }` — dùng chính zod schema của Task 7/8 (không viết lại luật); `row` là số dòng Excel (dòng 2 = dữ liệu đầu tiên).
  - `runImport(db, ctx, target, validRows): Promise<{ created: number; updated: number }>` — một transaction; **upsert idempotent**: phòng theo `(facilityCode, roomCode)` (tạo cơ sở nếu chưa có mã), khách theo thứ tự khoá `passport_number` → `id_number` → `tax_code` → `phone`; ghi một `audit_logs` action `import` kèm số liệu. Chỉ `settings`.
  - Hợp đồng, cọc, công nợ, chỉ số điện nước, tài sản: nhập ở đợt tương ứng (dùng lại `parse/validate/run` với target mới).

- [ ] **Step 1:** Test: `suggestMapping(['Số điện thoại','Họ tên','Hết hạn visa'])` ghép đúng `phone, fullName, visaExpiry`; dòng có ngày `05/03/2027` → `2027-03-05`; dòng có ngày dạng số Excel → đúng ngày; dòng thiếu passport (khách nước ngoài) → lỗi `{row: 3, field: 'passportNumber'}`; chạy `runImport` cùng file 2 lần → lần 2 `created 0`, số khách trong DB không đổi; sửa SĐT trong file rồi chạy lại → `updated 1`.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt + UI 3 bước: (1) chọn loại dữ liệu + tải file `.xlsx`, chọn sheet; (2) bảng ghép cột (mỗi trường một Select, gợi ý sẵn); (3) xem trước: số dòng hợp lệ / lỗi, bảng lỗi theo dòng (tải về CSV lỗi), nút "Nhập N dòng hợp lệ". Giới hạn file 10MB, 5.000 dòng. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat(import): nhập phòng và khách từ Excel, ghép cột, nhập lại không trùng`.

### Task 12: Sao lưu cơ sở dữ liệu ra Google Drive

**Files:**
- Create: `.github/workflows/backup.yml`, `docs/operations/backup-restore.md`

**Interfaces:**
- Consumes (GitHub Secrets): `BACKUP_DATABASE_URL` (chuỗi kết nối Supabase, session pooler/direct), `GDRIVE_SERVICE_ACCOUNT_JSON`, `GDRIVE_FOLDER_ID`.

- [ ] **Step 1:** Workflow chạy `cron: '0 19 * * *'` (2h sáng giờ VN) + `workflow_dispatch`: cài `postgresql-client` đúng major version của Supabase (17), `pg_dump --format=custom --no-owner --no-privileges "$BACKUP_DATABASE_URL" -f siris-backup-$(TZ=Asia/Ho_Chi_Minh date +%F).dump` (kèm schema `auth` để giữ tài khoản đăng nhập); tải lên Drive bằng `rclone` (remote `drive` cấu hình từ service account, `root_folder_id = GDRIVE_FOLDER_ID`); xoá bớt để chỉ còn 30 file `siris-backup-*.dump` mới nhất. Bước thất bại → workflow fail (GitHub gửi email cho chủ repo).
- [ ] **Step 2:** `docs/operations/backup-restore.md` (tiếng Việt): tạo service account Google, chia sẻ thư mục Drive cho email service account, thêm 3 secrets; cách chạy tay; **cách khôi phục** (`pg_restore --clean --if-exists --no-owner -d <url> file.dump`) vào một project Supabase mới; checklist chạy thử khôi phục trước khi dùng thật.
- [ ] **Step 3:** Kiểm tra cú pháp: `npx --yes action-validator .github/workflows/backup.yml` → không lỗi. (Chạy thật cần secrets — người dùng làm theo tài liệu; ghi rõ trong báo cáo cuối đợt.)
- [ ] **Step 4:** Commit `ops: sao lưu cơ sở dữ liệu mỗi đêm ra Google Drive, giữ 30 bản`.

### Task 13: Kiểm thử đầu-cuối và hoàn tất đợt 1

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `README.md`

- [ ] **Step 1:** Smoke test Playwright (chạy với Supabase thật của môi trường dev, bỏ qua nếu thiếu biến `E2E_EMAIL`/`E2E_PASSWORD`): đăng nhập → thấy "Nhắc việc" → tạo cơ sở → tạo nhanh phòng 101–103 → tạo khách nước ngoài visa hết hạn sau 10 ngày → trang chủ hiện khách đó trong "Visa sắp hết hạn".
- [ ] **Step 2:** `npm test` (toàn bộ) → PASS; `npm run lint` → sạch; `npm run build` → OK.
- [ ] **Step 3:** README: yêu cầu (Node ≥ 20), tạo project Supabase Free + bucket R2 (CORS), điền `.env.local`, `npm run db:migrate`, `npm run seed:admin`, `npm run dev`; triển khai Vercel (biến môi trường); trỏ tới `docs/operations/backup-restore.md`.
- [ ] **Step 4:** Commit `test: smoke e2e đợt 1; docs: hướng dẫn cài đặt`.
