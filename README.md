# Siris — Web quản lý khách thuê dài hạn

Web nội bộ cho nhân viên Siris quản lý cơ sở, phòng, khách thuê, hợp đồng, bàn giao, điện nước, phí, hoá đơn, tài sản; nhắc việc (visa), nhập dữ liệu từ Excel, soạn mẫu giấy tờ và xuất PDF/Word ngay trong app.

Công nghệ: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 + shadcn/ui, Drizzle ORM, Supabase (Postgres + Auth), Cloudflare R2 hoặc Supabase Storage, Vercel.

## Yêu cầu

- Node.js ≥ 20.9 (CI dùng phiên bản trong `.nvmrc`), npm
- Một project Supabase (Postgres + Auth)
- Khi chạy thật: một bucket Cloudflare R2 riêng tư (xem mục R2)

## Cài đặt và chạy

1. Tạo project Supabase. Lấy `DATABASE_URL` (Database → Connection string, **Transaction pooler** cổng 6543 — xem [docs/operations/supabase.md](docs/operations/supabase.md)), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API).
2. Sao chép và điền biến môi trường:

   ```bash
   cp .env.example .env.local
   ```

   `src/lib/env.ts` kiểm `STORAGE_DRIVER` và biến `R2_*` khi dùng lần đầu; thiếu biến Supabase thì rơi về bộ nhớ trong (xem mục Lưu trữ tệp).
3. Cài thư viện, tạo bảng, tạo tài khoản quản trị đầu tiên (mật khẩu tạm in ra một lần), chạy:

   ```bash
   npm ci
   npm run db:migrate
   npm run seed:admin -- --email you@example.com --name "Tên của bạn"
   npm run db:seed          # (tuỳ chọn) dữ liệu giả + 5 tài khoản mẫu; nạp thêm dần, chỉ dùng -- --reset khi cần xoá nạp lại
   npm run dev
   ```

   Mở http://localhost:3000 và đăng nhập. Đặt `NEXT_PUBLIC_DEMO_MODE=1` và `DEMO_PASSWORD` để thấy dải "Môi trường thử" và nút đăng nhập nhanh (Admin, Lan, Minh, Hùng, Vy).

## Cấu trúc mã nguồn

Modular monolith: mỗi mảng nghiệp vụ là một module, module chia lớp bên trong.

```
src/
  app/                    route, page, layout — mỏng, chỉ ghép module
  modules/
    <mảng>/
      domain/             quy tắc nghiệp vụ thuần (kèm unit test)
      server/             service (logic + truy vấn), actions (server action), schemas (zod)
      ui/                 component giao diện
      index.ts            cổng công khai phía server
      actions.ts          cổng server action cho giao diện
      ui.ts               cổng component
    registrations.ts      đăng ký resolver/loader (tải tệp, xuất giấy tờ)
  domain/                 lõi dùng chung: tiền, ngày, lỗi, quyền, trạng thái
  components/             UI dùng chung (shadcn trong ui/, khung app trong app-shell/)
  lib/                    tiện ích, client Supabase, biến môi trường
  db/                     client Drizzle và schema của mọi bảng
```

| Tầng | Module | Phụ trách |
|---|---|---|
| 1 | `platform` | phiên đăng nhập, nhật ký, tệp và lưu trữ, cài đặt chung |
| 2 | `users` | người dùng, nhóm quyền, cơ sở được cấp |
| 2 | `tenants` | khách thuê, giấy tờ tuỳ thân |
| 2 | `facilities` | cơ sở, phòng, tiện ích, loại phí và giá |
| 2 | `documents` | mẫu giấy tờ, mẫu hoá đơn, dựng PDF/Word/PNG |
| 3 | `assets` | tài sản, kho, chuyển tài sản |
| 3 | `meters` | đồng hồ, chỉ số điện nước |
| 4 | `leasing` | cọc, hợp đồng, phụ lục, bàn giao, sổ cọc, phí phát sinh, hoá đơn, thu tiền, sự cố |
| 5 | `import`, `dashboard` | nhập Excel; nhắc việc |

