# Siris — quản lý khách thuê dài hạn

## What this is
Web nội bộ cho nhân viên Siris quản lý cơ sở, phòng, khách thuê, hợp đồng, bàn giao, công tơ, phí, tài sản; nhắc việc (visa), nhập dữ liệu từ Excel, soạn mẫu hợp đồng, phụ lục, biên bản trong app và xuất PDF, Word. Phân quyền theo nhóm quyền và cơ sở. Giao diện và tài liệu bằng tiếng Việt.

## Stack
- Next.js 16 App Router (đọc `node_modules/next/dist/docs/` trước khi viết code — xem AGENTS.md), React 19, TypeScript
- Tailwind v4 + shadcn/ui (`@base-ui/react`), react-hook-form + zod, TanStack Query
- Drizzle ORM + Postgres (Supabase), Supabase Auth (`@supabase/ssr`)
- Lưu file: Cloudflare R2 / Supabase Storage (`STORAGE_DRIVER`); exceljs, `docx` (xuất Word)
- PDF dựng ngay trong app bằng `@react-pdf/renderer` (hoá đơn, phiếu thu, và hợp đồng, phụ lục, biên bản từ mẫu HTML soạn bằng TipTap), Word bằng `docx`, mã QR bằng `qrcode`; không dùng dịch vụ ngoài.
- Vitest + PGlite (unit/integration), Playwright (e2e); triển khai Vercel

## Commands
- Install: `npm install`, rồi `npm run db:migrate`
- Dev: `npm run dev`; dữ liệu mẫu: `npm run db:seed` (nạp thêm dần, không dùng `--reset` trừ khi cần)
- Build: `npm run build`
- Lint: `npm run lint` (kèm `eslint-plugin-boundaries` kiểm tra quy tắc import ở mục Architecture)
- Typecheck: `npm run typecheck`
- Test: `npm test`
- E2E: `E2E_BASE_URL=<môi trường thử có NEXT_PUBLIC_DEMO_MODE=1> npm run test:e2e`; kiểm tra trước bằng `node scripts/e2e-preflight.mjs`
- Migration: sửa `src/db/schema/`, rồi `npm run db:generate` (không sửa tay file trong `drizzle/`)
- Định dạng: npm run format (CI chạy format:check)

## Architecture
- Style: Modular monolith, mỗi module chia lớp bên trong (target; mảng chưa chuyển vẫn ở `src/server/<tên>/` + `src/features/<tên>/` theo N-Layer cũ — lộ trình: `docs/superpowers/plans/2026-11-19-chuan-hoa-repo.md`). Chosen because một team, một lần deploy, nghiệp vụ chia rõ theo mảng, còn N-Layer làm một tính năng rải qua 5–6 thư mục.
- Modules: `src/modules/<mảng>/` gồm `domain/` (quy tắc thuần, kèm unit test), `server/` (service, actions, schemas), `ui/` (component) và ba cổng công khai `index.ts` (server), `actions.ts` (server action), `ui.ts` (component). Mảng: platform, users, tenants, facilities, documents, assets, meters, leasing, import, dashboard. Dùng chung: `src/domain/` (tiền, ngày, lỗi, quyền), `src/components/`, `src/lib/`, `src/db/` (client + schema mọi bảng). `src/app/` route mỏng, ghép module. `src/modules/registrations.ts` đăng ký resolver/loader.
- Dependency rules: tầng 1 platform; tầng 2 users, tenants, facilities, documents; tầng 3 assets, meters; tầng 4 leasing; tầng 5 import, dashboard. Module chỉ import module tầng thấp hơn, qua cổng công khai. Trong module: `ui` → `domain`, cổng `actions.ts`; `server` → `domain`, `db`; `domain` → `src/domain`. Dùng chung không import module. Ghi bảng của module khác chỉ qua API module đó. Code chưa chuyển: `server` → `db`, `domain`, `lib`; `src/db` chỉ `import type` từ `src/domain`; `features` không import `db` hay feature khác; `src/app` không tự truy vấn DB (ESLint chặn `@/db`, `drizzle-orm`; chỉ cho `@/db/client` để truyền vào service).
- New code: vào `src/modules/<mảng>/` của mảng sở hữu; mảng chưa chuyển thì viết ở chỗ cũ và chuyển cùng module.
- Chi tiết: đọc [docs/architecture.md](docs/architecture.md) trước khi sửa — mảng nào đã chuyển, luồng yêu cầu, quy tắc nghiệp vụ, bẫy đã biết. Đổi cấu trúc thì cập nhật file đó.

- Điện nước: mỗi phòng luôn có sẵn hai đồng hồ điện, nước (tạo cùng phòng, không xoá được; chỉ thêm đồng hồ khác). Điện, nước là phí của hợp đồng tính theo đồng hồ: mỗi dòng phí gắn đúng một đồng hồ của phòng đó, đồng hồ đã gắn không dùng cho phí khác, đơn giá lấy từ hợp đồng (giá trong Cài đặt chỉ là giá tham khảo). Không có kiểu tính theo bảng giá cơ sở.

## Conventions
- Service nhận `(db, ctx, input)`, `ctx` từ `getAccessContext()`; kiểm quyền bằng `can()` ở `src/domain/access.ts`.
- Server action bọc service bằng `toActionResult` rồi `revalidatePath`; input là `unknown`, parse bằng zod trong service.
- File có `register*(` cấp module phải được import trong `src/server/registrations.ts` (đích: `src/modules/registrations.ts`); mọi `actions.ts`, API `route.ts` và layout `(app)` import nó ở dòng đầu (test kiểm).
- Test ở `tests/unit`, `tests/integration` (PGlite, không cần Docker), `tests/e2e`.
- Commit, comment, chuỗi giao diện viết tiếng Việt; commit theo Conventional Commits: `feat:` `fix:` `docs:` `perf:` `refactor:` `test:` `chore:` `ci:`.
- Thiết kế ở `docs/superpowers/specs/`, kế hoạch ở `docs/superpowers/plans/`.
- Thao tác "thêm mới" luôn hiện popup, không điều hướng sang trang mới. Form cần dữ liệu từ server: làm trang `src/app/(app)/<mục>/new/page.tsx` với thân trang tách thành component dùng chung (`new-<mục>.tsx`), rồi thêm route chặn `src/app/(app)/@modal/(.)<mục>/new/page.tsx` bọc thân đó bằng `RouteModal` (`src/components/route-modal.tsx`). Form tự chứa: bọc bằng `FormDialog` (`src/components/form-dialog.tsx`). Liên kết "thêm" dùng `Link`, không dùng `<a>` (trừ khi cố ý tải trang đầy đủ). Sau khi tạo: `router.refresh()` để danh sách phía sau cập nhật. Phải kiểm tra: bấm từ danh sách ra popup, F5 hoặc mở thẳng ra trang đầy đủ, Esc quay về đúng URL cũ.
- Giao diện: theo [docs/front-end-design.md](docs/front-end-design.md) (bố cục danh sách, bộ lọc, bảng, hộp thoại, màu, ô tiền, điện thoại).
