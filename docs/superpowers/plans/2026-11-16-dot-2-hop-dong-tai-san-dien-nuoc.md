# Siris — Đợt 2: Hợp đồng, tài sản, điện nước, bàn giao

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mẫu Word + xuất docx, hợp đồng cọc và hợp đồng thuê (trạng thái ký, sổ cọc), tài sản và kho, ghi chỉ số điện nước + thay đồng hồ, biên bản bàn giao check-in/check-out — tiếp tục trên dữ liệu giả.

**Architecture:** Next.js App Router; trang là server components đọc qua service, ghi qua server actions; service `(db, ctx, input)` dùng Drizzle nối Postgres của Supabase; phân quyền ở server qua `AccessContext`; RLS bật không policy; logic nghiệp vụ là hàm thuần trong `src/domain/`; test service trên PGlite; dữ liệu giả nạp bằng `npm run db:seed`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle + drizzle-kit, postgres.js, @supabase/ssr, zod, react-hook-form, Vitest + PGlite, Playwright, npm, docxtemplater + pizzip.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`
**Tổng quan các đợt:** `docs/superpowers/plans/README.md` · Số Task giữ theo thứ tự chung của toàn dự án.

**Điều kiện bắt đầu:** Đợt 1 đã được người dùng duyệt và góp ý đã cập nhật.

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

### Task 8: Mẫu giấy tờ Word ✅

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
- [x] **Step 1:** Test: `buildTemplateData('lease', …)` có `gia_thue = '9.000.000'`, `gia_thue_bang_chu = 'Chín triệu đồng'`, `ngay_bat_dau = '15/10/2026'`; `renderDocx` với `lease.docx` mẫu cho ra file chứa "Chín triệu đồng".
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Script sinh mẫu cho đủ 10 loại (dùng thư viện `docx`, cài dạng dev dependency). Trang Mẫu giấy tờ gồm:
  - danh sách mẫu theo loại;
  - tải lên file `.docx` và đặt mẫu mặc định;
  - **bảng chỗ điền** (mã, ý nghĩa, ví dụ, nút sao chép `{mã}`);
  - nút "Thử xuất với dữ liệu mẫu".
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat: mẫu Word, bảng chỗ điền, xuất docx`.

### Task 9: Hợp đồng cọc và hợp đồng thuê ✅

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
- [x] **Step 1:** Viết test.
  - Tạo cọc cho phòng trống → phòng thành `deposited`; tạo cọc thứ hai cho cùng phòng → lỗi.
  - Chuyển cọc thành lease → phòng thành `occupied`, sổ cọc có dòng `collect`.
  - Tạo lease chồng ngày → lỗi.
  - Người của cơ sở khác `getLease` → `NotFoundError`.
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt.
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
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat: hợp đồng cọc, hợp đồng thuê, trạng thái ký, sổ cọc`.

### Task 10: Tài sản và kho ✅

**Files:**
- Create: `src/db/schema/assets.ts`, `src/server/assets/{service.ts,actions.ts}`, `src/app/(app)/assets/page.tsx`, `[id]/page.tsx`, `src/features/assets/components/{asset-table.tsx,move-dialog.tsx,asset-form.tsx,location-tree.tsx}`, `scripts/seed/assets.ts`
- Test: `tests/integration/assets.test.ts`

**Interfaces:**
- Bảng:
  - `assets(code unique, name, category, value, condition, location_kind 'room'|'common'|'warehouse', location_id, facility_id, status 'in_use'|'broken'|'disposed')`
  - `asset_moves(asset_id, from_kind, from_id, to_kind, to_id, moved_at, moved_by, reason)`
  - Mỗi tài sản là một món có mã *(Claude quyết)*, để biên bản bàn giao liệt kê được từng món.
- Produces: `listAssets(db, ctx, { facilityId?, location?, q?, status? })`, `getAsset`, `createAsset`, `updateAsset`, `moveAssets(db, ctx, assetIds, to, reason)` (ghi một `asset_moves` cho mỗi món), `assetHistory(id)` (gồm di chuyển, bàn giao, sự cố), `setAssetStatus`. Cần quyền `assets`.
- [x] **Step 1:** Test: chuyển 2 món từ kho sang phòng 301 → vị trí đổi và có 2 dòng lịch sử; người của cơ sở khác → `NotFoundError`; chuyển sang phòng thuộc cơ sở khác → `ValidationError`.
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt UI:
  - Bên trái là cây vị trí (Cơ sở → Kho / Khu chung / Phòng), bên phải là bảng tài sản.
  - Tick nhiều món thì hiện thanh nổi "Chuyển N tài sản".
  - Trên điện thoại: chọn món → Chuyển → chọn nơi đến.
  - Trang phòng hiện danh sách tài sản trong phòng.
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat: tài sản và kho, chuyển nhanh, lịch sử`.

