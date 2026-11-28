# Siris — Web quản lý khách thuê dài hạn

Web nội bộ cho nhân viên Siris quản lý cơ sở, phòng, khách thuê, hợp đồng, bàn giao, điện nước, phí, hoá đơn, tài sản; nhắc việc (visa), nhập dữ liệu từ Excel, soạn mẫu giấy tờ và xuất PDF/Word ngay trong app.

Công nghệ: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 + shadcn/ui, Drizzle ORM, Supabase (Postgres + Auth), Cloudflare R2 hoặc Supabase Storage, Vercel.

## Tính năng

**Nền tảng:** cơ sở, phòng, khách thuê, hợp đồng, bàn giao, tài sản, vật tư, phụ lục, sự cố, nhắc việc (visa), nhập từ Excel. Phân quyền theo nhóm quyền và cơ sở. Hợp đồng, phụ lục, biên bản soạn trong app từ mẫu, xuất PDF và Word.

**Hoá đơn**
- Tạo hàng loạt theo tháng, hoặc **hoá đơn lẻ** (Toà → Phòng → Tháng) bằng bản xem trước chưa lưu, chỉ tạo khi bấm Lưu. Tính theo công thức: tiền phòng và phí cố định tháng N (trả trước) + điện, nước, phí theo đồng hồ tháng N−1 (trả sau). Hợp đồng đã lập tới kỳ nào thì báo, không tạo lại.
- Hoá đơn tháng cũ và hoá đơn thêm cho kỳ đã có (không cộng tiền phòng); dòng tiền cọc còn thiếu ở hoá đơn đầu.
- Kỳ hoá đơn đồng bộ theo thời gian dòng tiền phòng đã chỉnh, nên hoá đơn kế tiếp nối đúng. Hệ số theo ngày hiện rõ ở từng dòng và tính lại khi đổi kỳ.
- Thêm phí ngoài từ hộp thoại chọn phí dùng chung với form hợp đồng; thuế theo %; hạn thanh toán theo quy tắc ("ngày X của tháng hoá đơn" mặc định ngày 5) và sửa được.
- Dòng tiền phòng, phí hợp đồng không sửa mô tả, đơn giá hoặc xoá tại hoá đơn; chỉ sửa hệ số, chỉ số hoặc số lượng theo kỳ. Mô tả dòng tiền phòng chỉ ghi "Tiền phòng", thời gian nằm ở cột Thời gian. Kỳ từ–đến chọn tay tính theo tháng tròn từ ngày bắt đầu, cùng công thức ở bản xem trước và khi lưu.
- Tổng hoá đơn ghi rõ ai trả ai: dương là "Khách phải thanh toán", âm là "Siris hoàn trả khách" (ô đầu trang hoá đơn, ô tổng và PDF; mẫu mặc định có thêm các trường kết luận thanh toán).
- Phí theo số người ở thêm vào hoá đơn lấy số người ở hiện có của hợp đồng làm số lượng ban đầu; hoá đơn đã có không tự đổi khi hợp đồng đổi người ở.
- **Hoá đơn thanh lý**: mã dạng `<cơ sở>-TL-<YYYYMM>-<số>`. Dòng hoàn tiền phòng và phí đã trả trước chỉ có khi thật sự có tiền hoàn. Cọc ghi rõ "Hoàn cọc cho khách (trừ vào hoá đơn)" và "Mất cọc (Siris giữ, không hoàn khách)". Dòng phạt do thanh lý tạo chỉ thuộc hoá đơn đó (bỏ dòng hoặc hoàn tác thì xoá luôn). Dòng điện nước ghi số đầu, số cuối và in vào mô tả trên PDF.
- Thu tiền hoá đơn có dòng tiền cọc: tiền thu trả cọc trước, phần cọc thu đủ thì dòng thu cọc chờ trong sổ cọc chuyển Đã xong. Hoá đơn đã thu từ trước khi có cách này chạy `npm run db:sync-invoice-deposits` một lần.
- Xem PDF, tải ảnh hoá đơn ngay trong popup. Danh sách xếp theo ngày tạo mới nhất; chọn nhiều hoá đơn thì thanh nổi ở đáy có Duyệt nháp, Xoá nháp (xoá có hỏi lại). Duyệt, bỏ duyệt và lưu không hỏi xác nhận.
- **Mẫu hoá đơn theo loại** (trang Mẫu giấy tờ): hoá đơn thường (tháng, kỳ đầu, lập tay), thanh lý, chuyển phòng; mỗi loại có mẫu và mẫu mặc định riêng, xem thử bằng dữ liệu của loại đó. Hoá đơn dùng mẫu chọn riêng, rồi mẫu của hợp đồng (cùng loại), rồi mặc định của loại, rồi mặc định hoá đơn thường. "Khôi phục mẫu mặc định" tạo đủ các mẫu còn thiếu.

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
5. Một đồng hồ có thể có nhiều lần chốt; số đầu của lần sau lấy số cuối của lần chốt gần nhất theo ngày (cùng ngày thì số lớn hơn). Chỉ số ban đầu khi tạo hợp đồng mới không bị so với các lần chốt trước.
6. **Chốt thanh lý** là một lần chốt loại riêng, có nhãn "chốt thanh lý" ở trang Chỉ số; số đầu mặc định là lần chốt gần nhất và sửa được, hiện 3 lần chốt gần nhất để tham khảo (số đầu đổi thì tô đỏ). Không ghi đè chỉ số đầu hợp đồng, hoàn tác thanh lý xoá lần chốt này.

