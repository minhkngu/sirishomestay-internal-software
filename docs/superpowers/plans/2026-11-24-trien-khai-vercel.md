# Triển khai Vercel hai môi trường test (`main`) và PROD (`production`) — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nhánh PR không còn build trên Vercel; `main` deploy ra môi trường test (DB và bucket ảnh riêng, dữ liệu chép từ PROD); `production` deploy PROD qua PR phát hành từ `main`.

**Architecture:** Chặn build bằng `git.deploymentEnabled` trong `vercel.json`. GitHub Actions lo phần còn lại: kiểm nguồn PR phát hành, migrate DB test, làm mới dữ liệu test từ bản sao lưu. App hiện dải "Môi trường test" kèm mã commit khi chạy dạng Preview. Phần dashboard (Vercel, GitHub, Supabase, Cloudflare) do chủ các tài khoản làm theo các file hướng dẫn trong `docs/operations/trien-khai/`.

**Tech Stack:** Vercel (Hobby), GitHub Actions, Supabase Postgres (`pg_restore` 17), rclone (Google Drive, Cloudflare R2), Next.js 16, Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-11-24-trien-khai-vercel-design.md`

## Global Constraints

- Mọi chuỗi giao diện, comment, commit, tài liệu viết tiếng Việt; commit theo Conventional Commits, tiêu đề ≤ 72 ký tự (hook ai-rules chặn dài hơn), kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Quy tắc repo: **chỉ chạy test, lint, build ở Task 7** (lúc chuẩn bị PR), không chạy sau mỗi task; mỗi task vẫn viết hoặc cập nhật test liên quan.
- Không commit lên `main`, không force-push, không `--no-verify`; không đọc `.env*` có giá trị thật (chỉ `.env.example`).
- Không thêm dependency npm. Công cụ ngoài (pg_restore, rclone) chỉ cài trong runner GitHub Actions, theo cách `.github/workflows/backup.yml` đang làm.
- Tên nhánh: `main` (test), `production` (PROD). Vùng: Vercel `bom1`, Supabase `ap-south-1`.
- `vercel.json` đúng: `{ "regions": ["bom1"], "git": { "deploymentEnabled": { "*": false, "**": false, "main": true, "production": true } } }`.
- Tên secret GitHub Actions (dùng đúng các tên này ở mọi workflow và tài liệu): `TEST_DATABASE_URL` (Session pooler cổng 5432 của project test), `BACKUP_DATABASE_URL` (đã có, DB PROD), `GDRIVE_SERVICE_ACCOUNT_JSON`, `GDRIVE_FOLDER_ID` (đã có), `R2_ACCOUNT_ID`, `R2_PROD_BUCKET`, `R2_PROD_READ_ACCESS_KEY_ID`, `R2_PROD_READ_SECRET_ACCESS_KEY`, `R2_TEST_BUCKET`, `R2_TEST_WRITE_ACCESS_KEY_ID`, `R2_TEST_WRITE_SECRET_ACCESS_KEY`.
- Hai workflow chạm DB test dùng chung `concurrency: { group: test-db, cancel-in-progress: false }`.
- Không ghi giá trị bí mật vào code, tài liệu, log (`::add-mask::` không cần vì secret đã tự che, nhưng không `echo` chuỗi kết nối).
- Worktree chưa có `node_modules`: chạy `npm ci` trước Task 7.

## Review Focus

1. `TEST_DATABASE_URL` bị đặt nhầm thành chuỗi của DB PROD (cùng project ref, khác dạng: pooler và direct) → workflow phải dừng trước mọi lệnh ghi. Test: Task 4 `supabase-ref.test.ts` (pooler vs direct cùng ref).
2. Nhánh có dấu `/` (`fix/abc`, `refactor/x/y`) vẫn build trên Vercel → phải bị tắt. Test: Task 1 kiểm `**` có mặt và là `false`; kiểm thật sau merge (Task 6 checklist).
3. Bản dump cũ (trước khi sao lưu có schema `drizzle`) được dùng để làm mới → migrate chạy lại từ đầu, hỏng DB test → workflow dừng với lời nhắn chạy sao lưu tay trước. Kiểm ở Task 5 bước `pg_restore -l`.
4. Commit vào `main` khi chưa có secret test (trước khi chủ repo kịp thêm) → job migrate test không được đỏ, chỉ ghi chú và bỏ qua. Kiểm ở Task 4.
5. App chạy local hoặc PROD vẫn hiện dải "Môi trường test" → chỉ hiện khi `VERCEL_ENV === 'preview'`. Test: Task 3 `deployment.test.ts` (không có biến, `production`, `development`).

---

## File Structure

| File | Việc |
|---|---|
| `vercel.json` | Sửa: thêm `git.deploymentEnabled` |
| `tests/unit/vercel-config.test.ts` | Sửa: kiểm khối mới |
| `.github/workflows/ci.yml` | Sửa: push `production`; job `nguon-phat-hanh` |
| `src/lib/deployment.ts` | Mới: đọc `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` |
| `tests/unit/lib/deployment.test.ts` | Mới |
| `src/components/app-shell/env-banner.tsx` | Mới: dải "Môi trường test" |
| `src/components/app-shell/app-shell.tsx`, `src/app/(app)/layout.tsx`, `src/app/login/page.tsx` | Sửa: truyền và hiện dải |
| `scripts/ops/supabase-ref.ts` | Mới: hàm thuần tách project ref, chốt test ≠ PROD |
| `scripts/ops/assert-test-db.ts` | Mới: CLI gọi chốt, đọc env |
| `tests/unit/scripts/supabase-ref.test.ts` | Mới |
| `.github/workflows/migrate-test.yml` | Mới |
| `.github/workflows/backup.yml` | Sửa: dump thêm `--schema=drizzle` |
| `.github/workflows/refresh-test-data.yml` | Mới |
| `docs/operations/trien-khai/{README,vercel,github,supabase,cloudflare}.md` | Mới: hướng dẫn cho chủ từng tài khoản |
| `README.md`, `docs/architecture.md`, `docs/operations/backup-restore.md` | Sửa |

---

### Task 1: Chặn build Vercel trên nhánh PR

**Files:**
- Modify: `vercel.json`
- Modify: `tests/unit/vercel-config.test.ts`

**Interfaces:** Produces: `vercel.json` đúng giá trị ở Global Constraints.

- [ ] **Step 1: Thêm test** vào `tests/unit/vercel-config.test.ts` (giữ test `regions`):

```ts
it('chỉ main và production được Vercel deploy', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  expect(config.git.deploymentEnabled).toEqual({ '*': false, '**': false, main: true, production: true })
})
```

- [ ] **Step 2: Sửa `vercel.json`** thành đúng giá trị ở Global Constraints (định dạng theo Prettier của repo).

- [ ] **Step 3: Commit**

```bash
git add vercel.json tests/unit/vercel-config.test.ts
git commit -m "ci: chỉ deploy Vercel cho main và production"
```

### Task 2: CI cho nhánh `production` và kiểm nguồn PR phát hành

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Thêm `production`** vào `on.push.branches` (`[main, production]`).

- [ ] **Step 2: Thêm job `nguon-phat-hanh`** (tên hiển thị `Nguồn PR phát hành`) chạy song song với `check`:
  - `if: github.event_name == 'pull_request' && github.base_ref == 'production'`
  - Một bước shell: nếu `github.head_ref != 'main'` hoặc `github.event.pull_request.head.repo.full_name != github.repository` thì `echo "::error::PR vào production chỉ được mở từ nhánh main của repo này"` và `exit 1`; ngược lại in "Nguồn hợp lệ: main".
  - Truyền giá trị qua `env:` rồi dùng biến shell, không nội suy `${{ }}` thẳng vào script (tránh chèn lệnh qua tên nhánh).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: kiểm PR vào production phải từ main"
```

