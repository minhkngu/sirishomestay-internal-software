# Kiến trúc Siris

Tài liệu cho người (và agent) tiếp tục sửa repo. Đọc trước khi thêm tính năng, dời file hay đổi quy tắc import. Tóm tắt luật nằm ở mục Architecture của `CLAUDE.md`; file này giải thích chi tiết, trạng thái hiện tại và các bẫy.

Cập nhật lần cuối: 20/11/2026.

## 1. Đang ở đâu

Repo **đang chuyển** từ N-Layer sang **Modular monolith** (người dùng chọn ngày 20/11/2026). Lộ trình và từng bước: [docs/superpowers/plans/2026-11-19-chuan-hoa-repo.md](superpowers/plans/2026-11-19-chuan-hoa-repo.md).

Trong lúc chuyển, hai cấu trúc cùng tồn tại:
- Mảng **chưa chuyển**: code ở `src/server/<tên>/` và `src/features/<tên>/`, theo luật N-Layer (mục 3).
- Mảng **đã chuyển**: code ở `src/modules/<mảng>/`, theo luật module (mục 4).

Muốn biết một mảng đang ở đâu: xem bảng dưới. **Mỗi PR chuyển module phải cập nhật bảng này.**

| Tầng | Module | Trạng thái | Vị trí hiện tại | Task |
|---|---|---|---|---|
| 1 | `platform` | Đã chuyển | `src/modules/platform/` (`features/settings/components/settings-tabs.tsx` ở lại, chuyển ở Task 16; `auth-user.ts` nằm ở `src/lib/supabase/`) | 13 |
| 2 | `users` | Đã chuyển | `src/modules/users/` | 14 |
| 2 | `tenants` | Chưa chuyển | `src/server/tenants`, `src/features/tenants` | 15 |
| 2 | `facilities` | Chưa chuyển | `src/server/{facilities,rooms,amenities,fees,cascade-delete.ts}`, `src/features/{facilities,settings,rooms}` | 16 |
| 2 | `documents` | Chưa chuyển | `src/server/{templates,invoice-templates,pdf,word,convert}`, `src/features/templates` | 17 |
| 3 | `assets` | Chưa chuyển | `src/server/{assets,stock}`, `src/features/assets` | 18 |
| 3 | `meters` | Chưa chuyển | `src/server/meters`, `src/features/meters` | 19 |
| 4 | `leasing` | Chưa chuyển | `src/server/{contracts,addenda,handovers,charges,invoices,incidents}`, `src/features/{contracts,deposits,handovers,charges,invoices,incidents}` | 20–21 |
| 5 | `import` | Chưa chuyển | `src/server/import`, `src/features/import` | 21 |
| 5 | `dashboard` | Chưa chuyển | `src/server/dashboard`, `src/features/dashboard` | 21 |

Việc nền trước khi chuyển (Prettier, CI, gỡ ghép ngược…) là Task 1–12 của plan; xem checkbox trong plan để biết task nào xong.

## 2. Luồng một yêu cầu

- **Trang (server component)** trong `src/app/(app)/<mục>/page.tsx`: gọi `getAccessContext()` (`src/server/session.ts`, chuyển về `/login` nếu chưa đăng nhập hoặc bị khoá), rồi gọi service với `db` từ `@/db/client`. Trang không tự viết truy vấn (đang dọn ở Task 7).
- **Thao tác của người dùng (client component)** gọi server action `src/server/<tên>/actions.ts`: `getAccessContext()` → `toActionResult(() => service(db, ctx, input))` (`src/lib/action-result.ts`, đổi lỗi đã biết thành `{ ok: false, error, fieldErrors }`, kể cả lỗi trùng khoá 23505) → `revalidatePath`.
- **Service** `(db, ctx, input)`: `input` là `unknown`, parse bằng zod trong `schemas.ts`; kiểm quyền bằng `assertCan`/`can` (`src/domain/access.ts`); ghi nhật ký `recordAudit(tx, ctx, …)` trong cùng transaction.
- **API route** chỉ có hai: `src/app/api/files/[id]` (tải/xem tệp qua URL ký) và `src/app/api/documents/preview` (xem trước giấy tờ). Hai route dùng `loadAccessContext` thay vì `getAccessContext`.
- **Đăng nhập:** `src/proxy.ts` (Next 16 dùng `proxy.ts`, không phải `middleware.ts`) làm mới phiên Supabase và chuyển người chưa đăng nhập về `/login`.
- **Popup thêm mới:** route chặn `src/app/(app)/@modal/(.)<mục>/new/page.tsx` bọc thân trang `new-<mục>.tsx` bằng `RouteModal`; F5 hoặc mở thẳng URL ra trang đầy đủ. Form tự chứa dùng `FormDialog`.