**Chuyển phòng và ví khách**
- Chuyển phòng hai bước trong một popup: thanh lý hợp đồng phòng cũ (hoá đơn thanh lý nháp để xem, sửa trước khi duyệt) và tạo hợp đồng mới cho phòng mới. Chặn khi hợp đồng cũ còn hoá đơn nháp hoặc còn nợ; đồng hồ phòng mới chọn ngay trong popup. Còn nợ hay dư của hợp đồng cũ chuyển sang hoá đơn đầu của hợp đồng mới; khoản chuyển tính vào cọc đã thu của hợp đồng mới.
- Mỗi khách một ví dùng được ở mọi cơ sở (khối "Ví khách" ở trang khách và hợp đồng). Tiền dư (thu thừa, chuyển phòng dư, hoàn thu nhầm) vào ví; ví trừ vào hoá đơn hoặc hoàn lại khách. Gỡ khoản thu chọn chuyển vào ví, hoàn khách hoặc nhập nhầm. Chi tiết quy tắc: [docs/architecture.md](docs/architecture.md).

**Hợp đồng:** sửa người ở ngay trong popup sửa hợp đồng, không tạo phụ lục; sổ cọc trong popup sửa chỉ xem; phụ lục có nút Xem trước (popup PDF); ngày thanh lý không bị ràng buộc với ngày bắt đầu; form tạo và popup sửa dùng chung khối phí; phí theo đồng hồ chọn đồng hồ của phòng và điền chỉ số ban đầu, sửa được; biên bản bàn giao không còn chỉ số đồng hồ. Loại phí: bỏ "Nhập tay"; xoá được trừ khi đang dùng trong hợp đồng còn hiệu lực (hoặc gắn đồng hồ), đơn vị tính sửa tên, xoá được ở Cài đặt, phí đã lưu trữ xoá được.

**Thu chi** (`/cashbook`): sổ chung các khoản thực thu, thực chi (thu tiền thuê, thu và hoàn cọc, chi sửa chữa, điện nước, lương, khác) với dải tổng quan Thu, Chi, Chênh lệch, Cọc đang giữ; lọc theo tháng, cơ sở. Mọi khoản đều sửa, xoá được và có nhật ký; sửa thu tiền thuê không vượt phần còn nợ. Khoản thu hoá đơn có dòng cọc hiện thành hai dòng riêng: Thu cọc và Thu tiền thuê. Khoản chờ thu không hiện; trừ cọc, mất cọc, dùng ví và gộp vào thanh lý không tính vào thu chi.

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

   Mở http://localhost:3000 và đăng nhập. Đặt `NEXT_PUBLIC_DEMO_MODE=1` và `DEMO_PASSWORD` để thấy khối "Đăng nhập nhanh bằng tài khoản mẫu" (Admin, Lan, Minh, Hùng, Vy).

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
    registrations.ts      đăng ký resolver/loader/hook (tải tệp, xuất giấy tờ, đồng hồ mặc định của phòng)
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
| 2 | `documents` | mẫu giấy tờ, mẫu hoá đơn, xem sẵn mẫu, dựng PDF/Word/PNG |
| 3 | `assets` | tài sản, kho, chuyển tài sản |
| 3 | `meters` | đồng hồ (mỗi phòng có sẵn điện, nước), loại đồng hồ, chỉ số và lịch sử chỉ số |
| 4 | `leasing` | cọc, hợp đồng, phụ lục, bàn giao, sổ cọc, phí phát sinh, hoá đơn (hàng loạt, hoá đơn lẻ, hoá đơn đầu), thu tiền, sự cố |
| 5 | `import`, `dashboard`, `cashbook` | nhập Excel; nhắc việc; Thu chi (sổ thực thu, thực chi) |

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
| `npm run db:regen` | sinh lại toàn bộ migration từ schema, **xoá thư mục `drizzle/`**; chỉ dùng khi chưa triển khai ở đâu |
| `npm run db:ensure-utility-fees` | bảo đảm loại phí điện, nước có sẵn |
| `npm run test:e2e` / `test:perf` | Playwright (cần `E2E_BASE_URL`) / đo tốc độ chuyển trang |
| `npm run db:sync-invoice-deposits` | đồng bộ sổ cọc với các hoá đơn đã thu có dòng cọc (chạy lại an toàn) |