### Task 3: Dải "Môi trường test" kèm mã commit

**Files:**
- Create: `src/lib/deployment.ts`, `src/components/app-shell/env-banner.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/components/app-shell/app-shell.tsx`, `src/app/login/page.tsx`
- Test: `tests/unit/lib/deployment.test.ts`

**Interfaces:**
- Produces: `export type DeploymentInfo = { isTest: boolean; commit: string | null }` và `export function getDeploymentInfo(env: Record<string, string | undefined> = process.env): DeploymentInfo` trong `src/lib/deployment.ts`; `export function EnvBanner({ info }: { info: DeploymentInfo })` trong `env-banner.tsx` (trả `null` khi `!info.isTest`); `AppShell` thêm prop `deployment: DeploymentInfo`.

- [ ] **Step 1: Viết test** `tests/unit/lib/deployment.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getDeploymentInfo } from '@/lib/deployment'

describe('getDeploymentInfo', () => {
  it('preview là môi trường test, lấy 7 ký tự commit', () => {
    expect(getDeploymentInfo({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' })).toEqual({ isTest: true, commit: 'abcdef1' })
  })
  it('preview thiếu SHA vẫn là test, commit null', () => {
    expect(getDeploymentInfo({ VERCEL_ENV: 'preview' })).toEqual({ isTest: true, commit: null })
  })
  it.each([{}, { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' }, { VERCEL_ENV: 'development' }])(
    'không phải test: %o',
    (env) => expect(getDeploymentInfo(env)).toEqual({ isTest: false, commit: null }),
  )
})
```

