# Kiến trúc Siris

Tài liệu cho người (và agent) tiếp tục sửa repo. Đọc trước khi thêm tính năng, dời file hay đổi quy tắc import. Tóm tắt luật nằm ở mục Architecture của `CLAUDE.md`; file này giải thích chi tiết, trạng thái hiện tại và các bẫy.

Cập nhật lần cuối: 23/11/2026.

## 1. Các module

Repo là **Modular monolith**: mỗi mảng nghiệp vụ là một module ở `src/modules/<tên>/`, chia lớp `domain/`, `server/`, `ui/` bên trong. Dùng chung: `src/domain`, `src/components`, `src/lib`, `src/db`; route ở `src/app`.

| Tầng | Module | Phụ trách |
|---|---|---|
| 1 | `platform` | phiên đăng nhập, nhật ký, tệp và lưu trữ, cài đặt chung |
| 2 | `users` | người dùng, nhóm quyền, cơ sở được cấp |
| 2 | `tenants` | khách thuê, giấy tờ tuỳ thân |
| 2 | `facilities` | cơ sở, phòng, tiện ích, loại phí và giá |
| 2 | `documents` | mẫu giấy tờ, mẫu hoá đơn, xem sẵn mẫu, dựng PDF/Word/PNG |
| 3 | `assets` | tài sản, kho, chuyển tài sản |
| 3 | `meters` | đồng hồ (mỗi phòng có sẵn điện, nước — mục 4), loại đồng hồ, chỉ số và lịch sử chỉ số |
| 4 | `leasing` | cọc, hợp đồng, phụ lục, bàn giao, sổ cọc, phí phát sinh, hoá đơn (hàng loạt, hoá đơn lẻ, hoá đơn đầu giữ chỉ số riêng), thu tiền, sự cố |
| 5 | `import` | nhập Excel |
| 5 | `dashboard` | nhắc việc |
| 5 | `cashbook` | sổ Thu chi (sở hữu bảng `expenses`) |

## 2. Luồng một yêu cầu

- **Trang (server component)** trong `src/app/(app)/<mục>/page.tsx`: gọi `getAccessContext()` (`src/modules/platform/server/session.ts`, chuyển về `/login` nếu chưa đăng nhập hoặc bị khoá), rồi gọi service với `db` từ `@/db/client`. Trang không tự viết truy vấn (ESLint chặn).
- **Thao tác của người dùng (client component)** gọi server action qua cổng `actions.ts` của module (file `src/modules/<mảng>/server/<tên>/actions.ts`): `getAccessContext()` → `toActionResult(() => service(db, ctx, input))` (`src/lib/action-result.ts`, đổi lỗi đã biết thành `{ ok: false, error, fieldErrors }`, kể cả lỗi trùng khoá 23505) → `revalidatePath`.
- **Service** `(db, ctx, input)`: `input` là `unknown`, parse bằng zod trong `schemas.ts`; kiểm quyền bằng `assertCan`/`can` (`src/domain/access.ts`); ghi nhật ký `recordAudit(tx, ctx, …)` trong cùng transaction.
- **API route** chỉ có hai: `src/app/api/files/[id]` (tải/xem tệp qua URL ký) và `src/app/api/documents/preview` (xem trước giấy tờ). Hai route dùng `loadAccessContext` thay vì `getAccessContext`.
- **Đăng nhập:** `src/proxy.ts` (Next 16 dùng `proxy.ts`, không phải `middleware.ts`) làm mới phiên Supabase và chuyển người chưa đăng nhập về `/login`.
- **Popup thêm mới:** route chặn `src/app/(app)/@modal/(.)<mục>/new/page.tsx` bọc thân trang `new-<mục>.tsx` bằng `RouteModal`; F5 hoặc mở thẳng URL ra trang đầy đủ. Form tự chứa dùng `FormDialog`.

## 3. Cấu trúc và luật import

```
src/modules/<mảng>/
  domain/      quy tắc thuần, kèm unit test
  server/      service, actions, schemas (giữ thư mục con cũ, vd server/contracts/, server/invoices/)
  ui/          component
  index.ts     cổng công khai phía server (service, kiểu)
  actions.ts   cổng server action cho giao diện (re-export, không có 'use server' ở file cổng)
  ui.ts        cổng component
src/modules/registrations.ts   import mọi file có register* (mục 5); điểm ghép, không phải module
```

