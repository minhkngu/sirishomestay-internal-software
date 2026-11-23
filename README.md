# Siris — Web quản lý khách thuê dài hạn

Web nội bộ quản lý cơ sở, phòng, khách thuê, bảng nhắc việc (visa), nhập dữ liệu từ Excel.
Thiết kế: `docs/superpowers/specs/` · Kế hoạch: `docs/superpowers/plans/`.

Công nghệ: Next.js 16 (App Router), TypeScript, Tailwind v4 + shadcn/ui, Drizzle ORM, Supabase (Postgres + Auth), Cloudflare R2, Vercel.

## Tính năng

**Nền tảng:** cơ sở, phòng, khách thuê, hợp đồng, bàn giao, tài sản, vật tư, phụ lục, sự cố, nhắc việc (visa), nhập từ Excel. Phân quyền theo nhóm quyền và cơ sở. Hợp đồng, phụ lục, biên bản soạn trong app từ mẫu, xuất PDF và Word.

**Hoá đơn**
- Tạo hàng loạt theo tháng, hoặc **hoá đơn lẻ** (Toà → Phòng → Tháng) bằng bản xem trước chưa lưu, chỉ tạo khi bấm Lưu. Tính theo công thức: tiền phòng và phí cố định tháng N (trả trước) + điện, nước, phí theo đồng hồ tháng N−1 (trả sau). Hợp đồng đã lập tới kỳ nào thì báo, không tạo lại.
- Hoá đơn tháng cũ và hoá đơn thêm cho kỳ đã có (không cộng tiền phòng); dòng tiền cọc còn thiếu ở hoá đơn đầu.
- Kỳ hoá đơn đồng bộ theo thời gian dòng tiền phòng đã chỉnh, nên hoá đơn kế tiếp nối đúng. Hệ số theo ngày hiện rõ ở từng dòng và tính lại khi đổi kỳ.
- Thêm phí ngoài từ hộp thoại chọn phí dùng chung với form hợp đồng; thuế theo %; hạn thanh toán theo quy tắc ("ngày X của tháng hoá đơn" mặc định ngày 5) và sửa được.
- Dòng tiền phòng, phí hợp đồng không sửa mô tả, đơn giá hoặc xoá tại hoá đơn; chỉ sửa hệ số, chỉ số hoặc số lượng theo kỳ.
- Xem PDF, tải ảnh hoá đơn ngay trong popup; mẫu hoá đơn HTML.

**Chỉ số điện nước**
- Trang **Chỉ số** một danh sách các lần chốt: lọc Toà, Phòng, Loại đồng hồ, Năm → Tháng. Mặc định hiện 15 lần chốt mới nhất; chọn Tất cả hoặc một năm thì xem hết, có phân trang. Sửa, xoá (một hoặc nhiều dòng). Chỉ số ban đầu của hợp đồng hiện cùng danh sách, có nhãn riêng.
- Nút **Chốt chỉ số**: popup có bộ lọc riêng (Toà, Phòng, Loại, Tháng chốt), ô số đầu và số cuối sửa được, bật "Chỉ đồng hồ chưa chốt"; lỗi hiện theo từng dòng, dòng hợp lệ vẫn lưu.
- Trong hoá đơn nháp: một menu liệt kê mọi lần chốt (3 tháng liền trước và chỉ số ban đầu), dòng cuối là mới nhất. Sửa số đầu và số cuối ngay tại đó, tiêu thụ và tiền tính ngay, lưu luôn, ghi thẳng về trang Chỉ số. Thiếu chỉ số hoặc số sai thì giữ dòng 0 đồng kèm cảnh báo để sửa tại chỗ, không để mất dòng.
- Hoá đơn đầu (kỳ ký hợp đồng) giữ số đầu, số cuối riêng chép từ chỉ số ban đầu của hợp đồng; sửa ở đó cũng ghi về chỉ số ban đầu (không đổi lần chốt tháng hay hoá đơn khác).
- Duyệt hoá đơn chỉ kiểm thiếu chỉ số, không tính lại; hoá đơn đã duyệt giữ số cũ.

**Quy tắc chỉ số (đã chốt)**
1. Chỉ số độc lập: mỗi lần ghi có số đầu và số cuối riêng; số đầu tự điền bằng số cuối lần trước cho tiện, không bắt buộc bằng. Sửa một lần ghi không đổi lần ghi nào khác hay hoá đơn nào đã tạo, kể cả nháp.
2. Ràng buộc duy nhất: số đầu không lớn hơn số cuối của cùng lần ghi.
3. Chỉ số ban đầu ở hợp đồng bắt buộc cho phí theo đồng hồ, chỉ là số gợi ý lúc tạo hoá đơn đầu; không ràng buộc với lần chốt trước, sau hay ngày lắp.
4. Ngày lắp đồng hồ chỉ dùng khi thay đồng hồ hoặc chuyển phòng giữa kỳ.

**Hợp đồng:** form tạo và popup sửa dùng chung khối phí; phí theo đồng hồ chọn đồng hồ của phòng và điền chỉ số ban đầu, sửa được; biên bản bàn giao không còn chỉ số đồng hồ. Loại phí: bỏ "Nhập tay", xoá được khi chưa dùng.