- [ ] **Step 2: Viết `getDeploymentInfo`** — `isTest = env.VERCEL_ENV === 'preview'`; `commit` = 7 ký tự đầu SHA chỉ khi `isTest`, rỗng thì `null`. Comment ngắn: biến hệ thống Vercel, chỉ đọc ở server.

- [ ] **Step 3: Viết `EnvBanner`** (`'use client'` không cần; component thuần, dùng được ở cả server và client). Dải ngang toàn chiều rộng, không sticky, nằm trên Topbar: nền vàng nhạt, chữ tối, border dưới, chữ 13px, căn giữa; nội dung: `Môi trường test — dữ liệu chép từ PROD, thay đổi ở đây không ảnh hưởng dữ liệu thật` và, khi có `commit`, ` · commit <code>{commit}</code>` (`tabular-nums`/mono). Theo `docs/front-end-design.md`: không gradient, không shadow, không icon trong ô màu.

- [ ] **Step 4: Nối vào app** — `src/app/(app)/layout.tsx` gọi `getDeploymentInfo()` và truyền `deployment` vào `AppShell`; `AppShell` hiện `<EnvBanner info={deployment} />` ngay trên `<Topbar>`. `src/app/login/page.tsx` hiện `<EnvBanner info={getDeploymentInfo()} />` đầu `<main>` (đặt ngoài khối căn giữa, ví dụ `absolute inset-x-0 top-0`). Không import `src/modules/*` vào `src/lib/deployment.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deployment.ts src/components/app-shell tests/unit/lib/deployment.test.ts "src/app/(app)/layout.tsx" src/app/login/page.tsx
git commit -m "feat: hiện dải môi trường test kèm mã commit"
```

### Task 4: Chốt an toàn DB test và job migrate test

**Files:**
- Create: `scripts/ops/supabase-ref.ts`, `scripts/ops/assert-test-db.ts`, `.github/workflows/migrate-test.yml`
- Test: `tests/unit/scripts/supabase-ref.test.ts`

**Interfaces:**
- Produces: trong `scripts/ops/supabase-ref.ts`: `export function supabaseProjectRef(url: string): string | null` và `export function assertTestDbIsNotProd(testUrl: string, prodUrl: string): void` (ném `Error` tiếng Việt). CLI `npx tsx scripts/ops/assert-test-db.ts` đọc `TEST_DATABASE_URL`, `PROD_DATABASE_URL`, in lỗi và `process.exit(1)` khi chốt ném, in `DB test hợp lệ (project khác PROD)` khi qua. Task 5 dùng lại CLI này.