Luật:
- **Tầng:** 1 `platform`; 2 `users`, `tenants`, `facilities`, `documents`; 3 `assets`, `meters`; 4 `leasing`; 5 `import`, `dashboard`, `cashbook`. Module chỉ import module **tầng thấp hơn**, chỉ qua `index.ts`/`actions.ts`/`ui.ts`. Thứ tự tầng nằm ở `MODULE_TIERS`, export từ `eslint.config.mjs` (nguồn duy nhất; `tests/unit/architecture/import-graph.ts` import lại). Mảng mới: thêm vào đó.
- **Trong module:** `ui` → `domain`, cổng `actions.ts` và `server/**/actions.ts` của chính module, `src/components`, `src/domain`, `src/lib`; `import type` từ `index.ts`/`server/**` của chính module và `index.ts` của module tầng thấp hơn (giá trị thì không, để code server không lọt vào bundle trình duyệt); `ui.ts`/`actions.ts` của module tầng thấp hơn. `server` → `domain`, `server` của chính module, `src/db`, `src/domain`, `src/lib`, `index.ts` của module tầng thấp hơn. `domain` → `domain` của chính module, `src/domain`.
- **`src/proxy.ts`** chỉ import `src/lib`, `src/domain` (và package ngoài): chạy trước mọi route nên không kéo module, `src/db`, `src/components`. ESLint kiểm (file category `proxy`) và `modules.test.ts` kiểm lại (`proxy chỉ import lib/domain`).
- **Component client trong `src/app`** (file có `'use client'` ở câu lệnh đầu) không import **giá trị** từ `index.ts` của module (cổng server; `import type` thì được); dùng `ui.ts`/`actions.ts`. ESLint không phân biệt `'use client'` nên chỉ `modules.test.ts` kiểm (`client import cổng server`).
- **Dùng chung** (`src/domain`, `src/components`, `src/lib`, `src/db`) không import module. `src/db` được `import type` từ `src/domain` (không import giá trị).
- **Ghi bảng của module khác** chỉ qua API module đó. Đọc (select/join) bảng khác thì được. Luật ghi không có công cụ kiểm, chỉ giữ bằng review.
- **Đặt file:** file domain chỉ một module dùng → vào module đó; hai module trở lên → ở lại `src/domain`. Component đi theo module của server nó import; import hai module ngang tầng → đặt cạnh route trong `src/app`.
- **`src/modules/registrations.ts`:** import được mọi module; chỉ điểm vào được import nó: `src/app` và `server/**/actions.ts` của module; cổng `actions.ts` chỉ re-export, không import.
- **Hằng số và nhãn một nguồn:** mỗi khái niệm (giới hạn int4 `MAX_MONEY`/`MAX_INT4`, múi giờ `VN_TIME_ZONE`, nhãn trạng thái, phương thức thu tiền, giới hạn tải lên…) chỉ định nghĩa một lần. Một module dùng thì đặt ở `src/modules/<m>/domain/`; từ hai module (hoặc module + `src/domain`) thì đặt ở `src/domain/`. Chỗ chữ khác nhau có chủ ý (bản dài/ngắn, nhãn cố ý gộp như `signStatusLabel`) thì giữ nhiều map có tên trong cùng file nguồn. `tests/unit/architecture/constants.test.ts` chặn viết lại một số giá trị.
- **Công cụ kiểm:** `eslint-plugin-boundaries` trong `eslint.config.mjs` kiểm mọi luật trên (`npm run lint`); luật `import/no-duplicates` gộp import giá trị trùng nguồn nhưng không bắt kiểu `{ X, type Y }` lẫn trong cùng câu import, nên gộp tay; `tests/unit/architecture/modules.test.ts` dựng đồ thị import (bỏ `import type`) và kiểm lại tầng, cổng công khai, dùng chung không import module, `src/proxy.ts`, component client trong `src/app`.

### Vì sao chia như vậy

