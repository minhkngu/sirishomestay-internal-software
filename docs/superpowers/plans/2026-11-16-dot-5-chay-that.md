# Siris — Đợt 5: Chạy thật

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xuất PDF/ảnh qua Gotenberg, chuyển file sang R2 + tự xoá ảnh sau thanh lý, sao lưu ra Google Drive, xoá dữ liệu giả và chuyển sang dữ liệu thật.

**Architecture:** Next.js App Router; trang là server components đọc qua service, ghi qua server actions; service `(db, ctx, input)` dùng Drizzle nối Postgres của Supabase; phân quyền ở server qua `AccessContext`; RLS bật không policy; logic nghiệp vụ là hàm thuần trong `src/domain/`; test service trên PGlite; dữ liệu giả nạp bằng `npm run db:seed`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle + drizzle-kit, postgres.js, @supabase/ssr, zod, react-hook-form, Vitest + PGlite, Playwright, npm, @aws-sdk/client-s3.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`
**Tổng quan các đợt:** `docs/superpowers/plans/README.md` · Số Task giữ theo thứ tự chung của toàn dự án.

**Điều kiện bắt đầu:** Toàn bộ giao diện đã được người dùng duyệt (điểm dừng Task 19).

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
  - `purgeExpiredFiles(db, storage, today)`: xoá file có `delete_after ≤ today` khi hợp đồng không bật `keep_photos`, rồi ghi audit. Với ảnh giấy tờ (`tenant_document`), kiểm lại ngay lúc xoá: khách còn hợp đồng `active` hoặc cọc `pending` → bỏ `delete_after`, không xoá.
  - Cột `leases.keep_photos bool default false`.
  - Route cron chạy mỗi ngày, có bảo vệ bằng `CRON_SECRET`.
  - `scripts/migrate-storage.ts`: chép file từ Supabase Storage sang R2 rồi đổi `STORAGE_DRIVER=r2`.
- [ ] **Step 1:** Test: file có `delete_after` hôm qua bị xoá; hợp đồng `keep_photos` thì không xoá; biên bản đã xuất (`ownerType = 'export'`) không bao giờ bị xoá; ảnh passport của khách đã ký hợp đồng mới sau khi đặt `delete_after` → không xoá và `delete_after` về null.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Cài đặt. Tài liệu `r2.md` gồm cách tạo bucket, CORS, khoá truy cập. **Step 4:** Chạy → PASS.
- [ ] **Step 5:** Commit `feat: R2, tự xoá ảnh sau thanh lý, nút giữ lại`.

### Task 22: Sao lưu cơ sở dữ liệu ra Google Drive ✅ (commit `6b58172`; còn chạy thử khôi phục — Task 23 bước 7)

**Files:**
- Create: `.github/workflows/backup.yml`, `docs/operations/backup-restore.md`

- [x] **Step 1:** Workflow chạy `cron: '0 19 * * *'` (2h sáng giờ Việt Nam), kèm `workflow_dispatch`.
  - Cài `postgresql-client` major 17.
  - Chạy `pg_dump --format=custom --no-owner --no-privileges "$BACKUP_DATABASE_URL" -f siris-backup-$(TZ=Asia/Ho_Chi_Minh date +%F).dump`, có cả schema `auth` để giữ tài khoản đăng nhập.
  - Tải lên Drive bằng `rclone` (service account, `root_folder_id`), rồi chỉ giữ 30 file mới nhất.
  - Bước nào lỗi thì workflow fail (GitHub gửi email). Secrets: `BACKUP_DATABASE_URL`, `GDRIVE_SERVICE_ACCOUNT_JSON`, `GDRIVE_FOLDER_ID`.
- [x] **Step 2:** Viết `backup-restore.md` bằng tiếng Việt: tạo service account, chia sẻ thư mục Drive cho service account, thêm secrets, chạy tay, khôi phục bằng `pg_restore --clean --if-exists --no-owner`, và checklist chạy thử khôi phục trước khi dùng thật.
- [ ] **Step 3:** Chạy `npx --yes action-validator .github/workflows/backup.yml` → không lỗi.
- [x] **Step 4:** Commit `ops: sao lưu cơ sở dữ liệu mỗi đêm ra Google Drive, giữ 30 bản`.

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