- [ ] **Step 1: Viết test** `tests/unit/scripts/supabase-ref.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assertTestDbIsNotProd, supabaseProjectRef } from '../../../scripts/ops/supabase-ref'

const pooler = (ref: string, port = 6543) => `postgres://postgres.${ref}:pw@aws-1-ap-south-1.pooler.supabase.com:${port}/postgres`
const direct = (ref: string) => `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres`

describe('supabaseProjectRef', () => {
  it('đọc ref từ user của pooler', () => expect(supabaseProjectRef(pooler('abcprod'))).toBe('abcprod'))
  it('đọc ref từ host direct', () => expect(supabaseProjectRef(direct('abcprod'))).toBe('abcprod'))
  it('không phải Supabase thì null', () => expect(supabaseProjectRef('postgres://ci:ci@localhost:5432/ci')).toBeNull())
  it('chuỗi hỏng thì null', () => expect(supabaseProjectRef('khong-phai-url')).toBeNull())
})

describe('assertTestDbIsNotProd', () => {
  it('khác project thì qua', () => expect(() => assertTestDbIsNotProd(pooler('abctest', 5432), pooler('abcprod'))).not.toThrow())
  it('cùng project khác dạng chuỗi thì chặn', () => expect(() => assertTestDbIsNotProd(direct('abcprod'), pooler('abcprod'))).toThrow(/trùng/))
  it('không nhận ra project test thì chặn', () => expect(() => assertTestDbIsNotProd('postgres://x@localhost/x', pooler('abcprod'))).toThrow(/không nhận ra/))
  it('không nhận ra project PROD thì chặn', () => expect(() => assertTestDbIsNotProd(pooler('abctest'), '')).toThrow(/không nhận ra/))
})
```

- [ ] **Step 2: Viết hai hàm** trong `supabase-ref.ts` bằng `new URL()` (bắt lỗi trả `null`): user dạng `postgres.<ref>` → `<ref>`; không thì host khớp `/^db\.([a-z0-9]+)\.supabase\.co$/` → ref; còn lại `null`. Thông điệp lỗi: `Không nhận ra project Supabase của DB test` / `... của DB PROD`; `TEST_DATABASE_URL trùng project với DB PROD — dừng để không ghi đè dữ liệu thật`.

- [ ] **Step 3: Viết CLI** `assert-test-db.ts` (gọi hàm trên, không in chuỗi kết nối).

- [ ] **Step 4: Viết `.github/workflows/migrate-test.yml`** (tên `Migrate DB test`):
  - `on: push: branches: [main], paths: ['drizzle/**']` và `workflow_dispatch`; `permissions: contents: read`; concurrency `test-db` như Global Constraints.
  - Bước `check` (id `check`): nếu `TEST_DATABASE_URL` rỗng → `echo "::notice::Chưa có secret TEST_DATABASE_URL, bỏ qua"` và `ok=false` vào `$GITHUB_OUTPUT`; ngược lại `ok=true`.
  - Các bước sau `if: steps.check.outputs.ok == 'true'`: checkout, setup-node (`.nvmrc`, cache npm), `npm ci`, `npx tsx scripts/ops/assert-test-db.ts` (env `TEST_DATABASE_URL`, `PROD_DATABASE_URL: ${{ secrets.BACKUP_DATABASE_URL }}`), `npm run db:migrate` với `DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops tests/unit/scripts .github/workflows/migrate-test.yml
