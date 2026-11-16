# Siris — quản lý khách thuê dài hạn

## What this is
Web nội bộ cho nhân viên Siris quản lý cơ sở, phòng, khách thuê, hợp đồng, bàn giao, công tơ, phí, tài sản; nhắc việc (visa), nhập dữ liệu từ Excel, xuất hợp đồng từ mẫu .docx. Phân quyền theo nhóm quyền và cơ sở. Giao diện và tài liệu bằng tiếng Việt.

## Stack
- Next.js 16 App Router (đọc `node_modules/next/dist/docs/` trước khi viết code — xem AGENTS.md), React 19, TypeScript
- Tailwind v4 + shadcn/ui (`@base-ui/react`), react-hook-form + zod, TanStack Query
- Drizzle ORM + Postgres (Supabase), Supabase Auth (`@supabase/ssr`)
- Lưu file: Cloudflare R2 / Supabase Storage (`STORAGE_DRIVER`); docxtemplater, exceljs
- Vitest + PGlite (unit/integration), Playwright (e2e); triển khai Vercel

## Commands
- Install: `npm install`, rồi `npm run db:migrate`
- Dev: `npm run dev`; dữ liệu mẫu: `npm run db:seed` (nạp thêm dần, không dùng `--reset` trừ khi cần)
- Build: `npm run build`
- Lint: `npm run lint` (kèm `eslint-plugin-boundaries` kiểm tra quy tắc import ở mục Architecture)
- Test: `npm test`
- E2E: `E2E_BASE_URL=<môi trường thử có NEXT_PUBLIC_DEMO_MODE=1> npm run test:e2e`; kiểm tra trước bằng `node scripts/e2e-preflight.mjs`
- Migration: sửa `src/db/schema/`, rồi `npm run db:generate` (không sửa tay file trong `drizzle/`)

## Architecture
- Style: N-Layer. Chosen because đây là kiến trúc đang dùng: route → giao diện theo tính năng → server → domain/db, import chỉ đi một chiều.
- Modules: `src/app/` route, page, layout (mỏng, gọi `src/server`); `src/features/<tên>/components/` giao diện của từng tính năng; `src/components/` UI dùng chung (`ui/` là shadcn, `app-shell/`); `src/server/<tên>/` `service.ts` (logic + truy vấn), `actions.ts` (server action), `schemas.ts` (zod); `src/domain/` quy tắc nghiệp vụ thuần (tiền, ngày, quyền, tính phí); `src/db/` client và schema Drizzle; `src/lib/` tiện ích, client Supabase.
- Dependency rules: `domain` không import module nào trong `src`; `db` chỉ import `db`; `server` import `db`, `domain`, `lib`; `features` và `components` import `server` (actions/types), `domain`, `lib`, `components`, không import `db`; một feature không import feature khác; chỉ `app` import `features`.
- New code: tính năng mới = `src/server/<tên>/` + `src/features/<tên>/components/` + route trong `src/app/(app)/<tên>/`; quy tắc tính toán thuần đặt ở `src/domain/` kèm unit test.

## Conventions
- Service nhận `(db, ctx, input)`, `ctx` từ `getAccessContext()`; kiểm quyền bằng `can()` ở `src/domain/access.ts`.
- Server action bọc service bằng `toActionResult` rồi `revalidatePath`; input là `unknown`, parse bằng zod trong service.
- Test ở `tests/unit`, `tests/integration` (PGlite, không cần Docker), `tests/e2e`.
- Commit, comment, chuỗi giao diện viết tiếng Việt; commit theo dạng `feat:` / `fix:` / `docs:` / `perf:`.
- Thiết kế ở `docs/superpowers/specs/`, kế hoạch ở `docs/superpowers/plans/`.