## Kiểm thử

```bash
npm test          # Vitest + PGlite (Postgres nhúng, không cần Docker): unit, integration, kiến trúc
npm run lint
npm run build
```

Bố cục: `tests/unit` (quy tắc thuần ở `src/domain` và `src/modules/<mảng>/domain`, test kiến trúc ở `tests/unit/architecture`), `tests/integration` (service với PGlite), `tests/e2e` (Playwright). Chỉ chạy bộ test khi chuẩn bị mở PR hoặc khi web báo lỗi.

| Chức năng | Unit | Integration | E2E |
|---|---|---|---|
| Hoá đơn: tính, kỳ, hệ số, hạn | `domain/billing`, `domain/invoice-rent-period`, `domain/due-date`, `domain/invoice-coefficient` | `invoices`, `invoice-single`, `invoice-backfill`, `invoice-due-date`, `invoice-line-coefficient`, `invoice-unapprove` | `invoices` |
| Chỉ số: tính tiêu thụ | `domain/meter-fee-usage`, `domain/meters-monthly` | `meters`, `meter-backfill` | `chi-so` |
| Chỉ số trong hoá đơn, hoá đơn đầu giữ số riêng | `domain/invoice-builder` | `invoice-meter-edit` (số riêng, chỉ số ban đầu ghi về bảng chỉ số, menu liệt kê mọi lần chốt, lưu không báo lỗi dòng hợp đồng) | `invoices` |
| Sửa phí hợp đồng, chỉ số ban đầu | — | `contract-edit-delete` (không ràng buộc với lần chốt, migration `0043`) | `contract-edit-fees` |
| Thu chi | `domain/cashbook` | `cashbook` (nguồn, hướng, cọc, quyền, sửa, xoá, nhật ký), `lease-payment` | `cashbook` |
| Loại phí | — | `fees` | — |
| Chuyển phòng, ví khách | `domain/transfer-line` | `room-change`, `wallet`, `addenda`, `customer-lifecycle` (vòng đời khách từ cọc đến thanh lý) | `addenda` |
| Mẫu hoá đơn theo loại | `invoice-template` | `invoice-html-templates`, `invoice-template-preview`, `invoice-templates` | `invoice-templates` |

End-to-end chạy trên một môi trường thử có `NEXT_PUBLIC_DEMO_MODE=1` và dữ liệu mẫu (bản preview Vercel, hoặc `NEXT_PUBLIC_DEMO_MODE=1 npm run dev` sau `npm run db:seed`). Test tạo thêm dữ liệu ở môi trường đó:

```bash
node scripts/e2e-preflight.mjs
E2E_BASE_URL=https://<preview> npm run test:e2e   # hoặc http://localhost:3000
```

## Đóng góp

- Không commit thẳng lên `main`. Mỗi thay đổi một nhánh, một PR.
- CI (`.github/workflows/ci.yml`) chạy định dạng, lint, typecheck, test, kiểm migration, build trên mỗi PR; PR chỉ merge khi xanh.
- Commit theo Conventional Commits, viết tiếng Việt: `feat:` `fix:` `docs:` `perf:` `refactor:` `test:` `chore:` `ci:`.
- Quy tắc giao diện: [docs/front-end-design.md](docs/front-end-design.md).
- Vận hành: [docs/operations/](docs/operations/) (Supabase, sao lưu, tốc độ); checklist review: [docs/review/checklist.md](docs/review/checklist.md).
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