git commit -m "ci: tự migrate DB test khi main có migration mới"
```

### Task 5: Workflow làm mới dữ liệu test, sao lưu thêm schema `drizzle`

**Files:**
- Modify: `.github/workflows/backup.yml`, `docs/operations/backup-restore.md`
- Create: `.github/workflows/refresh-test-data.yml`

**Interfaces:** Consumes: CLI `scripts/ops/assert-test-db.ts` (Task 4); secret names ở Global Constraints.

- [ ] **Step 1: `backup.yml`** — thêm `--schema=drizzle` vào lệnh `pg_dump`, sửa tên bước thành `pg_dump (schema public + auth + drizzle)`. `backup-restore.md`: câu mở đầu ghi ba schema, lý do: `drizzle.__drizzle_migrations` cho biết migration nào đã chạy; thiếu nó thì `npm run db:migrate` sau khi khôi phục sẽ chạy lại từ đầu.

- [ ] **Step 2: Viết `refresh-test-data.yml`** (tên `Làm mới dữ liệu test`), `on: workflow_dispatch` với input `dump` (không bắt buộc, tên file `siris-backup-YYYY-MM-DD.dump`; trống = mới nhất), `timeout-minutes: 30`, concurrency `test-db`. Các bước theo thứ tự, mỗi bước `set -euo pipefail`:
  1. Checkout `main`, setup-node, `npm ci`.
  2. Chốt: `npx tsx scripts/ops/assert-test-db.ts` (như Task 4). Thất bại thì dừng toàn bộ.
  3. Cài postgresql-client 17 và rclone (chép nguyên khối từ `backup.yml`).
  4. Tải dump: rclone remote `drive` cấu hình bằng env như `backup.yml`; tên file = input hoặc `rclone lsf drive: --files-only --include 'siris-backup-*.dump' | sort | tail -n 1`; rỗng thì `::error::` và dừng; `rclone copyto "drive:$FILE" dump.bin`.
  5. Kiểm dump có schema `drizzle`: `pg_restore -l dump.bin | grep -q 'SCHEMA - drizzle'`; không có thì `::error::Bản sao lưu chưa có schema drizzle. Chạy tay workflow "Sao lưu cơ sở dữ liệu" rồi chạy lại.` và dừng.
  6. Khôi phục tài khoản **trước** (vì `TRUNCATE ... CASCADE` có thể xoá cả bảng `public` có khoá ngoại tới `auth.users`): `psql -v ON_ERROR_STOP=1 -c 'TRUNCATE auth.users CASCADE'`, rồi `pg_restore --data-only --no-owner --no-privileges --schema=auth --table=users --table=identities -d "$TEST_DATABASE_URL" dump.bin`. Comment: Supabase không cho `postgres` xoá/tạo lại bảng của schema `auth`, nên chỉ thay dữ liệu hai bảng này. Nếu lần chạy thật đầu tiên báo lỗi quyền ở bước này: dừng, báo người dùng kèm log, không thử `--clean` vào `auth`.
  7. Khôi phục `public` và `drizzle`: `pg_restore --clean --if-exists --no-owner --no-privileges --schema=public --schema=drizzle -d "$TEST_DATABASE_URL" dump.bin`.
  8. Migrate: `npm run db:migrate` với `DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}`.
  9. Chép ảnh: hai remote rclone qua env `RCLONE_CONFIG_R2PROD_*` và `RCLONE_CONFIG_R2TEST_*` (`TYPE=s3`, `PROVIDER=Cloudflare`, `ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, key tương ứng, `NO_CHECK_BUCKET=true`); `rclone sync "r2prod:$R2_PROD_BUCKET" "r2test:$R2_TEST_BUCKET" --checksum --transfers 8`; `R2_PROD_BUCKET == R2_TEST_BUCKET` thì `::error::` và dừng trước khi sync.
  10. In tóm tắt vào `$GITHUB_STEP_SUMMARY`: tên dump, số dòng `tenants`, `rooms`, `facilities`, `auth.users` trên DB test (một lệnh `psql -At`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backup.yml .github/workflows/refresh-test-data.yml docs/operations/backup-restore.md
git commit -m "ci: workflow làm mới dữ liệu test từ bản sao lưu PROD"
```

### Task 6: Tài liệu và hướng dẫn cho chủ các tài khoản

**Files:**
- Create: `docs/operations/trien-khai/README.md`, `vercel.md`, `github.md`, `supabase.md`, `cloudflare.md`
- Modify: `README.md` (mục "Kiểm thử" đoạn E2E, "Đóng góp", "Triển khai Vercel"), `docs/architecture.md` (bẫy font PDF: "luôn thử Xem PDF trên preview" → "trên môi trường test"; mục 6 Kiểm thử: E2E chạy local với dữ liệu mẫu)

Nội dung lấy từ spec mục 5.3, 5.4, 5.5, 5.6; không chép lại ở đây. Yêu cầu bắt buộc:

- [ ] **Step 1: `trien-khai/README.md`** — luồng nhánh (sơ đồ spec 5.1), bảng "ai làm gì, nhận gì từ ai, giao gì cho ai" (Vercel, chủ repo, Supabase, Cloudflare, người dùng), thứ tự chuyển đổi spec 5.4 kể cả bước 0, quy trình phát hành spec 5.6, cách chạy "Làm mới dữ liệu test", checklist kiểm sau triển khai spec 5.5 (kiểm commit status bằng `gh api repos/minhkngu/sirishomestay-internal-software/commits/<sha>/statuses`).

- [ ] **Step 2: Bốn file cho chủ tài khoản**, mỗi file tự đủ, theo khuôn spec mục "Hình thức các hướng dẫn": đoạn "Dành cho Claude" đầu file; bối cảnh; bước đánh số (làm gì với đường dẫn menu, vì sao, kết quả mong đợi, cách kiểm); điểm dừng; chỉ tên biến, không giá trị. Riêng:
  - `vercel.md`: đổi Production Branch là thao tác chỉ làm sau khi nhánh `production` đã có (chủ repo xác nhận); tắt Vercel Authentication cho Preview; liệt kê biến Preview nhánh `main` (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`), không đặt `NEXT_PUBLIC_DEMO_MODE`; kiểm biến Preview chung có trỏ PROD không; "System Environment Variables" phải bật (cho `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`).
  - `github.md`: tạo nhánh `production` từ commit có status "Vercel" xanh mới nhất trên `main` sau bước 0; danh sách secret đúng tên ở Global Constraints; bảo vệ nhánh `production` (bắt buộc PR, bắt buộc check `Nguồn PR phát hành` và `check`, cấm push thẳng, cấm xoá).
  - `supabase.md`: bước 1 kiểm số project, đủ 2 thì dừng hỏi người dùng; tạo project vùng `ap-south-1`; URL Configuration; lấy Transaction pooler 6543 (cho Vercel) và Session pooler 5432 (cho `TEST_DATABASE_URL`); giao giá trị qua kênh bảo mật; kiểm số bản ghi sau lần làm mới đầu.
  - `cloudflare.md`: bucket test riêng tư, CORS với tên miền test; ba token (app test đọc ghi bucket test; đọc bucket PROD; ghi bucket test).