## 3. Luật N-Layer (cho code chưa chuyển)

- `src/app/` route mỏng; là nơi duy nhất được ghép nhiều feature (ví dụ `contracts/contract-detail.tsx` ghép charges, deposits, contracts, handovers).
- `src/features/<tên>/components/` giao diện; không import `db`, không import feature khác.
- `src/server/<tên>/` `service.ts`, `actions.ts`, `schemas.ts`; import `db`, `domain`, `lib`.
- `src/domain/` quy tắc thuần, không import gì ngoài `src/domain`.
- `src/db/` chỉ import `db`, trừ `import type` từ `src/domain` (kiểu trạng thái, `BankAccount`); ESLint chỉ cho dependency kind `type`.
- `eslint-plugin-boundaries` trong `eslint.config.mjs` kiểm các luật này khi `npm run lint`.

## 4. Kiến trúc đích: Modular monolith

```
src/modules/<mảng>/
  domain/      quy tắc thuần, kèm unit test
  server/      service, actions, schemas (giữ thư mục con cũ, vd server/contracts/, server/invoices/)
  ui/          component
  index.ts     cổng công khai phía server (service, kiểu)
  actions.ts   cổng server action cho giao diện (re-export, không có 'use server' ở file cổng)
  ui.ts        cổng component
src/modules/registrations.ts   import mọi file có register* (mục 6); điểm ghép, không phải module
```

Luật:
- **Tầng:** 1 `platform`; 2 `users`, `tenants`, `facilities`, `documents`; 3 `assets`, `meters`; 4 `leasing`; 5 `import`, `dashboard`. Module chỉ import module **tầng thấp hơn**, chỉ qua `index.ts`/`actions.ts`/`ui.ts`. Thứ tự tầng nằm ở `MODULE_TIERS`, export từ `eslint.config.mjs` (nguồn duy nhất; `tests/unit/architecture/import-graph.ts` import lại). Mảng mới: thêm vào đó.
- **Trong module:** `ui` → `domain`, cổng `actions.ts` và `server/**/actions.ts` của chính module, `src/components`, `src/domain`, `src/lib`; `import type` từ `index.ts`/`server/**` của chính module và `index.ts` của module tầng thấp hơn (giá trị thì không, để code server không lọt vào bundle trình duyệt); `ui.ts`/`actions.ts` của module tầng thấp hơn. `server` → `domain`, `server` của chính module, `src/db`, `src/domain`, `src/lib`, `index.ts` của module tầng thấp hơn. `domain` → `domain` của chính module, `src/domain`.
- **Dùng chung** (`src/domain`, `src/components`, `src/lib`, `src/db`) không import module. `src/db` được `import type` từ `src/domain` (không import giá trị).
- **Ghi bảng của module khác** chỉ qua API module đó. Đọc (select/join) bảng khác thì được. Luật ghi không có công cụ kiểm, chỉ giữ bằng review.
- **Chia khi chuyển:** file domain chỉ một module dùng → vào module đó; hai module trở lên → ở lại `src/domain`. Component đi theo module của server nó import; import hai module ngang tầng → đặt cạnh route trong `src/app`.

- **`src/modules/registrations.ts`:** import được mọi module và `src/server`; chỉ điểm vào được import nó: `src/app`, `src/server/**/actions.ts`, cổng `actions.ts` và `server/**/actions.ts` của module.
- **Công cụ kiểm:** `eslint-plugin-boundaries` trong `eslint.config.mjs` kiểm mọi luật trên (`npm run lint`); `tests/unit/architecture/modules.test.ts` dựng đồ thị import (bỏ `import type`) và kiểm lại tầng, cổng công khai, dùng chung không import module.

