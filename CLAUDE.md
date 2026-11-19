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
- Test: `npm test`
- E2E: `E2E_BASE_URL=<môi trường thử có NEXT_PUBLIC_DEMO_MODE=1> npm run test:e2e`; kiểm tra trước bằng `node scripts/e2e-preflight.mjs`
- Migration: sửa `src/db/schema/`, rồi `npm run db:generate` (không sửa tay file trong `drizzle/`)

## Architecture
- Style: N-Layer. Chosen because đây là kiến trúc đang dùng: route → giao diện theo tính năng → server → domain/db, import chỉ đi một chiều.
- Modules: `src/app/` route, page, layout (mỏng, gọi `src/server`); `src/features/<tên>/components/` giao diện của từng tính năng; `src/components/` UI dùng chung (`ui/` là shadcn, `app-shell/`); `src/server/<tên>/` `service.ts` (logic + truy vấn), `actions.ts` (server action), `schemas.ts` (zod); `src/domain/` quy tắc nghiệp vụ thuần (tiền, ngày, quyền, tính phí); `src/db/` client và schema Drizzle; `src/lib/` tiện ích, client Supabase.
- Dependency rules: `domain` không import module nào trong `src`; `db` chỉ import `db`; `server` import `db`, `domain`, `lib`; `features` và `components` import `server` (actions/types), `domain`, `lib`, `components`, không import `db`; một feature không import feature khác; chỉ `app` import `features`.
- New code: tính năng mới = `src/server/<tên>/` + `src/features/<tên>/components/` + route trong `src/app/(app)/<tên>/`; quy tắc tính toán thuần đặt ở `src/domain/` kèm unit test.

## Front-end design

### Bố cục trang danh sách
- Thứ tự: tiêu đề + dòng mô tả ngắn → dải tổng quan → tab → một thanh lọc → bảng → phân trang. Không thêm panel/cây lọc bên cạnh.
- Mỗi tab chỉ một nút chính; nút phụ dùng outline/ghost.
- Dải tổng quan là một khung chia ô (2 cột trên điện thoại, 4 cột trên desktop): nhãn 13px, số 24px `tabular-nums`, đơn vị nhỏ màu muted. Không icon trong ô, không lặp lại số đếm ở toolbar hay tab.
- Số trong dải tổng quan và bảng luôn tính từ dữ liệu đang lọc, không viết cứng.

### Bộ lọc
- Dùng `Select` trong `src/components/ui/select.tsx` cho mọi menu lọc và ô "Số dòng"; không dùng `<select>` native cho menu nổi vì menu native theo hệ điều hành, lệch thiết kế. Select trong form hộp thoại có thể còn native cho tới khi form đó được chuyển.
- Các bộ lọc cùng chiều cao 36px (`h-9`), cùng bo góc; mũi tên do `Select` vẽ, không tự thêm mũi tên native.
- Lọc vị trí là hai dropdown phẳng, phụ thuộc: **Toà → Vị trí**. Chưa chọn toà chỉ có Tất cả, Kho, Khu chung, Chưa xếp trên toàn bộ toà; chọn toà mới hiện danh sách phòng. Đổi toà phải reset vị trí.
- Không dựng lại cây vị trí; không lặp cùng một bộ lọc ở nhiều nơi.
- "Chưa xếp" = tài sản thuộc toà nhưng chưa gán phòng/kho; luôn lọc được trên tất cả toà. Không có tài sản không thuộc toà (`facility_id` NOT NULL; xoá toà/phòng thì tài sản bị xoá theo).
- Tìm kiếm/lọc xử lý tại trình duyệt, không gọi server; giữ trạng thái lọc trong state của trang hoặc URL như hiện có.

### Bảng
- Bảng nằm trong một card `rounded-2xl border`, không shadow; header chữ thường 13px màu muted, không in hoa.
- Cột định danh 2 dòng: mã đậm + tên nhỏ. Vị trí một dòng dạng "Phòng 101 · Bình Thạnh" hoặc "Kho · ...". Trạng thái là chip nhạt (Tốt / Trầy xước / Hỏng / Đã thanh lý). Tiền căn phải, `tabular-nums`, dùng `formatVND`.
- Không lặp cột "Toà" nếu đã nằm trong cột vị trí; không hiện cột rỗng ở mọi dòng.
- Có checkbox chọn dòng; header có checkbox "chọn tất cả" (indeterminate khi chọn một phần). Thanh thao tác hàng loạt là overlay cố định, không đẩy layout bảng.
- Dưới `lg`, bảng chuyển thành dòng 2 dòng, không tràn ngang; vẫn đủ trường, không cắt số.
- Phân trang dùng `Pager` chung; ô "Số dòng" dùng `Select` của app.

