# Siris — Kiểm thử tổng thể (sau khi cài đặt xong)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Viết và chạy toàn bộ test còn thiếu, e2e, kiểm tra tĩnh, đo tốc độ, rồi đưa một bản thử duy nhất cho người dùng duyệt — làm một lần sau khi mọi task cài đặt đã xong.

**Architecture:** Từ 16/11/2026, các task cài đặt (Task 4b, 13–18, 20, 21, 23 và phần còn lại của kế hoạch tăng tốc) không còn bước test và không còn điểm dừng theo đợt. Ca test của từng task được chuyển nguyên về đây, giữ đúng giá trị lấy từ spec. Test service chạy trên PGlite, e2e chạy Playwright trên Supabase dev.

**Tech Stack:** Vitest + PGlite, Playwright, Next.js 16, Supabase, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`
**Tổng quan các đợt:** `docs/superpowers/plans/README.md`

**Điều kiện bắt đầu:** Đã cài đặt xong Task 4b, 13, 14, 15 (đợt 3), 16, 17, 18 (đợt 4), 20, 21, 23 (đợt 5). Task 1–12b đã có test từ trước, chỉ cần chạy lại.

## Global Constraints

Như các plan đợt 1–5. Thêm:
- Không bỏ qua, tắt hay xoá test để có kết quả đạt. Test sai do code thì sửa code; test sai do hiểu sai spec thì hỏi người dùng.
- Sửa lỗi phát hiện khi test: mỗi lỗi một commit `fix: …` kèm test đã đỏ trước khi sửa.

## Review Focus

Giữ nguyên 5 mục Review Focus ở các plan đợt (lẻ ngày ở ranh giới tháng; thay đồng hồ và chỉ số giảm; thay đổi giữa kỳ sau khi hoá đơn đã duyệt; sai cơ sở / thiếu quyền; nhập trùng / nhập lại). Các ca của mục 3 và 5 nằm ở Task K1 (Task 14, 15, 18); mục 4 có ca ở mọi nhóm của Task K1.

---

### Task K1: Test đơn vị và tích hợp cho các task chưa có test

Mỗi nhóm dưới đây: viết test → chạy, nếu FAIL thì sửa code tới PASS → commit `test: …`. Tên file test đúng như ở mục **Files** của task gốc.

**4b — `tests/unit/domain/billing.test.ts` (thêm ca, cài đặt days_30)**

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

Các test cũ của Task 4 trong cùng file phải vẫn PASS (chỉ đổi cách truyền đầu vào).

**13 — `tests/integration/charges.test.ts`**
- Thêm "Giặt ủi 3kg × 25.000" → ở trạng thái chưa tính.
- Đánh dấu khoản cọc bổ sung đã thu → `depositBalance` tăng 1.000.000.
- Người chỉ có `meters` gọi `addOneOff` → `ForbiddenError`.

**14 — `tests/integration/invoices.test.ts`**
- Tạo nháp tháng 12 → dòng tiền phòng tháng 12, điện nước tháng 11, phí phát sinh.
- Tạo nháp lần nữa → không trùng hoá đơn, không lặp điều chỉnh.
- Sửa kỳ 01/12–28/02 → hệ số 3; tạo hàng loạt tháng 01 và tháng 02 → hợp đồng đó bị bỏ qua, hiện "Đã trả trước tới 28/02/2027".
- Hợp đồng `billing_cycle_months = 3` bắt đầu 01/10 → nháp tháng 10 có kỳ 01/10–31/12, tháng 11 và 12 không sinh hoá đơn.
- Hoá đơn có `proration = 'days_30'` trong khi cài đặt là `actual_days` → dòng tiền phòng lẻ ngày tính theo 30.
- Duyệt với "ngày 5 của tháng sau" → hạn 05/01.
- Thu một phần → "Thu một phần"; xoá → lỗi `'Gỡ các khoản đã thu trước khi xoá'`; quá hạn → "Quá hạn".
- Người chỉ có quyền `meters` → `ForbiddenError`.

**15 — `tests/integration/addenda.test.ts` (cài đặt days_30)**
- Gia hạn tăng giá 9tr→10tr và cọc 9tr→10tr → sổ cọc có topup 1.000.000 pending.
- Chuyển phòng 15/11 sang phòng 11tr, sau khi hoá đơn tháng 11 đã duyệt → `pending_adjustments` có +1.066.667; cùng ca với `adjustmentTarget: 'current'` → hoá đơn tháng 11 có thêm dòng +1.066.667, không có `pending_adjustments`.
- Đổi người ở 2 → 3 từ 16/11 (phí 200.000/người), hoá đơn tháng 11 đã duyệt → `pending_adjustments` có +100.000; thêm khách công ty làm người ở → `ValidationError`.
- Thanh lý 20/11 với phạt 500.000, không mất cọc → hoá đơn tổng −11.080.000; mất cọc toàn bộ → −2.080.000.
- Sau khi duyệt hoá đơn thanh lý → phòng về Trống, hoặc Đã cọc nếu có cọc chờ; số dư cọc = 0; hoá đơn ở "Chờ hoàn khách".
- Khách có ảnh passport còn một hợp đồng khác đang hiệu lực → ảnh giấy tờ không bị đặt `delete_after`.
- Người chỉ có `billing` tạo phụ lục → `ForbiddenError`.

**16 — `tests/integration/incidents.test.ts`**
- Sự cố ở phòng 301 xong với chi phí 350.000, do khách gây ra → có phí phạt 350.000 chưa tính; `assetHistory` có sự cố này.
- Người của cơ sở khác → `NotFoundError`.

**17 — `tests/unit/domain/reminders.test.ts` (thêm ca), `tests/integration/dashboard.test.ts`**
- `today = '2026-11-16'`, ngưỡng 30: visa còn 0 / −6 / 30 ngày có mặt, 31 ngày không.
- Hoá đơn hạn 15/11 chưa thu có mặt, hạn 16/11 không.
- Hùng chỉ thấy `meters_missing` và `open_incidents` của Bình Thạnh.

**18 — `tests/unit/import.test.ts`, `tests/integration/import-run.test.ts`**
- `suggestMapping(['Số điện thoại','Họ tên','Hết hạn visa'])` → `phone, fullName, visaExpiry`.
- `05/03/2027` và số Excel 46451 đều thành `2027-03-05`.
- Dòng thiếu passport → `{ row: 3, field: 'passportNumber' }`.
- Chạy cùng file 2 lần → lần 2 `created 0`; sửa SĐT trong file rồi chạy lại → `updated 1`.
- SĐT `0901 234 567` và `+84 90 123 4567` trong cùng file → lỗi dòng tiếng Việt, không lỗi 500.
- Nhập file công nợ 2 lần → mỗi hợp đồng vẫn chỉ có 1 hoá đơn `import:debt`; nhập file số dư cọc 2 lần → `depositBalance` không đổi.
- Hai dòng hợp đồng cùng `legacy_code` khác ngày bắt đầu → lần 2 là `updated`, không tạo hợp đồng thứ hai.

**20 — `tests/integration/convert.test.ts` (fetch giả)**
- Format `pdf` gọi đúng `POST {GOTENBERG_URL}/forms/libreoffice/convert` và lưu file `application/pdf`.
- Gotenberg lỗi → `ValidationError('Không chuyển được sang PDF, thử lại sau')`.

**21 — `tests/integration/purge.test.ts`**
- File có `delete_after` hôm qua bị xoá; hợp đồng `keep_photos` thì không xoá.
- Biên bản đã xuất (`ownerType = 'export'`) không bao giờ bị xoá.
- Ảnh passport của khách đã ký hợp đồng mới sau khi đặt `delete_after` → không xoá và `delete_after` về null.

**23 — test cho `db:seed --purge-demo` và `seed:admin`**
- Sau khi purge không còn bản ghi nào có `is_demo = true`; tài khoản mẫu bị xoá khỏi Supabase Auth; cài đặt và mẫu Word người dùng đã tải lên vẫn còn.

- [ ] **Step 1:** Viết test cho 4b, 13, 14, 15. Chạy `npx vitest run tests/unit/domain/billing.test.ts tests/integration/{charges,invoices,addenda}.test.ts` → PASS (sửa code nếu FAIL). Commit `test: tài chính — lõi tính tiền bổ sung, phí phát sinh, hoá đơn, phụ lục`.
- [ ] **Step 2:** Viết test cho 16, 17, 18. Chạy `npx vitest run tests/integration/{incidents,dashboard,import-run}.test.ts tests/unit/{import,domain/reminders}.test.ts` → PASS. Commit `test: sự cố, nhắc việc, nhập Excel`.
- [ ] **Step 3:** Viết test cho 20, 21, 23. Chạy `npx vitest run tests/integration/{convert,purge}.test.ts` và test purge-demo → PASS. Commit `test: xuất PDF, tự xoá ảnh, xoá dữ liệu giả`.

### Task K2: E2E các luồng chính

**Files:**
- Create: `tests/e2e/{invoices,addenda,incidents,import,termination}.spec.ts` (các spec đợt 1–2 giữ nguyên)

Playwright chạy trên Supabase dev; bỏ qua nếu thiếu `E2E_BASE_URL`. Chạy `node scripts/e2e-preflight.mjs` trước lần chạy đầu.

Luồng mới:
1. Ghi điện nước → tạo hoá đơn tháng hàng loạt → sửa kỳ thành 3 tháng → duyệt → thu một phần.
2. Gia hạn tăng giá và cọc → sổ cọc có khoản thu bổ sung.
3. Chuyển phòng giữa tháng → dòng điều chỉnh ở kỳ sau.
4. Thanh lý → hoá đơn thanh lý hiện "Hoàn khách".
5. Báo sự cố từ trang phòng → chuyển Xong có tính phí cho khách → phí phạt hiện trong phí phát sinh của hợp đồng.
6. Nhập file Excel khách mẫu → xem trước có dòng lỗi → nhập N dòng hợp lệ.
7. Tạo khách → tạo cọc → chuyển thành hợp đồng thuê → check-in (luồng xuyên suốt).

- [ ] **Step 1:** Viết các spec trên.
- [ ] **Step 2:** `npx playwright test` → PASS toàn bộ (cả spec đợt 1–2). Lỗi → chỉ chạy lại spec lỗi tới khi PASS, rồi chạy cả bộ một lần cuối.
- [ ] **Step 3:** Commit `test: e2e các luồng tài chính, sự cố, nhập Excel`.

### Task K3: Kiểm tra toàn bộ

- [ ] **Step 1:** `npm test` → PASS toàn bộ; `npx tsc --noEmit` → sạch; `npm run lint` → 0 lỗi; `npm run build` → OK.
- [ ] **Step 2:** `npx --yes action-validator .github/workflows/backup.yml` → không lỗi (Task 22 Step 3).

### Task K4: Đo tốc độ chuyển trang (từ kế hoạch tăng tốc, Task 3)

- [ ] **Step 1:** `npm run build && npm run start`. Mở `http://localhost:3000`, đăng nhập nhanh bằng Admin (demo mode), bấm lần lượt Cơ sở & phòng → Khách thuê → Hợp đồng → Điện nước → Nhắc việc → Hoá đơn, mỗi vòng 2 lần. Lấy thời gian các request `?_rsc=` (tab Network), ghi trung vị vào mục "Số đo" của `2026-11-16-tang-toc-tai-trang.md`.
- [ ] **Step 2:** Đạt khi trung vị ≤ 600 ms. Không đạt → dừng, dùng systematic-debugging với số đo mới.
- [ ] **Step 3:** Kiểm bằng tay: đăng xuất → mở `/tenants` → về `/login`; Admin bỏ quyền `meters` của Vy, Vy chuyển tab → menu Điện nước biến mất; xoá cookie access token (giữ refresh token) rồi chuyển tab → vẫn vào được.
- [ ] **Step 4:** Commit `docs: số đo tốc độ chuyển trang`.

