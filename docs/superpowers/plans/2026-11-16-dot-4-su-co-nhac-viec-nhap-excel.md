# Siris — Đợt 4: Sự cố, nhắc việc đầy đủ, nhập Excel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sự cố và sửa chữa (tính phí cho khách), bảng nhắc việc đủ mọi loại, nhập dữ liệu từ Excel — rồi test toàn bộ hệ thống với dữ liệu giả.

**Architecture:** Next.js App Router; trang là server components đọc qua service, ghi qua server actions; service `(db, ctx, input)` dùng Drizzle nối Postgres của Supabase; phân quyền ở server qua `AccessContext`; RLS bật không policy; logic nghiệp vụ là hàm thuần trong `src/domain/`; test service trên PGlite; dữ liệu giả nạp bằng `npm run db:seed`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle + drizzle-kit, postgres.js, @supabase/ssr, zod, react-hook-form, Vitest + PGlite, Playwright, npm, exceljs.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`
**Tổng quan các đợt:** `docs/superpowers/plans/README.md` · Số Task giữ theo thứ tự chung của toàn dự án.

**Điều kiện bắt đầu:** Đợt 3 đã được người dùng duyệt.

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

**Quy ước cho mọi task có bảng mới:** viết schema Drizzle trong `src/db/schema/<module>.ts` → `npm run db:generate` → thêm `enable row level security` cho bảng mới trong cùng migration → thêm dữ liệu giả của module vào `scripts/seed/<module>.ts` (đăng ký trong `scripts/seed/index.ts`) → `npm run db:migrate` và `npm run db:seed` lên Supabase dev. Seed chạy **thêm dần** (từ Task 12b): module nào đã có dữ liệu thì bỏ qua, nên không cần `--reset` để thêm dữ liệu của module mới. Mọi bảng có `id uuid default gen_random_uuid()`, `created_at`, `updated_at`; bảng nào có dữ liệu giả thì thêm `is_demo bool default false` (seed đặt `true`) để Task 23 xoá sạch được.

**Dữ liệu giả (tổng hợp từ các task):** 2 cơ sở (TD Thảo Điền: tầng 1–4 × 6 phòng; BT Bình Thạnh: tầng 1–4 × 4 phòng); 30 khách (14 nước ngoài với visa hết hạn tương đối so với ngày seed: −5, 0, 3, 9, 16, 24, 29, 30, 45, 70, 120, 200, 260, 330 ngày; 12 Việt Nam; 4 công ty); ~26 hợp đồng thuê (vài cái hết hạn trong 30 ngày, 2 cái chưa ký); 3 hợp đồng cọc chờ; đồng hồ và chỉ số 3 tháng; hoá đơn 2 tháng (vài cái quá hạn); sổ cọc; ~120 tài sản; 8 sự cố; 6 loại phí; đơn giá điện 3.500đ/kWh (đổi lên 3.800đ từ đầu tháng hiện tại) và nước 18.000đ/m³; 5 tài khoản mẫu: Admin (settings); Lan — Quản lý TD (tenants_contracts, billing); Minh — Kế toán TD+BT (billing); Hùng — Kỹ thuật BT (meters, assets, incidents); Vy — Lễ tân TD (tenants_contracts, meters). Tên và số giấy tờ đều bịa. `db:seed` giữ nguyên dữ liệu đang có và chỉ nạp phần còn thiếu; `db:seed --reset` xoá sạch rồi nạp lại từ đầu, chỉ dùng khi chủ động muốn làm sạch (mất cả dữ liệu người dùng đã nhập khi test).

---

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
- Modify (đã tạo ở Task 7b, đợt 1): `src/domain/reminders.ts`, `src/server/dashboard/service.ts`, `src/app/(app)/page.tsx`, `src/features/dashboard/components/{reminder-card.tsx,stat-strip.tsx}`
- Test: `tests/unit/domain/reminders.test.ts` (thêm ca cho các loại mới), `tests/integration/dashboard.test.ts`

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
  - Thêm cột `leases.legacy_code text null unique` (mã hợp đồng ở phần mềm cũ; hiện trên trang hợp đồng).
  - `runImport(db, ctx, target, rows) → { created; updated }`: một transaction; upsert theo khoá tự nhiên:
    - phòng: mã cơ sở + mã phòng (cơ sở phải có sẵn, không thì lỗi dòng "Chưa có cơ sở mã X");
    - khách: passport → CCCD → mã số thuế → SĐT;
    - hợp đồng: `legacy_code` (mã hợp đồng cũ, spec 8) nếu cột có giá trị, không thì mã phòng + ngày bắt đầu;
    - số dư cọc: một dòng `deposit_entries` `collect` `done` cho mỗi hợp đồng với `note = 'Số dư chuyển từ hệ thống cũ'`, nhập lại thì sửa số tiền của chính dòng đó;
    - công nợ đầu kỳ: một hoá đơn `manual` mỗi hợp đồng với `invoices.source = 'import:debt'`, nhập lại thì sửa dòng của hoá đơn đó (nếu đã có khoản thu → lỗi dòng "Công nợ đã có khoản thu, sửa tay trên hoá đơn");
    - chỉ số: `(meter, period)` (đã unique); tài sản: mã tài sản.
  - Ghi audit `import`. Chỉ người có quyền `settings`.
- [ ] **Step 1:** Test:
  - `suggestMapping(['Số điện thoại','Họ tên','Hết hạn visa'])` → `phone, fullName, visaExpiry`.
  - `05/03/2027` và số Excel 46451 đều thành `2027-03-05`.
  - Dòng thiếu passport → `{ row: 3, field: 'passportNumber' }`.
  - Chạy cùng file 2 lần → lần 2 `created 0`; sửa SĐT trong file rồi chạy lại → `updated 1`.
  - Nhập file công nợ 2 lần → mỗi hợp đồng vẫn chỉ có 1 hoá đơn `import:debt`; nhập file số dư cọc 2 lần → `depositBalance` không đổi.
  - Hai dòng hợp đồng cùng `legacy_code` khác ngày bắt đầu → lần 2 là `updated`, không tạo hợp đồng thứ hai.
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
- [ ] **Step 3:** `npm run db:migrate && npm run db:seed` trên Supabase dev — chỉ nạp dữ liệu của module mới, giữ nguyên dữ liệu đang có (không dùng `--reset`); triển khai bản thử lên Vercel (preview) với `NEXT_PUBLIC_DEMO_MODE=1`.
- [ ] **Step 4:** Viết `docs/review/checklist.md`: danh sách luồng để người dùng bấm thử và ghi góp ý. Mỗi luồng gồm các bước, điều cần để ý và ô ghi chú. Thứ tự: nhắc việc → khách → cọc → hợp đồng thuê → bàn giao → điện nước → hoá đơn → gia hạn / chuyển phòng / thanh lý → tài sản → sự cố → người dùng & phân quyền → mẫu Word → nhập Excel → cài đặt.
- [ ] **Step 5:** Commit `test: e2e các luồng chính; docs: checklist duyệt`.
- [ ] **Step 6: Dừng lại.** Người dùng duyệt. Góp ý được cập nhật vào spec và plan rồi mới làm tiếp. Các task từ 20 trở đi chỉ làm sau khi giao diện đã được duyệt.