- **`leasing` gom hợp đồng, phụ lục, bàn giao, sổ cọc, phí phát sinh, hoá đơn, sự cố.** `contracts`/`addenda` ghi khoảng 20 bảng (hoá đơn đầu tiên khi tạo hợp đồng, hoá đơn thanh lý, chỉ số khi bàn giao, xoá dây chuyền khi xoá hợp đồng); duyệt hoá đơn thanh lý lại chốt hợp đồng. Tách thành hai module sẽ phụ thuộc vòng.
- **Trạng thái phòng** (`listRoomsWithStatus`, `getRoomDetail`) cần dữ liệu hợp đồng nên thuộc `leasing`; `facilities` chỉ CRUD cơ sở, phòng, tiện ích, phí (`src/modules/leasing/server/contracts/room-view.ts`).
- **Gán mẫu hoá đơn** cho hợp đồng/hoá đơn ghi bảng của `leasing` nên thuộc `leasing`, không thuộc `documents` (`src/modules/leasing/server/invoices/template-assignment.ts`).
- **`documents`** không biết hợp đồng hay hoá đơn: module tầng trên đăng ký loader cho nó (mục 5).

## 4. Quy tắc nghiệp vụ cần biết trước khi sửa

- **Quyền:** 7 nhóm (`src/domain/access.ts`). Có `settings` là admin, thấy mọi cơ sở. Người khác chỉ thấy cơ sở được cấp. `assertCan` ném `NotFoundError` khi ngoài phạm vi cơ sở (không lộ sự tồn tại), `ForbiddenError` khi thiếu nhóm quyền. Khách mất cơ sở dùng `NO_FACILITY` (chỉ admin thấy). Số passport/CCCD bị che (`maskId`) với người không có `tenants_contracts`.
- **Hoá đơn tháng N** (`src/modules/leasing/domain/invoice-builder.ts`): tiền phòng + phí cố định của kỳ N (trả trước); điện, nước, phí theo lần của tháng N−1 (trả sau). Có chia ngày lẻ (`proration.ts`) và hệ số kỳ.
- **Phí hợp đồng:** lưu ở `lease_fee_snapshots` (chụp giá lúc ký). Điện, nước là dòng phí gắn đúng một đồng hồ của phòng (bảng `lease_fee_meters`; mức dùng tính ở `src/modules/leasing/domain/meter-fee-usage.ts`), đơn giá lấy từ hợp đồng; không còn kiểu cũ (`lease_fees`, `feeModel`, bảng giá cơ sở `utility_rates`).
- **Hợp đồng cọc → hợp đồng thuê:** mỗi phòng tối đa 1 hợp đồng cọc `pending` và 1 hợp đồng `active` (unique index có điều kiện trong `src/db/schema/contracts.ts`).
- **Lịch sử/khôi phục hợp đồng:** mỗi lần sửa/xoá chụp bản ghi vào `contract_versions` (`server/contracts/history.ts`, `restore.ts`).
- **Ví khách** (`tenant_wallet_entries`, `leasing/server/wallet/service.ts`): số dư có dấu theo (người thuê chính, cơ sở), chỉ có tiền vào từ thu vượt (hoá đơn 10 triệu, khách đưa 15 triệu thì 5 triệu vào ví). `recordLeasePayment` không chặn thu vượt; khách dùng ví khi thu (khoản thu `method = wallet`). Sổ quỹ chỉ tính tiền thật: dòng `overpay` tính một lần, khoản `wallet` không tính. Hoá đơn thanh lý tự gạch ví, trừ ví thật khi duyệt.
- **Chuyển phòng hai bước** (`leasing/server/addenda/room-change.ts`): thanh lý hợp đồng cũ rồi tạo hợp đồng mới trong một giao dịch, gắn bằng `leases.transferFromLeaseId`. Cả hai hợp đồng bắt đầu/kết thúc đúng ngày chuyển, ngày chuyển thuộc phòng mới (hoá đơn thanh lý tính phòng cũ đến hết ngày trước, tham số `billedUntil`). Hoá đơn thanh lý có dòng "Chuyển sang hợp đồng mới" đưa tổng về 0; duyệt thì kết quả T cộng dồn sang hợp đồng mới thành điều chỉnh chờ `transfer:<mã hợp đồng cũ>`. Phụ lục `transfer` cũ vẫn đọc được, không còn tạo mới từ giao diện.
- **Ghi chéo trong một transaction:** hàm hậu tố `InTransaction` (`createAssetInTransaction`, `moveAssetsInTransaction`, `setAssetStatusInTransaction`, `startHandoverInTransaction`) nhận `tx` để module khác gọi trong cùng transaction. Giữ mẫu này khi cần ghi qua module.
- **Phòng mới có sẵn đồng hồ điện, nước:** `createRoom`/`createRoomsBulk` (facilities, tầng 2) không import meters (tầng 3); facilities mở điểm móc `registerRoomsCreatedHook(name, hook)`, chạy mọi hook trong cùng transaction tạo phòng (`hook(tx, roomIds, ngày)`), meters đăng ký `createDefaultMeters` vào đó. Hook lỗi thì phòng cũng không được tạo. Gọi service tạo phòng mà chưa nạp `src/modules/registrations.ts` (vd trong test) thì phòng không có đồng hồ; test `tests/integration/rooms-created-hook.test.ts`.
- **Dữ liệu demo:** cột `isDemo` đánh dấu dữ liệu giả của `npm run db:seed`.