Luật chuyển tiếp (bỏ ở Task 22): code cũ (`src/server`, `src/features`, `src/app`) được import module qua cổng công khai; module **không** import `src/server`/`src/features`. Chuyển từ tầng thấp lên nên module đã chuyển chỉ cần module đã chuyển.

### Vì sao chia như vậy

- **`leasing` gom hợp đồng, phụ lục, bàn giao, sổ cọc, phí phát sinh, hoá đơn, sự cố.** `contracts`/`addenda` ghi khoảng 20 bảng (hoá đơn đầu tiên khi tạo hợp đồng, hoá đơn thanh lý, chỉ số khi bàn giao, xoá dây chuyền khi xoá hợp đồng); duyệt hoá đơn thanh lý lại chốt hợp đồng. Tách thành hai module sẽ phụ thuộc vòng.
- **Trạng thái phòng** (`listRoomsWithStatus`, `getRoomDetail`) cần dữ liệu hợp đồng nên thuộc `leasing`; `facilities` chỉ CRUD cơ sở, phòng, tiện ích, phí (đã làm ở Task 9: `src/server/contracts/room-view.ts`).
- **Gán mẫu hoá đơn** cho hợp đồng/hoá đơn ghi bảng của `leasing` nên thuộc `leasing`, không thuộc `documents` (đã làm ở Task 9: `src/server/invoices/template-assignment.ts`).
- **`documents`** không biết hợp đồng hay hoá đơn: module tầng trên đăng ký loader cho nó (mục 6).

## 5. Quy tắc nghiệp vụ cần biết trước khi sửa

- **Quyền:** 7 nhóm (`src/domain/access.ts`). Có `settings` là admin, thấy mọi cơ sở. Người khác chỉ thấy cơ sở được cấp. `assertCan` ném `NotFoundError` khi ngoài phạm vi cơ sở (không lộ sự tồn tại), `ForbiddenError` khi thiếu nhóm quyền. Khách mất cơ sở dùng `NO_FACILITY` (chỉ admin thấy). Số passport/CCCD bị che (`maskId`) với người không có `tenants_contracts`.
- **Hoá đơn tháng N** (`src/domain/invoice-builder.ts`): tiền phòng + phí cố định của kỳ N (trả trước); điện, nước, phí theo lần của tháng N−1 (trả sau). Có chia ngày lẻ (`proration.ts`) và hệ số kỳ.
- **Phí hợp đồng:** lưu ở `lease_fee_snapshots` (chụp giá lúc ký). Điện, nước là dòng phí gắn đúng một đồng hồ của phòng, đơn giá lấy từ hợp đồng; không còn kiểu cũ (`lease_fees`, `feeModel`, bảng giá cơ sở `utility_rates`).
- **Hợp đồng cọc → hợp đồng thuê:** mỗi phòng tối đa 1 hợp đồng cọc `pending` và 1 hợp đồng `active` (unique index có điều kiện trong `src/db/schema/contracts.ts`).
- **Lịch sử/khôi phục hợp đồng:** mỗi lần sửa/xoá chụp bản ghi vào `contract_versions` (`server/contracts/history.ts`, `restore.ts`).
- **Ghi chéo trong một transaction:** hàm hậu tố `InTransaction` (`createAssetInTransaction`, `moveAssetsInTransaction`, `setAssetStatusInTransaction`, `startHandoverInTransaction`) nhận `tx` để module khác gọi trong cùng transaction. Giữ mẫu này khi cần ghi qua module.
- **Dữ liệu demo:** cột `isDemo` đánh dấu dữ liệu giả của `npm run db:seed`.

## 6. Bẫy đã biết

