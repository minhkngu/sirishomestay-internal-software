# Siris — Web quản lý khách thuê dài hạn

Web nội bộ quản lý cơ sở, phòng, khách thuê, bảng nhắc việc (visa), nhập dữ liệu từ Excel.
Thiết kế: `docs/superpowers/specs/` · Kế hoạch: `docs/superpowers/plans/`.

Công nghệ: Next.js 16 (App Router), TypeScript, Tailwind v4 + shadcn/ui, Drizzle ORM, Supabase (Postgres + Auth), Cloudflare R2, Vercel.

## Yêu cầu

- Node.js ≥ 20, npm
- Một project **Supabase Free** (Postgres + Auth)
- Một bucket **Cloudflare R2** riêng tư (xem mục R2 bên dưới)

## Cài đặt và chạy

1. Tạo project Supabase; script nạp dữ liệu sẽ tạo bucket Storage **riêng tư** `siris` khi cần. Lấy `DATABASE_URL` (Database → Connection string, **Session pooler** — địa chỉ direct `db.<ref>.supabase.co` chỉ có IPv6), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` và `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API).
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
npm test          # Vitest + PGlite (Postgres nhúng, không cần Docker)
npm run lint
npm run build
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e   # smoke test Playwright, cần Supabase dev; bỏ qua nếu thiếu biến
```

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