## 5. Bẫy đã biết

| Bẫy | Hậu quả | Cách xử lý / trạng thái |
|---|---|---|
| Đăng ký kiểu side-effect: `registerOwnerResolver`, `registerExportOwnerResolver`, `registerDocLoader`, `registerPdfLoader`, `registerRoomsCreatedHook` chỉ chạy khi file đăng ký đã được import | Route lạnh báo "Loại tệp chưa được hỗ trợ", không xuất được giấy tờ, hoặc phòng mới không có đồng hồ điện nước | Module có `register*` phải được import trong `src/modules/registrations.ts` — `tests/unit/architecture/registrations.test.ts` kiểm |
| Font PDF dùng đường dẫn cứng `src/modules/documents/server/pdf/fonts/` ở `next.config.ts` (`outputFileTracingIncludes`) và `src/modules/documents/server/pdf/fonts.ts` | Dời thư mục mà quên: local, test vẫn xanh, **PDF trên Vercel hỏng** | Sửa cả hai chỗ; test: `tests/unit/pdf-fonts.test.ts` (bắt lệch đường dẫn hoặc glob); luôn thử "Xem PDF" trên preview |
| `cascade-delete.ts` (xoá cơ sở/phòng) ghi bảng của hợp đồng, hoá đơn… | Vi phạm luật "ghi bảng module khác" | Ngoại lệ có chủ ý vì DB không có `ON DELETE CASCADE`; không "sửa" bằng cách thêm cascade trong schema nếu chưa bàn |
| `NEXT_PUBLIC_*` đọc kiểu `process.env[name]` | Không được nhúng vào bundle trình duyệt, đăng nhập hỏng | Luôn viết literal `process.env.NEXT_PUBLIC_X` (gom ở `src/lib/env.ts`) |
| Lưu trữ: `STORAGE_DRIVER` mặc định `supabase`; thiếu biến Supabase thì rơi về **bộ nhớ trong** (tệp mất khi khởi động lại) | Tưởng đã lưu ảnh nhưng không | Kiểm biến khi chạy thật; `r2` thiếu biến thì báo lỗi |
| `unapproveInvoice` chỉ đưa hoá đơn về nháp, không mở lại hợp đồng và không đảo sổ cọc, ví | Bỏ duyệt hoá đơn thanh lý làm hợp đồng ended mà hoá đơn nháp | Hoá đơn thanh lý có dòng ví hoặc chuyển phòng bị chặn bỏ duyệt; chuyển phòng chưa duyệt thì dùng Huỷ chuyển phòng |
| Next.js 16 khác bản quen thuộc | Viết theo trí nhớ dễ sai API | Đọc `node_modules/next/dist/docs/` trước (xem `AGENTS.md`) |
| `@napi-rs/canvas`, `pdfkit` cần đóng gói đặc biệt trên Vercel | Xuất PNG/PDF hỏng trên production | Giữ `serverExternalPackages` và `outputFileTracingIncludes` trong `next.config.ts` |

## 6. Kiểm thử

- `npm test`: unit (`tests/unit`, gồm test kiến trúc) và integration (`tests/integration`) chạy với PGlite qua `createTestDb()` ở `tests/helpers/db.ts`. Không cần Docker hay Supabase. Integration gọi thẳng service với `ctx` giả.
- `npm run test:e2e`: Playwright trên môi trường có `NEXT_PUBLIC_DEMO_MODE=1`; chạy `node scripts/e2e-preflight.mjs` trước, đặt `E2E_BASE_URL`.
- Mọi PR chạy CI: định dạng, lint, typecheck, test, kiểm không sinh migration, build.

## 7. Giữ tài liệu này đúng

- PR đổi luật import, thêm module, đổi tầng: cập nhật bảng mục 1, mục 3, `CLAUDE.md` (Architecture) và `MODULE_TIERS` trong `eslint.config.mjs`.
- Phát hiện bẫy mới: thêm một dòng vào mục 5.