### Task K5: Điểm dừng duy nhất — người dùng duyệt

**Files:**
- Create: `docs/review/checklist.md`

- [ ] **Step 1:** `npm run db:migrate && npm run db:seed` trên Supabase dev — chỉ nạp phần còn thiếu, giữ nguyên dữ liệu đang có (không dùng `--reset`); triển khai bản thử lên Vercel (preview) với `NEXT_PUBLIC_DEMO_MODE=1`.
- [ ] **Step 2:** Viết `docs/review/checklist.md`: danh sách luồng để người dùng bấm thử và ghi góp ý; mỗi luồng gồm các bước, điều cần để ý và ô ghi chú. Gộp các mục chưa thử của `dot-1-checklist.md` và `dot-2-checklist.md`. Thứ tự: nhắc việc → khách → cọc → hợp đồng thuê → bàn giao → điện nước → hoá đơn → gia hạn / chuyển phòng / thanh lý / đổi người ở → tài sản & vật tư → sự cố → người dùng & phân quyền → mẫu Word / PDF / ảnh → nhập Excel → cài đặt.
- [ ] **Step 3:** Commit `docs: checklist duyệt tổng thể`.
- [ ] **Step 4: Dừng lại.** Gửi link bản thử + checklist cho người dùng. Góp ý được sửa (mỗi lỗi một commit `fix:` kèm test), chạy lại Task K3, rồi mới làm các bước chạy thật trong `docs/operations/go-live.md` (Task 23).