### Hộp thoại và biểu mẫu
- Form thêm/sửa ngắn (thêm tài sản, thêm vật tư, cập nhật kho) đặt trong `Dialog`, không nhét form thô vào đầu trang.
- Nhãn nằm trên ô, ô cao 36px; nút chính ở footer; lỗi hiện trong hộp thoại.
- Thiết kế lại không được đổi dữ liệu, quyền hay hành vi nghiệp vụ.

### Màu, chữ, trạng thái
- Nền `#F6F8F7`, card trắng, viền `border-border/70`. Xanh thương hiệu chỉ trên nút chính, tab active, mục đang chọn và chip trạng thái.
- Không gradient, glow, icon trong ô màu. Shadow chỉ cho overlay thật (dialog/menu/thanh nổi); ưu tiên border hoặc ring.
- Be Vietnam Pro: tiêu đề trang 20px, số tổng 24px, nội dung 14px, nhãn 12–13px.
- Trạng thái tài sản: `disposed` → Đã thanh lý, `broken` → Hỏng, `in_use` → hiện tình trạng (Hư/Hỏng gộp thành Hỏng). Số 0 in là 0; thiếu dữ liệu dùng "—"; dữ liệu cũ thiếu toà ghi "Không rõ toà".

### Ô nhập tiền
- Ô tiền dùng `src/components/ui/money-input.tsx` (tự thêm dấu chấm, giữ con trỏ, cho phép số âm khi cần); không dùng `type="number"` cho tiền.
- Hiển thị tiền bằng `formatVND` (dấu chấm hàng nghìn, không đổi sang dấu phẩy).

### Điện thoại
- Topbar gọn: "Siris" + avatar + Đăng xuất; ẩn tên người dùng ở màn hẹp.
- Bộ lọc xuống dòng gọn, không tràn ngang; bảng thành dòng 2 dòng; nút chính vẫn ở đầu trang hoặc đầu tab.
- Khi đổi một `<select>` native sang `Select`, cập nhật e2e từ `selectOption` sang click trigger rồi `getByRole('option')`.

## Conventions
- Service nhận `(db, ctx, input)`, `ctx` từ `getAccessContext()`; kiểm quyền bằng `can()` ở `src/domain/access.ts`.
- Server action bọc service bằng `toActionResult` rồi `revalidatePath`; input là `unknown`, parse bằng zod trong service.
- Test ở `tests/unit`, `tests/integration` (PGlite, không cần Docker), `tests/e2e`.
- Commit, comment, chuỗi giao diện viết tiếng Việt; commit theo dạng `feat:` / `fix:` / `docs:` / `perf:`.
- Thiết kế ở `docs/superpowers/specs/`, kế hoạch ở `docs/superpowers/plans/`.
- Thao tác "thêm mới" luôn hiện popup, không điều hướng sang trang mới. Form cần dữ liệu từ server: làm trang `src/app/(app)/<mục>/new/page.tsx` với thân trang tách thành component dùng chung (`new-<mục>.tsx`), rồi thêm route chặn `src/app/(app)/@modal/(.)<mục>/new/page.tsx` bọc thân đó bằng `RouteModal` (`src/components/route-modal.tsx`). Form tự chứa: bọc bằng `FormDialog` (`src/components/form-dialog.tsx`). Liên kết "thêm" dùng `Link`, không dùng `<a>` (trừ khi cố ý tải trang đầy đủ). Sau khi tạo: `router.refresh()` để danh sách phía sau cập nhật. Phải kiểm tra: bấm từ danh sách ra popup, F5 hoặc mở thẳng ra trang đầy đủ, Esc quay về đúng URL cũ. Chi tiết: `docs/superpowers/specs/2026-11-19-popup-cho-thao-tac-them-moi-design.md`.