- [ ] **Step 3: Sửa `README.md`, `docs/architecture.md`** như phần Files; thêm liên kết tới `docs/operations/trien-khai/README.md` trong mục "Triển khai Vercel".

- [ ] **Step 4: Commit**

```bash
git add docs README.md
git commit -m "docs: hướng dẫn triển khai hai môi trường test và PROD"
```

### Task 7: Kiểm toàn bộ trước PR

- [ ] **Step 1:** `npm ci` (worktree chưa có `node_modules`).
- [ ] **Step 2:** `npm run format:check` → không lỗi (nếu lỗi: `npm run format`, commit `chore: định dạng`).
- [ ] **Step 3:** `npm run lint` và `npm run typecheck` → 0 lỗi.
- [ ] **Step 4:** `npx vitest run tests/unit/vercel-config.test.ts tests/unit/lib/deployment.test.ts tests/unit/scripts/supabase-ref.test.ts` → pass; rồi `npm test` toàn bộ một lần → pass.
- [ ] **Step 5:** `npm run build` → thành công.
- [ ] **Step 6:** Kiểm cú pháp workflow: nếu có `actionlint` thì chạy trên `.github/workflows/*.yml`; không có thì đọc lại từng file, ghi rõ trong báo cáo là chưa kiểm bằng công cụ.
- [ ] **Step 7:** Báo cáo: đã đổi gì, đã kiểm gì (lệnh và kết quả), chưa kiểm gì (Vercel thật, workflow với secret thật, `pg_restore` vào Supabase). Ghi rõ: PR này chỉ merge sau bước 0 và sau khi chủ Vercel đổi Production Branch (spec 5.4); merge trước cũng không hỏng gì, chỉ chưa có môi trường test.