| Bẫy | Hậu quả | Cách xử lý / trạng thái |
|---|---|---|
| Đăng ký kiểu side-effect: `registerOwnerResolver`, `registerExportOwnerResolver`, `registerDocLoader`, `registerPdfLoader` chỉ chạy khi file đăng ký đã được import | Route lạnh báo "Loại tệp chưa được hỗ trợ" hoặc không xuất được giấy tờ | Đã xử lý (Task 8): `src/modules/registrations.ts` (Task 12 dời từ `src/server/`) import mọi file có `register*`, và được import ở dòng đầu mọi `actions.ts`, API `route.ts` và `src/app/(app)/layout.tsx`; test `tests/unit/architecture/registrations.test.ts` kiểm. Module mới có `register*` phải thêm vào file đó |
| Font PDF dùng đường dẫn cứng `src/server/pdf/fonts/` ở `next.config.ts` (`outputFileTracingIncludes`) và `src/server/pdf/fonts.ts` | Dời thư mục mà quên: local, test vẫn xanh, **PDF trên Vercel hỏng** | Sửa cả hai chỗ; Task 17 thêm `tests/unit/pdf-fonts.test.ts`; luôn thử "Xem PDF" trên preview |
| `cascade-delete.ts` (xoá cơ sở/phòng) ghi bảng của hợp đồng, hoá đơn… | Vi phạm luật "ghi bảng module khác" | Ngoại lệ có chủ ý vì DB không có `ON DELETE CASCADE`; không "sửa" bằng cách thêm cascade trong schema nếu chưa bàn |
| Phụ thuộc hai chiều `addenda ↔ invoices`, `invoices ↔ templates` | Khó tách, dễ vòng import | Cả `addenda` và `invoices` vào `leasing`; `invoices ↔ templates` gỡ ở Task 8 |
| 8 trang trong `src/app` tự viết truy vấn Drizzle | Bỏ qua kiểm quyền của service | Đã xử lý ở Task 7: truy vấn chuyển vào service, ESLint chặn `@/db` schema và `drizzle-orm` trong `src/app` |
| `NEXT_PUBLIC_*` đọc kiểu `process.env[name]` | Không được nhúng vào bundle trình duyệt, đăng nhập hỏng | Luôn viết literal `process.env.NEXT_PUBLIC_X` (Task 5 gom vào `src/lib/env.ts`) |
| Lưu trữ: `STORAGE_DRIVER` mặc định `supabase`; thiếu biến Supabase thì rơi về **bộ nhớ trong** (tệp mất khi khởi động lại) | Tưởng đã lưu ảnh nhưng không | Kiểm biến khi chạy thật; `r2` thiếu biến thì báo lỗi |
| Next.js 16 khác bản quen thuộc | Viết theo trí nhớ dễ sai API | Đọc `node_modules/next/dist/docs/` trước (xem `AGENTS.md`) |
| `@napi-rs/canvas`, `pdfkit` cần đóng gói đặc biệt trên Vercel | Xuất PNG/PDF hỏng trên production | Giữ `serverExternalPackages` và `outputFileTracingIncludes` trong `next.config.ts` |

## 7. Kiểm thử

- `npm test`: unit (`tests/unit`, gồm test kiến trúc từ Task 8/12) và integration (`tests/integration`) chạy với PGlite qua `createTestDb()` ở `tests/helpers/db.ts`. Không cần Docker hay Supabase. Integration gọi thẳng service với `ctx` giả.
- `npm run test:e2e`: Playwright trên môi trường có `NEXT_PUBLIC_DEMO_MODE=1`; chạy `node scripts/e2e-preflight.mjs` trước, đặt `E2E_BASE_URL`.
- Mọi PR (sau Task 4) chạy CI: định dạng, lint, typecheck, test, kiểm không sinh migration, build.
- Không có migration nào trong lộ trình chuyển kiến trúc: revert code bất kỳ PR nào không cần đụng DB.

## 8. Giữ tài liệu này đúng

- PR chuyển một module: cập nhật bảng mục 1 (trạng thái, vị trí hiện tại).
- PR đổi luật import, thêm module, đổi tầng: cập nhật mục 4, `CLAUDE.md` (Architecture) và `MODULE_TIERS`.
- Phát hiện bẫy mới: thêm một dòng vào mục 6.
- Khi xong Task 22: bỏ mục 3, luật chuyển tiếp ở mục 4 và các dòng bẫy đã xử lý; mục 1 chỉ còn bảng module.
