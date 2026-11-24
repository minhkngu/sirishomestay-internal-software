# Thiết kế: triển khai Vercel theo hai môi trường test (`main`) và PROD (`production`)

Ngày: 24/11/2026 · Trạng thái: chờ duyệt

## 1. Vì sao

Ngày 23–24/11/2026 merge 26 PR xếp chồng (#26–#51). Vercel (gói Hobby, tài khoản `lucas-projects-5f5d0170` của người khác) build preview cho mọi lần push nhánh PR, cộng mỗi lần merge, khoảng 110 lần build trong 4 giờ. Vượt hạn mức Hobby (100 deployment/ngày, 100 build/giờ), Vercel báo "Deployment rate limited — retry in 24 hours" và production kẹt ở bản #37.

Người dùng muốn:

1. Mở PR hoặc push nhánh PR thì **Vercel không build**.
2. Merge vào `main` thì Vercel deploy; `main` là **môi trường test chính**.
3. Nhánh `production` dùng để deploy **PROD**; chỉ đưa lên PROD những gì đã test trên `main`.

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**
- Số lần build Vercel chỉ còn: một lần mỗi lần merge vào `main`, một lần mỗi lần phát hành lên `production`.
- Môi trường test dùng dữ liệu giống PROD (chép từ PROD) nhưng ở DB và bucket ảnh riêng.
- PROD chỉ nhận code đi qua `main`, và người phát hành biết chắc commit mình đưa lên là commit đã chạy trên test.
- Phần phải làm trong dashboard Vercel, GitHub, Supabase, Cloudflare được viết thành hướng dẫn gửi cho chủ tài khoản.

**Không làm**
- Không nâng gói Vercel, không dùng Custom Environments (chỉ có ở Pro).
- Không tự động hoá migration của PROD (giữ như hiện nay: chạy tay trước khi phát hành).
- Không chọn từng PR để lên PROD (cherry-pick).
- Không làm mới dữ liệu test theo lịch.

**Phản mục tiêu (làm thế này là hỏng dù "chạy được")**
- Môi trường test ghi, xoá vào DB hoặc bucket R2 của PROD.
- Merge vào `main` vẫn deploy thẳng lên PROD (xảy ra nếu chủ tài khoản chưa đổi Production Branch mà đã coi `main` là test).
- PROD chạy một tổ hợp code chưa từng chạy trên test.
- Cơ chế chặn build PR mà vẫn sinh deployment (dù bị huỷ) có thể tính vào hạn mức.

## 3. Ràng buộc

- **Người dùng không vào được dashboard Vercel, và tài khoản Supabase cũng của người khác**; người dùng không có quyền admin repo GitHub (`minhkngu/sirishomestay-internal-software` là repo cá nhân của `minhkngu`; người dùng chỉ có quyền push). Thêm secret Actions, bảo vệ nhánh chỉ chủ repo làm được.
- Gói Hobby: Production + Preview; không Custom Environments; có gán tên miền cho một nhánh preview và biến môi trường riêng cho một nhánh (tài liệu Vercel ghi "All plans, including Hobby").
- Hobby mặc định bật Vercel Authentication cho bản preview: nhân viên không có tài khoản Vercel trong team sẽ không vào được môi trường test nếu không tắt.
- Production Branch chỉ đổi được trong dashboard (Project Settings → Environments → Production → Branch Tracking). Không có khoá tương ứng trong `vercel.json`.
- Supabase Free: 2 project miễn phí/người (gộp mọi tổ chức mà người đó là Owner/Admin); project tự tạm dừng sau 1 tuần không truy cập; 500 MB DB/project; không branching, không sao lưu tự động.
- Sao lưu đêm hiện có (`.github/workflows/backup.yml`) `pg_dump` schema `public` + `auth` ra Google Drive, giữ 30 bản. Ảnh R2 không được sao lưu.
- `deleteFile` (`src/modules/platform/server/files/service.ts`) xoá object R2 thật (`DeleteObjectCommand`): test dùng chung bucket với PROD là mất ảnh thật.
- Migration chạy bằng `npm run db:migrate` (`drizzle-kit migrate`, đọc `DATABASE_URL`).

## 4. Cách làm đã cân nhắc

| | Cách | Được | Mất | Kết quả |
|---|---|---|---|---|
| 1 | `git.deploymentEnabled` trong `vercel.json` | Nhánh tắt không tạo deployment, không tốn hạn mức; làm trong repo qua PR, không cần token | Nhánh tạo trước thay đổi vẫn build tới khi rebase; Vercel deploy `main` không đợi CI trên `main` | **Chọn** |
| 2 | `ignoreCommand` | Linh hoạt (bỏ qua theo file đổi) | Mỗi push vẫn sinh deployment "đã huỷ"; tài liệu không nói nó có tính vào hạn mức không, đúng vấn đề gây kẹt | Loại |
| 3 | Tắt Vercel Git, deploy bằng GitHub Actions + Vercel CLI | Deploy khi CI xanh, migrate trước deploy | Cần token Vercel của chủ tài khoản trong secret; nhiều phần dễ hỏng; mỗi thay đổi lại phiền chủ tài khoản | Loại |

Cách đưa code lên PROD:

| | Cách | Kết quả |
|---|---|---|
| a | PR `main` → `production`, merge bằng "Create a merge commit"; lên PROD theo cả `main` tới một mốc đã test | **Chọn** (người dùng) |
| b | Cherry-pick từng PR sang `production` | Loại: `production` lệch dần khỏi `main`, PROD chạy tổ hợp chưa test chung |
| — | Nút GitHub Actions fast-forward; `git push origin main:production` | Loại: không có chỗ xem lại; đẩy tay không dấu vết |

Dữ liệu test: **làm mới khi bấm nút** (người dùng chọn theo đề xuất). Lịch đêm bị loại vì project Free không ai vào sẽ tạm dừng, lịch hỏng lúc không ai để ý; và xoá mất những gì nhân viên đang thử.

## 5. Thiết kế

### 5.1. Luồng

```
nhánh PR ──PR──► main ──(Vercel: Preview, tên miền test)──► môi trường TEST  (DB test, bucket R2 test)
   │ CI chạy          │ CI chạy, job migrate DB test
   │ Vercel: không    │
   │ build            └──PR "Phát hành" (head = main)──► production ──(Vercel: Production)──► PROD
                                  CI chạy + job kiểm nguồn                      (DB PROD, bucket R2 PROD)
```

### 5.2. Trong repo (làm được ngay, qua PR)

1. **`vercel.json`**
   ```json
   {
     "regions": ["bom1"],
     "git": { "deploymentEnabled": { "*": false, "**": false, "main": true, "production": true } }
   }
   ```
   Theo tài liệu Vercel: nhánh không khai báo mặc định `true`, nên phải có quy tắc `false` phủ mọi nhánh; nhánh khớp nhiều quy tắc mà có một quy tắc `true` thì deploy. Tên nhánh được khớp bằng glob minimatch, trong đó `*` không khớp dấu `/`. Nhánh của repo này hầu hết có `/` (`fix/…`, `refactor/…`), nên thêm `"**": false`. Thừa một quy tắc `false` thì vô hại, vì chỉ cần một quy tắc `true` là nhánh được deploy. Kiểm bằng nhánh thử (5.5). Mở rộng `tests/unit/vercel-config.test.ts` để kiểm khối `git.deploymentEnabled` này.

2. **Job CI kiểm nguồn PR vào `production`** (trong `.github/workflows/ci.yml` hoặc workflow riêng): với `pull_request` có `base.ref == 'production'`, báo đỏ nếu `head.ref != 'main'` hoặc PR từ fork. CI hiện có vẫn chạy đủ trên PR phát hành. Thêm `production` vào `on.push.branches` của CI để có trạng thái xanh/đỏ cho commit đang chạy PROD.

3. **Hiện mã commit đang chạy** (đề xuất của Claude, người dùng có thể bỏ): hiện 7 ký tự đầu `VERCEL_GIT_COMMIT_SHA` và tên môi trường (`VERCEL_ENV`: `preview` → "Test", `production` → không hiện nhãn hoặc nhãn nhỏ) ở một chỗ nhìn thấy trong app (chân sidebar hoặc trang Cài đặt). Môi trường test cần có dấu hiệu dễ thấy (ví dụ dải "Môi trường test") để nhân viên không nhầm nhập liệu thật vào test. Đọc biến ở server, truyền xuống; khi chạy local không có biến thì không hiện. Trước khi merge PR phát hành, người merge so commit cuối của PR với mã này trên trang test.

4. **Migration DB test tự động** (quyết định của Claude): job GitHub Actions chạy khi push vào `main`, chạy `npm run db:migrate` với secret `TEST_DATABASE_URL`, để test không vỡ vì quên migrate. Không chạy cho PROD. Job bỏ qua (không đỏ) khi chưa có secret, để PR này merge được trước khi chủ repo thêm secret.

5. **Workflow "Làm mới dữ liệu test"** (`workflow_dispatch`):
   - Tải bản `.dump` mới nhất trong Google Drive (dùng lại `GDRIVE_SERVICE_ACCOUNT_JSON`, `GDRIVE_FOLDER_ID` của workflow sao lưu); tuỳ chọn đầu vào: tên file cụ thể.
   - **Chốt an toàn**: dừng nếu `TEST_DATABASE_URL` trỏ cùng host/project ref với `BACKUP_DATABASE_URL` (DB PROD).
   - `pg_restore --clean --if-exists --no-owner` schema `public` + `auth` vào DB test (giống `docs/operations/backup-restore.md`).
   - Chạy migration của `main` lên DB test.
   - Đồng bộ ảnh: `rclone sync` từ bucket R2 PROD sang bucket R2 test (chỉ đọc bucket PROD).
   - `concurrency` riêng, không chạy song song với job migrate test.

6. **Tài liệu**: README (mục "Triển khai Vercel", "Kiểm thử/E2E", "Đóng góp"), `docs/architecture.md` nếu nhắc preview, và tài liệu mới `docs/operations/trien-khai.md` gồm: luồng nhánh, cách phát hành, checklist phát hành, cách làm mới dữ liệu test. Hướng dẫn cho từng chủ tài khoản nằm trong `docs/operations/trien-khai/` (5.3). E2E chuyển sang chạy local (`npm run dev` + `npm run db:seed` + `NEXT_PUBLIC_DEMO_MODE=1`), bỏ "preview Vercel của PR"; môi trường test không bật chế độ thử nên không dùng cho E2E.

### 5.3. Hướng dẫn gửi chủ tài khoản (không làm được từ repo)

**Chủ tài khoản Vercel (`lucas-projects-5f5d0170`)**
1. Project Settings → Environments → Production → Branch Tracking: đổi nhánh sang `production`. Lưu.
2. Domains: giữ tên miền PROD hiện tại cho Production. Thêm tên miền cho test (ví dụ `<tên>-test.vercel.app` hoặc tên miền con riêng), chọn Preview, Git Branch = `main`.
3. Environment Variables:
   - Production: giữ nguyên bộ biến hiện tại (DB, Supabase, R2 của PROD).
   - Preview, nhánh `main`: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` của project Supabase test; `STORAGE_DRIVER=r2`; `R2_*` trỏ bucket test; không đặt `NEXT_PUBLIC_DEMO_MODE`.
   - Kiểm biến Preview chung (không theo nhánh) hiện đang trỏ đâu; nếu trỏ PROD thì đổi hoặc xoá, vì nhánh nào lỡ deploy dạng preview cũng sẽ ghi vào PROD.
4. Deployment Protection: tắt Vercel Authentication cho Preview (hoặc chỉ để cho Production), để nhân viên vào được tên miền test bằng đăng nhập của app.
5. Sau khi PR thay đổi này merge, kiểm Deployments: nhánh PR mới không có deployment; `main` ra Preview ở tên miền test; `production` ra Production.

**Chủ repo GitHub (`minhkngu`)**
1. Tạo nhánh `production` từ commit mà PROD đang chạy lúc chuyển đổi (xem 5.4).
2. Actions secrets: `TEST_DATABASE_URL` (Session pooler hoặc Direct của project test, cho `pg_restore` và migrate); cho việc chép ảnh cần hai token R2 (một token R2 chỉ có một mức quyền cho các bucket được chọn): token chỉ đọc bucket PROD, token đọc ghi bucket test, cùng account ID và tên hai bucket (tên secret cuối do builder chốt).
3. Bảo vệ nhánh `production`: bắt buộc qua PR, bắt buộc job kiểm nguồn và CI xanh; không cho push thẳng, không cho xoá. (Tuỳ chọn) bảo vệ `main` bắt buộc CI.

**Chủ tài khoản Supabase (người khác, không phải người dùng)**
1. Kiểm số project Free đang chạy của tài khoản. Nếu đã có 2 project (giới hạn tính gộp mọi tổ chức mà họ là Owner/Admin) thì dừng, báo lại người dùng để chọn: biến project thứ hai thành test, hoặc tạm dừng/xoá một project. Hướng dẫn không tự xoá gì.
2. Tạo project Supabase test cùng tổ chức, vùng `ap-south-1` (khớp `bom1` của Vercel), đặt mật khẩu DB mạnh và lưu vào trình quản lý mật khẩu.
3. Authentication → URL Configuration: Site URL và Redirect URLs là tên miền test (lấy từ chủ Vercel, bước Domains).
4. Lấy các giá trị: chuỗi Transaction pooler (cổng 6543, cho app, theo `docs/operations/supabase.md`), chuỗi Session pooler (cổng 5432, cho `pg_restore` và migrate trong GitHub Actions), Project URL, anon key, service role key.
5. Tự dán các giá trị đó vào Vercel (Preview, nhánh `main`) và GitHub Actions secrets nếu họ có quyền; nếu không thì gửi cho chủ Vercel và chủ repo qua kênh bảo mật (trình quản lý mật khẩu chia sẻ, tin nhắn tự huỷ). Không dán vào PR, issue, commit hay nhóm chat chung.
6. Sau lần "Làm mới dữ liệu test" đầu tiên: kiểm số bản ghi (`tenants`, `rooms`, `facilities`, `auth.users`) khớp PROD, như checklist trong `docs/operations/backup-restore.md`.

**Chủ tài khoản Cloudflare R2** (chưa rõ là ai; hướng dẫn viết cho "chủ tài khoản Cloudflare")
1. Tạo bucket R2 test (riêng tư), CORS như bucket PROD (README, mục Lưu trữ tệp) nhưng `AllowedOrigins` là tên miền test.
2. Tạo ba API token: cho app test (Object Read & Write, chỉ bucket test); cho workflow chép ảnh, một token Object Read only bucket PROD và một token Object Read & Write bucket test.
3. Giao giá trị theo cùng quy tắc bảo mật như Supabase bước 5.

**Hình thức các hướng dẫn (người dùng yêu cầu)**
Chủ các tài khoản không theo dõi cuộc trao đổi này và sẽ dùng Claude để được giải thích, làm theo từng bước. Vì vậy mỗi chủ tài khoản có **một file hướng dẫn riêng, tự đủ** trong `docs/operations/trien-khai/` (`vercel.md`, `github.md`, `supabase.md`, `cloudflare.md`), cộng một file `README.md` tổng quan thứ tự phối hợp giữa các người. Mỗi file:
- Mở đầu bằng bối cảnh ngắn: app là gì, vì sao đổi, người này giữ vai trò gì, cần nhận gì từ ai và giao gì cho ai.
- Các bước đánh số, mỗi bước có: làm gì (đường dẫn menu chính xác), vì sao, kết quả mong đợi, cách kiểm đã đúng.
- Điểm dừng rõ ràng: khi nào phải dừng và hỏi người dùng (ví dụ đã đủ 2 project Supabase, thấy biến môi trường trỏ PROD ở chỗ không ngờ).
- Không chứa giá trị bí mật; chỉ ghi tên biến và nơi lấy.
- Có đoạn "Dành cho Claude" ở đầu: đọc toàn file, giải thích từng bước bằng tiếng Việt, không tự làm thao tác không đảo ngược được (xoá project, xoá biến, đổi Production Branch) khi chủ tài khoản chưa xác nhận.

**Người dùng tự làm**
1. Chạy "Làm mới dữ liệu test" lần đầu (cần quyền chạy workflow, người dùng có quyền push nên chạy được).
2. Kiểm tên miền test: đăng nhập bằng tài khoản thật, ảnh hiện, mã commit khớp `main`.

### 5.4. Thứ tự chuyển đổi

0. **Điều kiện trước (người dùng chốt):** chưa bắt đầu chuyển đổi cho tới khi người dùng merge một PR vào `main` để Vercel build lại, đưa PROD từ bản #37 lên bản mới nhất của `main` (lúc đó `main` vẫn là Production Branch). Từ #37 tới #51 không có migration mới (`git diff` thư mục `drizzle/` rỗng), nên không phải migrate DB PROD cho bước này. Chỉ làm tiếp khi deployment Production đó "Ready" (commit status "Vercel" trên GitHub xanh).
1. Chủ Supabase tạo project test, chủ Cloudflare tạo bucket R2 test và token (theo hướng dẫn riêng); chủ repo thêm secrets.
2. Chủ repo tạo nhánh `production` từ đúng commit PROD đang chạy sau bước 0 (commit có status "Vercel" xanh mới nhất trên `main`). Nhờ vậy lúc chuyển PROD không đổi code, và không có gì lên PROD mà chưa từng chạy. Vercel build `production` một lần dưới dạng Preview (Production Branch vẫn là `main`), vô hại.
3. Chủ Vercel đổi Production Branch sang `production`, đặt biến, tên miền, tắt bảo vệ preview. Redeploy bản mới nhất của `production` thành Production (nút Redeploy, hoặc push một commit vào `production` qua PR phát hành).
4. Merge PR thay đổi này vào `main` (PR này vẫn được build preview một lần vì nhánh PR mang `vercel.json` cũ). Từ đây `main` deploy ra test.
5. Chạy "Làm mới dữ liệu test", kiểm tên miền test đăng nhập được, ảnh hiện, mã commit khớp.
6. Mở PR phát hành đầu tiên `main` → `production` để PROD có thay đổi này.

Nếu bước 3 chưa làm mà bước 4 đã merge: `main` vẫn là Production, mọi thứ chạy như hiện nay, chỉ là PR không build nữa. Không hỏng gì, nhưng chưa có môi trường test.

### 5.5. Kiểm sau triển khai

- Push một nhánh thử (cả tên có `/`) sau khi merge: không có deployment trên Vercel, không có commit status "Vercel" đỏ. Người dùng không vào được dashboard, nên kiểm qua commit status trên GitHub (`gh api repos/.../commits/<sha>/statuses`) và hỏi chủ tài khoản nếu cần.
- Merge một PR vào `main`: một deployment Preview, tên miền test cập nhật, job migrate test xanh.
- PR phát hành: job kiểm nguồn xanh; PR từ nhánh khác `main` vào `production` thì đỏ.
- Merge PR phát hành: một deployment Production.

### 5.6. Quy trình phát hành (ghi vào tài liệu)

1. Test trên tên miền test; ghi nhận mã commit đang chạy.
2. Nếu PROD cần migration: chạy `npm run db:migrate` với `DATABASE_URL` PROD (như hiện nay), migration phải tương thích với code PROD đang chạy.
3. Mở PR `main` → `production` tiêu đề "Phát hành YYYY-MM-DD", mô tả liệt kê PR đi kèm.
4. Trước khi merge: commit cuối của PR khớp mã commit trên trang test; CI xanh. Merge bằng "Create a merge commit" (không squash, không rebase).
5. Kiểm PROD theo mục G6 cũ (Nhắc việc, Hợp đồng, Hoá đơn, Mẫu giấy tờ, Tài sản, "Xem PDF").
6. Hỏng: mở PR revert trên `main`, test, rồi phát hành lại; khẩn cấp thì chủ Vercel "Instant Rollback" về bản Production trước.

## 6. Để lại cho builder

- Cú pháp glob trong `deploymentEnabled` (`*` hay `**`) và có cần liệt kê thêm không; kiểm với tài liệu và bằng một nhánh thử.
- Chỗ hiện mã commit và dải "Môi trường test" (theo `docs/front-end-design.md`), thuộc module nào (dự kiến `platform`/layout `(app)`).
- Tên secret, tên workflow, tên job; cách lấy bản dump mới nhất bằng rclone.
- Xử lý cảnh báo `pg_restore` với schema `auth` khi ghi đè project Supabase đang có (khác với khôi phục vào project mới trong tài liệu sao lưu); nếu `--clean` vào `auth` không được, đổi cách (ví dụ xoá bảng `public` rồi restore, `auth` chỉ `TRUNCATE` + nạp dữ liệu).
- Test đơn vị cho `vercel.json`; job kiểm nguồn viết đơn giản bằng biểu thức `if` của Actions.

## 7. Câu hỏi còn mở

- Tài khoản Supabase đã có đủ 2 project chưa: chưa biết; hướng dẫn Supabase bước 1 xử lý cả hai trường hợp (dừng và hỏi người dùng).
- Chủ tài khoản Cloudflare R2: chưa biết; hướng dẫn viết chung cho "chủ tài khoản Cloudflare".
- Có ai đang dùng link preview chế độ thử để xem app: chưa biết; thiết kế bỏ chế độ này trên mạng (chỉ còn chạy local).