### Task 11: Điện nước ✅

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
- [x] **Step 1:** Test: chỉ số nhỏ hơn kỳ trước → dòng đó bị lỗi, các dòng khác vẫn lưu; thay đồng hồ (cũ cuối 1260, mới đầu 0, rồi nhập 45) → tiêu thụ 105.
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt UI:
  - Lưới nhập nhanh, trên điện thoại hiện bàn phím số; Enter chuyển sang ô kế tiếp.
  - Cảnh báo tiêu thụ bất thường (> 2× trung bình 3 kỳ).
  - Hiện tiến độ "Đã ghi 12/16 phòng".
  - Trang phòng hiện lịch sử đồng hồ và chỉ số.
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat: ghi chỉ số điện nước, thay đồng hồ`.

### Task 12: Bàn giao check-in / check-out ✅

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
- [x] **Step 1:** Test: check-in có đúng các tài sản trong phòng; check-out sao đúng danh sách; đánh dấu 1 món hư với phạt 500.000 → tổng phạt 500.000; chỉ số nhập ở bàn giao xuất hiện trong lịch sử đồng hồ.
- [x] **Step 2:** Chạy → FAIL.
- [x] **Step 3:** Cài đặt UI: danh sách dọc, nút to dễ bấm trên điện thoại; mỗi món chọn Tốt / Trầy xước / Hư, có ghi chú và chụp ảnh; check-out hiện cạnh tình trạng lúc check-in để so sánh.
- [x] **Step 4:** Chạy → PASS.
- [x] **Step 5:** Commit `feat: biên bản bàn giao check-in, check-out`.

### Task 12b: Bổ sung sau rà soát spec (16/11) — quyền xem, vật tư theo số lượng ✅

Rà soát spec ngày 16/11 thấy Task 9–12 còn thiếu: Task 9 và 12 không ghi quyền cần có; spec 5 yêu cầu người chỉ có "Ghi điện nước" không thấy thông tin khách hay tiền; spec 6.7 yêu cầu hỗ trợ cả vật tư theo số lượng; spec 6.2 người ở là khách cá nhân.

**Files:**
- Create: `src/db/schema/stock.ts`, `src/server/stock/{service.ts,actions.ts}`, `src/features/assets/components/{stock-table.tsx,stock-move-dialog.tsx}`, `scripts/seed/{stock.ts,state.ts}`
- Modify (seed thêm dần): `scripts/seed/{index.ts,types.ts}` và mỗi module trong `scripts/seed/` (thêm `isSeeded`)
- Modify: `src/server/rooms/service.ts`, `src/server/tenants/service.ts`, `src/server/contracts/service.ts`, `src/server/handovers/service.ts`, `src/app/(app)/rooms/[id]/page.tsx`, `src/app/(app)/assets/page.tsx`
- Test: `tests/integration/room-visibility.test.ts`, `tests/integration/stock.test.ts`, thêm ca vào `tests/integration/{contracts,handovers,seed}.test.ts`

**Interfaces:**
- Quyền (ghi vào đầu mỗi service): hợp đồng cọc/thuê và bàn giao cần `tenants_contracts`; xem hợp đồng hiện tại, bên thuê, người ở trên trang phòng cần `tenants_contracts`; tiền thuê, cọc, công nợ trên trang phòng/khách cần `tenants_contracts` hoặc `billing`. Người không đủ quyền vẫn thấy trạng thái phòng (Trống / Đang ở …) nhưng không thấy tên khách hay số tiền — dữ liệu bị bỏ ở service, không chỉ ẩn trên UI.
- `getRoomDetail(db, ctx, id) → { room; status; lease?: { code; tenantName; occupants; endDate }; money?: { monthlyRent; depositBalance; debt } }` — `lease` chỉ có khi `can(tenants_contracts)`, `money` chỉ có khi `can(tenants_contracts)` hoặc `can(billing)`.
- Người ở (`lease_occupants`) phải là khách `foreign` hoặc `vietnamese`: lỗi "Người ở phải là khách cá nhân".
- Vật tư theo số lượng *(Claude quyết: bảng riêng, không trộn với tài sản có mã)*:
  - Bảng `stock_items(facility_id, name, unit, category, is_active)`, `stock_levels(item_id, location_kind 'room'|'common'|'warehouse', location_id, quantity int ≥ 0)` unique `(item_id, location_kind, location_id)`, `stock_moves(item_id, from_kind, from_id, to_kind, to_id, quantity, moved_by, reason, moved_at)`.
  - `listStock(db, ctx, { facilityId?, location? })`, `createStockItem`, `receiveStock(db, ctx, itemId, to, quantity, reason)` (nhập kho), `moveStock(db, ctx, itemId, from, to, quantity, reason)`, `consumeStock(db, ctx, itemId, from, quantity, reason)` (dùng hết / hỏng). Cần quyền `assets`. Không đủ số lượng → `ValidationError('Không đủ số lượng tại vị trí nguồn')`.
  - Vật tư không vào biên bản bàn giao (chỉ tài sản có mã).
- Seed thêm dần *(sửa 16/11: trước đây seed chỉ chạy trên database trống nên mỗi điểm dừng phải `--reset`, xoá cả dữ liệu đang test)*:
  - `SeedModule` thêm `isSeeded(ctx): Promise<boolean>` — đúng khi bảng chính của module đã có dòng `is_demo = true`.
  - `runSeed` khi không có `reset`: gọi `loadSeedState(ctx)` (`scripts/seed/state.ts`) để điền `state` từ database (`facilityIds` theo `facilities.code`, `roomIds` theo `mã cơ sở:mã phòng`, `userIds` theo email tài khoản mẫu), rồi chạy lần lượt các module và bỏ qua module có `isSeeded` = true. Có `reset` thì giữ hành vi cũ.
  - Mỗi module dùng `createRng` với hạt giống riêng suy ra từ tên module, để dữ liệu của một module không đổi khi module trước nó bị bỏ qua.
  - Vật tư mẫu ở module riêng `stockSeed` (`scripts/seed/stock.ts`, đăng ký sau `assetSeed`): mỗi cơ sở vài vật tư (bóng đèn, ruột gối, khăn tắm…) có tồn ở kho và vài phòng.

- [x] **Step 1: Viết test**
  - Hùng (meters, assets, incidents tại BT) gọi `getRoomDetail` một phòng BT đang ở → có `status = 'occupied'`, không có `lease`, không có `money`.
  - Minh (billing) → có `money`, không có `lease`.
  - Hùng gọi `startHandover` → `ForbiddenError`; gọi `createLease` → `ForbiddenError`.
  - Tạo lease với người ở là khách công ty → `ValidationError` "Người ở phải là khách cá nhân".
  - Nhập kho 20 bóng đèn, chuyển 3 sang phòng 301 → kho 17, phòng 301 có 3, 1 dòng `stock_moves`; chuyển 25 → lỗi "Không đủ số lượng tại vị trí nguồn"; người cơ sở khác → `NotFoundError`.
  - Seed: chạy `runSeed` hai lần không `reset` → lần hai không lỗi, số dòng mọi bảng không đổi. Xoá hết dòng `stock_*` rồi chạy lại → chỉ vật tư được nạp lại; khách, hợp đồng, tài khoản giữ nguyên id.
- [x] **Step 2:** Chạy `npx vitest run tests/integration/room-visibility.test.ts tests/integration/stock.test.ts tests/integration/contracts.test.ts tests/integration/handovers.test.ts` → FAIL.
- [x] **Step 3:** Cài đặt. Trang tài sản thêm tab "Vật tư" (bảng theo vị trí, nút Nhập kho / Chuyển / Xuất dùng); trang phòng dùng `getRoomDetail`.
- [x] **Step 4:** Chạy lại → PASS; `npm test` → PASS toàn bộ.
- [x] **Step 5:** Commit `feat: ẩn thông tin khách và tiền theo quyền, vật tư theo số lượng, seed thêm dần`.

### Điểm dừng đợt 2: người dùng test

- [x] **Step 1:** `npm test` → PASS toàn bộ; `npm run lint` sạch; `npm run build` OK.
- [x] **Step 2:** Playwright (chạy trên Supabase dev, bỏ qua nếu thiếu `E2E_BASE_URL`) cho các luồng: tạo cọc cho phòng trống → phòng "Đã cọc"; chuyển thành hợp đồng thuê qua wizard; xuất Word; đánh dấu đã ký kèm file; chuyển 2 tài sản từ kho vào phòng; ghi chỉ số điện nước, nhập chỉ số giảm → báo lỗi; thay đồng hồ; check-in rồi check-out có phạt; Hùng mở trang phòng đang ở → không thấy tên khách và tiền; chuyển 3 bóng đèn từ kho vào phòng. `npx playwright test` → PASS.
- [x] **Step 3:** `npm run db:migrate && npm run db:seed` trên Supabase dev — thêm bảng vật tư và vật tư mẫu, giữ nguyên dữ liệu đang có (không dùng `--reset`); triển khai bản thử lên Vercel (preview) với `NEXT_PUBLIC_DEMO_MODE=1`.
- [x] **Step 4:** Viết `docs/review/dot-2-checklist.md`: từng luồng cần bấm thử (các bước, điều cần để ý, ô ghi chú) cho phần của đợt này.
- [x] **Step 5:** Commit `test: e2e và checklist test đợt 2`.
- [x] **Step 6: Dừng lại.** Gửi link bản thử + checklist cho người dùng. Góp ý được cập nhật vào spec và kế hoạch các đợt sau rồi mới bắt đầu đợt tiếp theo. *(16/11: người dùng xác nhận hoàn thành điểm dừng và yêu cầu tiếp tục đợt 3.)*