**Thu chi** (`/cashbook`): sổ chung các khoản thực thu, thực chi (thu tiền thuê, thu và hoàn cọc, chi sửa chữa, điện nước, lương, khác) với dải tổng quan Thu, Chi, Chênh lệch, Cọc đang giữ; lọc theo tháng, cơ sở. Mọi khoản đều sửa, xoá được và có nhật ký; sửa thu tiền thuê không vượt phần còn nợ. Khoản chờ thu không hiện; trừ cọc, mất cọc không tính vào thu chi.

## Yêu cầu

- Node.js ≥ 20, npm
- Một project **Supabase Free** (Postgres + Auth)
- Một bucket **Cloudflare R2** riêng tư (xem mục R2 bên dưới)

## Cài đặt và chạy

1. Tạo project Supabase; script nạp dữ liệu sẽ tạo bucket Storage **riêng tư** `siris` khi cần. Lấy `DATABASE_URL` (Database → Connection string, **Transaction pooler** cổng 6543 — xem [docs/operations/supabase.md](docs/operations/supabase.md)), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` và `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API).
2. Sao chép và điền biến môi trường:

   ```bash
   cp .env.example .env.local
   ```

3. Cài thư viện, tạo bảng, tạo tài khoản quản trị đầu tiên (mật khẩu tạm in ra một lần), chạy:

   ```bash
   npm install
   npm run db:migrate
   npm run seed:admin -- --email you@example.com --name "Tên của bạn"
   npm run db:seed          # (tuỳ chọn) nạp dữ liệu giả + 5 tài khoản mẫu; thêm -- --reset để xoá nạp lại
   npm run dev
   ```

   Mở http://localhost:3000 và đăng nhập. Đặt `NEXT_PUBLIC_DEMO_MODE=1` và `DEMO_PASSWORD` để thấy dải "Môi trường thử" và nút đăng nhập nhanh bằng tài khoản mẫu (Admin, Lan, Minh, Hùng, Vy).

## Kiểm thử

```bash
npm test          # Vitest + PGlite (Postgres nhúng, không cần Docker): unit + integration
npm run lint
npm run build
E2E_BASE_URL=<môi trường thử có NEXT_PUBLIC_DEMO_MODE=1> npm run test:e2e   # Playwright; kiểm tra trước bằng node scripts/e2e-preflight.mjs
```

Bố cục: `tests/unit` (quy tắc thuần ở `src/domain`), `tests/integration` (service với PGlite), `tests/e2e` (Playwright). Chỉ chạy bộ test khi chuẩn bị mở PR hoặc khi web báo lỗi.

| Chức năng | Unit | Integration | E2E |
|---|---|---|---|
| Hoá đơn: tính, kỳ, hệ số, hạn | `domain/billing`, `domain/invoice-rent-period`, `domain/due-date`, `domain/invoice-coefficient` | `invoices`, `invoice-single`, `invoice-backfill`, `invoice-due-date`, `invoice-line-coefficient`, `invoice-unapprove` | `invoices` |
| Chỉ số: tính tiêu thụ | `domain/meter-fee-usage`, `domain/meters-monthly` | `meters`, `meter-backfill` | `chi-so` |
| Chỉ số trong hoá đơn, hoá đơn đầu giữ số riêng | `domain/invoice-builder` | `invoice-meter-edit` (số riêng, chỉ số ban đầu ghi về bảng chỉ số, menu liệt kê mọi lần chốt, lưu không báo lỗi dòng hợp đồng) | `invoices` |
| Sửa phí hợp đồng, chỉ số ban đầu | — | `contract-edit-delete` (không ràng buộc với lần chốt, migration `0043`) | `contract-edit-fees` |
| Thu chi | `domain/cashbook` | `cashbook` (nguồn, hướng, cọc, quyền, sửa, xoá, nhật ký), `lease-payment` | `cashbook` |
| Loại phí | — | `fees` | — |

## Triển khai Vercel

Import repo vào Vercel và khai báo cùng các biến như `.env.example` (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_*`). Chạy `npm run db:migrate` với `DATABASE_URL` của production trước lần deploy đầu và mỗi khi có migration mới.

## Sao lưu

Mỗi đêm GitHub Actions sao lưu cơ sở dữ liệu ra Google Drive (giữ 30 bản). Hướng dẫn thiết lập và khôi phục: [docs/operations/backup-restore.md](docs/operations/backup-restore.md).

## Cloudflare R2 (ảnh giấy tờ)

Tạo bucket riêng tư, tạo API token (Object Read & Write) rồi điền `R2_*` trong `.env.local`.
Bucket cần cấu hình CORS để trình duyệt tải ảnh lên trực tiếp bằng URL ký:

```json
[{ "AllowedOrigins": ["http://localhost:3000", "https://<tên-miền-app>"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

Khi thiếu biến `R2_*`, app dùng adapter bộ nhớ (chỉ để chạy thử, ảnh không được lưu).