Quy tắc (ESLint và `tests/unit/architecture` kiểm, CI chặn PR vi phạm):
- Module chỉ import module ở tầng thấp hơn, và chỉ qua `index.ts` / `actions.ts` / `ui.ts`.
- Trong module: `ui` → `domain` và cổng `actions.ts`; `server` → `domain`, `db`; `domain` → `src/domain`.
- `src/domain`, `src/components`, `src/lib`, `src/db` không import module. `src/app` không import schema `@/db` hay `drizzle-orm`.
- Ghi bảng của module khác chỉ qua API của module đó.

**Thêm một tính năng:** viết service + action + schema trong `src/modules/<mảng>/server/<tên>/`, component trong `ui/`, quy tắc thuần trong `domain/` kèm unit test; export ra cổng công khai những gì nơi khác cần; route trong `src/app/(app)/<tên>/`. Thêm mới luôn mở popup (xem `CLAUDE.md`, mục Conventions). Mảng mới: tạo `src/modules/<mảng>/` và thêm vào `MODULE_TIERS` trong `eslint.config.mjs` (test kiến trúc import lại từ đó). Module có `register*` thì thêm vào `src/modules/registrations.ts`.

**Đổi schema:** sửa `src/db/schema/`, chạy `npm run db:generate` (không sửa tay `drizzle/`), rồi `npm run db:migrate`.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | chạy dev |
| `npm run format` / `format:check` | định dạng bằng Prettier / kiểm định dạng |
| `npm run lint` | ESLint, gồm luật ranh giới module; không cho phép cảnh báo |
| `npm run typecheck` | kiểm kiểu TypeScript |
| `npm test` | Vitest: unit, integration (PGlite — Postgres nhúng, không cần Docker), test kiến trúc |
| `npm run build` | build production |
| `npm run db:generate` / `db:migrate` | sinh / chạy migration |
| `npm run db:seed` | nạp dữ liệu mẫu |

## Kiểm thử end-to-end

Chạy trên một môi trường thử có `NEXT_PUBLIC_DEMO_MODE=1` (bản preview Vercel hoặc `npm run dev` với dữ liệu mẫu):

```bash
node scripts/e2e-preflight.mjs
E2E_BASE_URL=https://<preview> npm run test:e2e
```

## Đóng góp

- Không commit thẳng lên `main`. Mỗi thay đổi một nhánh, một PR.
- CI (`.github/workflows/ci.yml`) chạy định dạng, lint, typecheck, test, kiểm migration, build trên mỗi PR; PR chỉ merge khi xanh.
- Commit theo Conventional Commits, viết tiếng Việt: `feat:` `fix:` `docs:` `perf:` `refactor:` `test:` `chore:` `ci:`.
- Quy tắc giao diện: [docs/front-end-design.md](docs/front-end-design.md).
- Kiến trúc chi tiết, quy tắc nghiệp vụ, bẫy đã biết: [docs/architecture.md](docs/architecture.md). Đổi cấu trúc thì cập nhật file đó trong cùng PR.

## Triển khai Vercel

Import repo vào Vercel, khai báo các biến như `.env.example`. Chạy `npm run db:migrate` với `DATABASE_URL` của production trước lần deploy đầu và mỗi khi có migration mới. Font PDF được đóng gói qua `outputFileTracingIncludes` trong `next.config.ts`; dời thư mục font thì sửa cả ở đó và `src/modules/documents/server/pdf/fonts.ts` (`tests/unit/pdf-fonts.test.ts` kiểm).

## Sao lưu

Mỗi đêm GitHub Actions sao lưu cơ sở dữ liệu ra Google Drive (giữ 30 bản). Thiết lập và khôi phục: [docs/operations/backup-restore.md](docs/operations/backup-restore.md).

## Lưu trữ tệp

`STORAGE_DRIVER`: `supabase` (mặc định), `r2` (chạy thật) hoặc `memory`. Thiếu `NEXT_PUBLIC_SUPABASE_URL` hoặc `SUPABASE_SERVICE_ROLE_KEY` thì app dùng bộ nhớ trong (chỉ để thử, tệp không được lưu). Với `r2`, thiếu một biến `R2_*` thì app báo lỗi.

Cloudflare R2: tạo bucket riêng tư, tạo API token (Object Read & Write), điền `R2_*`. Bucket cần CORS để trình duyệt tải ảnh lên bằng URL ký:

```json
[{ "AllowedOrigins": ["http://localhost:3000", "https://<tên-miền-app>"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```
