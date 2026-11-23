# Chuẩn hoá repo và chuyển sang Modular Monolith Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa repo lên chuẩn dự án làm nhóm (định dạng tự động, CI, lớp `app` không chạm DB, logic không nhân bản, trạng thái có kiểu) rồi chuyển từ N-Layer sang Modular Monolith từng module một — mỗi lần merge vào `main` app vẫn chạy như cũ.

**Architecture:** Đích là mục Architecture trong `CLAUDE.md` (ghi ngày 20/11/2026): `src/modules/<mảng>/{domain,server,ui}` + ba cổng công khai `index.ts`/`actions.ts`/`ui.ts`, mười module xếp 5 tầng, module chỉ import tầng thấp hơn. Giai đoạn A dựng nền kiểm tra, giai đoạn B gỡ các chỗ ghép ngược tầng, giai đoạn C chuyển file (chỉ đổi chỗ và đổi import, không đổi logic).

**Tech Stack:** Next.js 16, TypeScript, ESLint 9 + `eslint-plugin-boundaries` (đã có), Vitest + PGlite, Playwright, GitHub Actions, Vercel, Prettier (dependency mới, người dùng đồng ý 19/11/2026).

**Spec:** Không có spec riêng. Căn cứ: mục "Hiện trạng" dưới đây (đo 19–20/11/2026 trên `main` @ `eb3234a`), mục Architecture trong `CLAUDE.md`, và quyết định của người dùng: thêm Prettier, thêm CI cho PR, mỗi task một PR, chuyển mục Front-end design ra `docs/`, chọn Modular Monolith, mọi lần merge vào `main` phải giữ app chạy bình thường, viết lại hướng dẫn cài đặt theo cấu trúc mới.

## Hiện trạng (19–20/11/2026)

| Hạng mục | Kết quả |
|---|---|
| `tsc --noEmit` / `eslint` / `vitest run` | 0 lỗi / 0 lỗi + 31 cảnh báo / 623 qua, 2 bỏ qua (85 s) |
| CI | Không có; `.github/workflows/` chỉ có `ai-rules-sync.yml`, `backup.yml` |
| Formatter | Không có; 647 dòng > 200 ký tự |
| `src/app` chạm DB | 8 trang tự viết truy vấn Drizzle, bỏ qua kiểm quyền của service |
| Đăng ký side-effect | `register*` chỉ chạy nếu module đăng ký đã được import; `src/server/files/register.ts` thiếu hoá đơn; `templates/service.ts:166` dùng `await import('@/server/invoices/service')` để ép đăng ký |
| Ghép ngược tầng (theo bảng module đích) | `rooms → invoices` (`leaseData`, `loadAddenda` trong `getRoomDetail`), `assets → incidents` (`assetHistory`), `invoice-templates` ghi bảng `invoices`, `leases` |
| Ghi bảng chéo | `contracts`/`addenda` ghi ~20 bảng (hoá đơn, chỉ số, bàn giao, sự cố…) → hợp đồng, hoá đơn, sự cố phải chung module `leasing` |
| Logic trùng | Số dư cọc luỹ kế viết 3 lần; hai bảng nhãn loại cọc lệch nhau |
| File lớn | `server/contracts/service.ts` 749 dòng |
| Trạng thái | Cột trạng thái là `text`, 106 literal không kiểm kiểu |
| Biến môi trường | 14 biến đọc rải rác |
| Đường dẫn cứng | `next.config.ts:5` `outputFileTracingIncludes` và `server/pdf/fonts.ts:5-11` trỏ `src/server/pdf/fonts/` |
| README | Mục e2e cũ (`E2E_EMAIL`), mô tả R2 sai (thiếu `R2_*` với `STORAGE_DRIVER=r2` là báo lỗi, không rơi về bộ nhớ) |

## Module đích

| Tầng | Module | Lấy từ (server) | Lấy từ (giao diện) |
|---|---|---|---|
| 1 | `platform` | `session.ts`, `auth-user.ts`, `audit.ts`, `files/`, `storage/`, `settings/` | `components/file-upload.tsx`, `components/require-permission.tsx`, `features/settings/components/settings-tabs.tsx` |
| 2 | `users` | `users/` | `features/users/` |
| 2 | `tenants` | `tenants/` | `features/tenants/` |
| 2 | `facilities` | `facilities/`, `rooms/` (phần CRUD), `amenities/`, `fees/`, `cascade-delete.ts` | `features/facilities/`, `features/settings/` (phí, tiện ích), `features/rooms/` (component không dùng dữ liệu hợp đồng) |
| 2 | `documents` | `templates/`, `invoice-templates/`, `pdf/`, `word/`, `convert/` | `features/templates/` |
| 3 | `assets` | `assets/`, `stock/` | `features/assets/` |
| 3 | `meters` | `meters/` | `features/meters/` |
| 4 | `leasing` | `contracts/`, `addenda/`, `handovers/`, `charges/`, `invoices/`, `incidents/` | `features/{contracts,deposits,handovers,charges,invoices,incidents}/`, `features/rooms/` (component dùng trạng thái phòng/hợp đồng/sự cố) |
| 5 | `import` | `import/` | `features/import/` |
| 5 | `dashboard` | `dashboard/` | `features/dashboard/` |

Quy tắc chia khi chuyển (để người làm không phải đoán):
- **Domain:** file trong `src/domain/` chỉ một module dùng thì chuyển vào `src/modules/<m>/domain/`; hai module trở lên dùng thì ở lại `src/domain/` (lõi dùng chung). Đếm bằng `grep -rl "@/domain/<tên>'" src` tại thời điểm chuyển.
- **Component:** đi theo module của server mà nó import; import server của hai module ngang tầng thì đặt cạnh route trong `src/app/` (lớp ghép).
- **Cổng công khai:** `index.ts` chỉ export những gì nơi ngoài module đang dùng (tìm bằng grep đường dẫn cũ); `actions.ts` re-export server action (không có `'use server'` ở file cổng); `ui.ts` export component. Bên trong module import bằng đường dẫn tương đối.

## Global Constraints

- Không đổi hành vi nghiệp vụ, dữ liệu, quyền, chuỗi giao diện, URL. Không tạo migration: mỗi PR chạy `npm run db:generate` phải báo "No schema changes". Nhờ vậy revert code bất kỳ PR nào cũng không cần đụng DB.
- Mỗi task một nhánh cắt từ `main` mới nhất, một PR, merge xong mới cắt nhánh task sau. Không commit lên `main`, không `--no-verify`, không force-push, không tự merge PR.
- Task chuyển module (giai đoạn C) dùng `git mv` và chỉ được đổi dòng `import`/`export`; mọi sửa logic thuộc giai đoạn A/B.
- Commit, comment, chuỗi giao diện tiếng Việt; tiền tố `feat:` `fix:` `docs:` `perf:` `refactor:` `test:` `chore:` `ci:`.
- Không thêm dependency nào ngoài `prettier`. Không sửa file "Managed by ai-rules"; sửa `.claude/ai-rules.json` chỉ khi người dùng duyệt lúc làm.
- Tài liệu kiến trúc `docs/architecture.md` (tạo 20/11/2026) là nơi agent sau đọc để hiểu repo: mọi PR làm theo mục 8 của file đó (chuyển module → cập nhật bảng trạng thái; đổi luật → cập nhật mục 4 và `CLAUDE.md`; gỡ một bẫy ở mục 6 → sửa dòng đó). PR thiếu cập nhật này chưa xong.
- Trước khi viết code Next.js (cổng `actions.ts`, `instrumentation`, cấu hình) đọc tài liệu trong `node_modules/next/dist/docs/` như `AGENTS.md` yêu cầu; trước khi viết cấu hình `eslint-plugin-boundaries` đọc README của bản đã cài (`node_modules/eslint-plugin-boundaries/README.md`).

## Cổng an toàn khi merge vào main (áp dụng mọi PR)

| Cổng | Lệnh / việc | Đạt khi |
|---|---|---|
| G1 CI | job `check` (Task 4): format, lint, typecheck, test, build | xanh trên PR |
| G2 Không migration | `npm run db:generate` | "No schema changes", `drizzle/` không đổi |
| G3 Chỉ đổi chỗ (giai đoạn C) | `git diff main -M --diff-filter=MR -U0 -- src tests scripts next.config.ts \| grep -E '^[+-][^+-]' \| grep -vE "^[+-]\s*(import\|export\|\} from\|from )"` (file cổng mới tạo không tính) | rỗng (trừ dòng đường dẫn font ở Task 17) |
| G4 E2E | `node scripts/e2e-preflight.mjs` rồi `E2E_BASE_URL=<preview Vercel của PR, NEXT_PUBLIC_DEMO_MODE=1> npm run test:e2e`; chạy lại chỉ test hỏng, toàn bộ một lần cuối task | toàn bộ qua. Thiếu môi trường preview → dừng, hỏi người dùng; không bỏ qua |
| G5 Thử tay | các trang ghi ở từng task, trên preview của PR | như trước khi sửa (chụp màn hình cho PR) |
| G6 Sau merge | CI trên `main` xanh; deploy production trên Vercel "Ready"; mở Nhắc việc, Hợp đồng, Hoá đơn, Mẫu giấy tờ, Tài sản và "Xem PDF" một hoá đơn (không lưu bản xuất) | đều chạy. Hỏng → mở PR `git revert -m 1 <merge-sha>` ngay, điều tra sau |

Task 1 (chỉ tài liệu) chỉ cần G1–G2. Task 2–4 chưa có job CI: chạy cùng các lệnh đó ở máy và dán kết quả vào PR.

## Review Focus

1. **Font PDF thiếu trên Vercel sau khi chuyển `pdf/`** — `outputFileTracingIncludes` và `fonts.ts` dùng đường dẫn cứng; local và test vẫn xanh, chỉ production hỏng. Test: Task 17 `pdf-fonts.test.ts`.
2. **Route lạnh chưa có đăng ký resolver/loader** — mở thẳng `/api/files/<id>` ảnh bàn giao hoặc xuất phiếu thu ngay sau khi server khởi động phải chạy. Test: Task 8 `registrations.test.ts` (unit + integration).
3. **Cổng `actions.ts`/`index.ts` kéo code server vào bundle trình duyệt** — component client import nhầm `index.ts` làm build hỏng hoặc lộ code server. Test: Task 12 luật ESLint `ui` không import `index.ts` của module khác (chỉ `import type`), và G1 build.
4. **Biến `NEXT_PUBLIC_*` không được nhúng vào bundle** nếu đọc kiểu `process.env[name]`. Test: Task 5 `env.test.ts`.
5. **Chuyển truy vấn từ trang vào service làm đổi phạm vi thấy dữ liệu** (số tệp chờ xoá/khôi phục theo cơ sở). Test: Task 7 `contract-pending-files.test.ts`.

---

## Giai đoạn A — Nền kiểm tra

### Task 1: `CLAUDE.md` gọn dưới 60 dòng

**Files:** Create `docs/front-end-design.md`; Modify `CLAUDE.md`, `docs/superpowers/plans/README.md`; đã có sẵn (20/11) và đi cùng PR này: `docs/architecture.md`, dòng trỏ cuối `AGENTS.md`

- [ ] **Step 1:** Chuyển nguyên văn mục "## Front-end design" (mọi tiểu mục) sang `docs/front-end-design.md`, tiêu đề `# Quy tắc thiết kế giao diện`. Không sửa nội dung.
- [ ] **Step 2:** Thay mục đó trong `CLAUDE.md` bằng một dòng ở Conventions: `- Giao diện: theo [docs/front-end-design.md](docs/front-end-design.md) (bố cục danh sách, bộ lọc, bảng, hộp thoại, màu, ô tiền, điện thoại).`
- [ ] **Step 3:** Sửa dòng tiền tố commit thành `` commit theo Conventional Commits: `feat:` `fix:` `docs:` `perf:` `refactor:` `test:` `chore:` `ci:` ``. Mục Architecture (đã ghi 20/11) giữ nguyên.
- [ ] **Step 4:** Thêm plan này vào bảng "Plan đang mở" của `docs/superpowers/plans/README.md`.
- [ ] **Step 5:** Run `wc -l CLAUDE.md` → Expected: ≤ 56.
- [ ] **Step 6:** Commit `docs: chọn Modular Monolith, tách quy tắc giao diện khỏi CLAUDE.md` (gồm cả mục Architecture, `docs/architecture.md`, dòng trỏ trong `AGENTS.md` và file plan này).

### Task 2: Prettier và định dạng toàn repo

**Files:** Create `.prettierrc.json`, `.prettierignore`, `.git-blame-ignore-revs`; Modify `package.json`, `CLAUDE.md` (Commands), mọi file được định dạng

**Interfaces:** Produces script `format` (`prettier --write .`), `format:check` (`prettier --check .`).

- [ ] **Step 1:** `npm install -D --save-exact prettier@3`
- [ ] **Step 2:** `.prettierrc.json` = `{ "semi": false, "singleQuote": true, "printWidth": 120, "trailingComma": "all" }`; `.prettierignore` = `.next/`, `node_modules/`, `drizzle/`, `.claude/`, `public/`, `package-lock.json`, `tests/fixtures/`, `docs/`.
- [ ] **Step 3:** Thêm hai script; Commands của `CLAUDE.md` thêm `- Định dạng: npm run format (CI chạy format:check)`. Commit `chore: thêm Prettier`.
- [ ] **Step 4:** `npm run format`, rồi `git diff --stat | grep -E "drizzle/|\.claude/|package-lock"` → Expected: rỗng.
- [ ] **Step 5:** `npm run lint && npx tsc --noEmit && npm test && npm run build` → Expected: 0 lỗi, 623 passed, build xong.
- [ ] **Step 6:** Commit `chore: định dạng toàn repo bằng Prettier`; ghi SHA vào `.git-blame-ignore-revs` (kèm chú thích), commit `chore: bỏ qua commit định dạng trong git blame`.

### Task 3: Lint sạch cảnh báo, thêm typecheck

**Files:** Modify `package.json`, các file có cảnh báo (`npx eslint .`), `CLAUDE.md`; `.claude/ai-rules.json` chỉ khi người dùng duyệt

**Interfaces:** Produces `"lint": "eslint --max-warnings=0"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 1:** Đổi hai script. Run `npm run lint` → Expected: FAIL, 31 cảnh báo.
- [ ] **Step 2:** 20 `no-unused-vars`: xoá biến/import thừa (không đổi thành `_x` để lách).
- [ ] **Step 3:** 6 `no-location-assign-relative-destination`: `router.push`/`router.replace`, hoặc `window.location.assign(new URL(path, location.origin))` nơi cố ý tải lại trang đầy đủ (giữ hành vi).
- [ ] **Step 4:** 3 `jsx-a11y/alt-text`: thêm `alt` tiếng Việt. 2 `no-img-element`: ảnh từ URL ký tạm của storage thì giữ `<img>` với `eslint-disable-next-line` kèm lý do (tiền lệ `tenant-documents.tsx:35`), còn lại dùng `next/image`.
- [ ] **Step 5:** `npm run lint && npm run typecheck && npm test` → Expected: 0 cảnh báo, 0 lỗi, 623 passed.
- [ ] **Step 6:** Hỏi người dùng có thêm `npm run typecheck`, `npm run format:check` vào `verify.commands.lint` của `.claude/ai-rules.json`; chỉ sửa khi đồng ý. Commands của `CLAUDE.md` thêm `npm run typecheck`.
- [ ] **Step 7:** Commit `chore: lint không cho phép cảnh báo, thêm script typecheck`

### Task 4: CI chạy cổng kiểm tra trên mỗi PR

**Files:** Create `.github/workflows/ci.yml`, `.nvmrc` (`22`); Modify `package.json` (`"engines": { "node": ">=20.9" }`)

- [ ] **Step 1:** Đổi tên tạm `.env.local`, chạy `npm run build`, ghi lại biến nào làm build hỏng, đổi tên lại.
- [ ] **Step 2:** `ci.yml`: trigger `pull_request` và `push` lên `main`; `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`; job `check` (`ubuntu-latest`, `timeout-minutes: 20`, `actions/setup-node` với `node-version-file: .nvmrc`, `cache: npm`): `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npx drizzle-kit generate` + `git diff --exit-code drizzle/` (G2 tự động), `npm run build`. Chỉ khi Step 1 thấy cần: `env` giả ở cấp job (`NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder`, `DATABASE_URL: postgres://ci:ci@localhost:5432/ci`). Không dùng secret.
- [ ] **Step 3:** Đẩy nhánh, mở PR → Expected: `check` xanh. Đỏ → `ai-rules-handling-failures` trước khi chạy lại.
- [ ] **Step 4:** Commit `ci: chạy định dạng, lint, typecheck, test, kiểm migration, build trên mỗi PR`
- [ ] **Step 5:** Báo người dùng bật "Require status checks to pass" (job `check`) và "Require branches to be up to date" cho `main` trên GitHub.

### Task 5: Biến môi trường kiểm tra một chỗ

**Files:** Create `src/lib/env.ts`, `tests/unit/lib/env.test.ts`; Modify mọi file đọc `process.env` trong `src/` trừ `src/db/client.ts`

**Interfaces:**
- `publicEnv: { supabaseUrl: string; supabaseKey: string; demoMode: boolean }` — đọc **literal** `process.env.NEXT_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY`, `…_ANON_KEY`, `…_DEMO_MODE`; `supabaseKey` qua `resolveSupabaseKey` có sẵn.
- `getServerEnv(): ServerEnv` — `{ supabaseServiceRoleKey?: string; storageDriver: 'supabase' | 'r2' | 'memory'; r2?: { accountId; accessKeyId; secretAccessKey; bucket }; demoPassword?: string }`, parse zod một lần rồi cache. `storageDriver` giữ đúng luật ở `server/storage/index.ts:13-22`: `'r2'` khi đặt r2; `'memory'` khi đặt memory **hoặc** thiếu `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`; còn lại `'supabase'`. `r2` thiếu biến → ném `'Thiếu cấu hình R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)'`.
- `src/db/client.ts` giữ đọc biến DB tại chỗ (`db` chỉ import `db`).

- [ ] **Step 1: Test thất bại** (`vi.stubEnv` + `vi.resetModules`): `STORAGE_DRIVER='ftp'` → ném lỗi chứa `'STORAGE_DRIVER'`; không đặt `STORAGE_DRIVER`, có đủ biến Supabase → `'supabase'`; thiếu `SUPABASE_SERVICE_ROLE_KEY` → `'memory'`; `'r2'` thiếu `R2_BUCKET` → ném đúng thông báo trên; `NEXT_PUBLIC_DEMO_MODE='1'` → `demoMode === true`; nội dung `src/lib/env.ts` chứa đủ 4 chuỗi literal và không chứa `process.env[`.
- [ ] **Step 2:** `npx vitest run tests/unit/lib/env.test.ts` → FAIL.
- [ ] **Step 3:** Viết `env.ts`, thay mọi `process.env` trong `src/` (trừ `db/client.ts`).
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test` → PASS; `grep -rn "process\.env" src | grep -v "src/lib/env.ts\|src/db/client.ts"` → rỗng.
- [ ] **Step 5:** G4, G5: đăng nhập nhanh tài khoản demo, tải một ảnh giấy tờ khách.
- [ ] **Step 6:** Commit `refactor: đọc biến môi trường qua một module có kiểm tra`

### Task 6: Một nguồn tính số dư cọc

**Files:** Modify `src/domain/deposit.ts`, `tests/unit/domain/deposit.test.ts` (tạo nếu chưa có), `src/features/deposits/components/deposit-ledger.tsx`, `src/app/(app)/contracts/contract-detail.tsx`

**Interfaces:**
- `runningDepositBalances(entries: Pick<DepositEntry, 'type' | 'amount' | 'status'>[]): number[]` — số dư sau từng dòng, chỉ dòng `done` làm đổi; `depositBalance` dùng phần tử cuối (0 nếu rỗng).
- `DEPOSIT_ENTRY_LABELS: Record<DepositEntry['type'], string>` = `{ collect: 'Thu cọc', topup: 'Thu cọc bổ sung', deduct: 'Khấu trừ', refund: 'Hoàn cọc', forfeit: 'Mất cọc' }`.
- `DepositLedger` props `{ entries; canEdit: boolean; leaseId?: string }`; form thêm dòng chỉ hiện khi `canEdit && leaseId`.

- [ ] **Step 1: Test thất bại:** `runningDepositBalances([{type:'collect',amount:10_000_000,status:'done'},{type:'topup',amount:2_000_000,status:'pending'},{type:'deduct',amount:3_000_000,status:'done'}])` → `[10_000_000, 10_000_000, 7_000_000]`; `[]` → `[]`; `depositBalance` cùng dữ liệu → `7_000_000`; `DEPOSIT_ENTRY_LABELS.topup` → `'Thu cọc bổ sung'`.
- [ ] **Step 2:** `npx vitest run tests/unit/domain/deposit.test.ts` → FAIL.
- [ ] **Step 3:** Cài đặt; `DepositLedger` dùng hai thứ trên; `contract-detail.tsx` xoá `runningBalances`, `Ledger`, bảng nhãn riêng, dùng `<DepositLedger entries={deposit.entries} canEdit={false} />`.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test` → PASS.
- [ ] **Step 5:** G4, G5: chi tiết một hợp đồng cọc và một hợp đồng thuê có sổ cọc — đủ cột, số dư luỹ kế khớp ảnh chụp trước khi sửa.
- [ ] **Step 6:** Commit `refactor: gộp cách tính số dư cọc và nhãn sổ cọc vào domain`

### Task 7: Trang không tự truy vấn DB

**Files:** Modify `src/server/users/queries.ts`, `src/server/rooms/service.ts`, `src/server/assets/service.ts`, `src/server/files/service.ts`, `src/server/meters/service.ts`, 8 trang (`src/app/(app)/assets/[id]/page.tsx`, `contracts/new-contract.tsx`, `contracts/page.tsx`, `incidents/page.tsx`, `incidents/[id]/page.tsx`, `rooms/[id]/page.tsx`, `users/new-user.tsx`, `users/[id]/page.tsx`), `eslint.config.mjs`; Test `tests/integration/page-queries.test.ts`, `tests/integration/contract-pending-files.test.ts`

**Interfaces** (mỗi hàm giữ đúng phạm vi dữ liệu của truy vấn cũ):
- `userNamesByIds(db: DB, ctx: AccessContext, ids: string[]): Promise<Map<string, string>>` — `users/queries.ts`
- `roomCodesByIds(db: DB, ctx: AccessContext, ids: string[]): Promise<Map<string, string>>` — `rooms/service.ts`
- `assetLocationLabel(db: DB, ctx: AccessContext, kind: 'room' | 'facility', id: string): Promise<string>` — `assets/service.ts`; trả `Phòng <code>`, tên cơ sở, hoặc `'?'`
- `countPendingContractFiles(db: DB, ctx: AccessContext): Promise<{ deletes: number; restores: number }>` — `files/service.ts`; logic của `contracts/page.tsx:27-28`
- `listRoomMeterOptions(db: DB, ctx: AccessContext, roomIds: string[]): Promise<Array<{ id: string; roomId: string; feeTypeId: string | null; name: string; unit: string; busy: boolean }>>` — `meters/service.ts`; gộp `new-contract.tsx:35-41`
- `listContractAssetOptions(db: DB, ctx: AccessContext, facilityIds: string[])` — `assets/service.ts`; đúng nhánh ở `new-contract.tsx:44`
- Trang users dùng `listFacilities(db, ctx, { includeInactive: true })` có sẵn.
- ESLint: `src/app/**` cấm import `@/db`, `@/db/schema/*`, `drizzle-orm` (`no-restricted-imports`); vẫn cho `@/db/client`.

- [ ] **Step 1: Test thất bại** (mẫu `tests/integration/incidents.test.ts`): `contract-pending-files` — cơ sở A, B mỗi nơi một file `pending_contract_delete` và một `pending_contract_restore`; người có `tenants_contracts`+`delete_contracts` ở A → `{deletes:1,restores:1}`; chỉ `tenants_contracts` ở A → `{deletes:0,restores:1}`; admin → `{deletes:2,restores:2}`. `page-queries` — `userNamesByIds`, `roomCodesByIds` trả đúng và bỏ id không tồn tại; `assetLocationLabel(…,'room',roomId)` → `'Phòng 301'`; `listRoomMeterOptions` đánh `busy:true` khi đồng hồ gắn dòng phí hợp đồng `active`, `false` khi `ended`.
- [ ] **Step 2:** Chạy hai file test → FAIL.
- [ ] **Step 3:** Cài đặt, thay 8 trang. Thêm luật ESLint; `npm run lint` → 0 lỗi.
- [ ] **Step 4:** `npm run typecheck && npm test` → PASS. G4, G5: Hợp đồng, Thêm hợp đồng (popup và F5), Sự cố, Chi tiết phòng, Người dùng.
- [ ] **Step 5:** Commit `refactor: chuyển truy vấn DB từ trang vào service, chặn bằng ESLint`

### Task 8: Đăng ký resolver và loader tại điểm vào

**Files:** Move `src/server/files/register.ts` → `src/server/registrations.ts`; Create `tests/unit/architecture/registrations.test.ts`, `tests/integration/registrations.test.ts`; Modify mọi `src/server/*/actions.ts`, `src/app/api/**/route.ts`, `src/app/(app)/layout.tsx`, `src/server/templates/service.ts:166`, `src/server/invoices/service.ts:307-308`

**Interfaces:** `registrations.ts` chỉ gồm `import '<file>'` cho mọi file có lời gọi cấp module `registerOwnerResolver(`, `registerExportOwnerResolver(`, `registerDocLoader(`, `registerPdfLoader(`. Điểm vào import nó ở dòng đầu: mọi `actions.ts`, mọi API `route.ts`, layout `(app)`. Không import từ `session.ts` (platform không được phụ thuộc module tầng trên). Task 12 dời file này thành `src/modules/registrations.ts`.

- [ ] **Step 1: Test thất bại.** Unit: quét `src/server/**` và `src/modules/**`; mọi file gọi `register(OwnerResolver|ExportOwnerResolver|DocLoader|PdfLoader)\(` ở cấp module phải được import trong file registrations; mọi `actions.ts` và mọi `src/app/api/**/route.ts` import file registrations; `templates/service.ts` không chứa `import('@/server/invoices`. Integration: chỉ import registrations, `files/owners`, `templates/service`; bàn giao có ảnh → `resolveOwner(db,'handover_photo',id)` trả đúng `facilityId`; hoá đơn đã duyệt → `exportDocument` docType `'invoice'` trả bytes PDF không rỗng.
- [ ] **Step 2:** `npx vitest run tests/unit/architecture tests/integration/registrations.test.ts` → FAIL.
- [ ] **Step 3:** Chuyển file, bổ sung module còn thiếu, thêm import ở điểm vào, bỏ import side-effect cũ ở hai route; xoá dòng `await import('@/server/invoices/service')`; `invoices/service.ts` đổi dynamic import templates thành import tĩnh.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test` → PASS. G4; G5: khởi động lại server, mở thẳng "Xem PDF" hoá đơn đã duyệt và ảnh bàn giao.
- [ ] **Step 5:** Commit `refactor: gom đăng ký resolver và loader, nạp tại điểm vào`

## Giai đoạn B — Gỡ ghép ngược tầng

### Task 9: Đưa phần dùng dữ liệu hợp đồng về phía hợp đồng

**Files:** Create `src/server/contracts/room-view.ts`, `src/server/invoices/template-assignment.ts`; Modify `src/server/rooms/service.ts:177-238`, `src/server/assets/service.ts:5,167`, `src/server/invoice-templates/service.ts:105-125`, `src/app/(app)/assets/[id]/page.tsx`, các nơi gọi (grep tên hàm), test liên quan

**Interfaces:**
- `listRoomsWithStatus`, `getRoomDetail`, kiểu `RoomWithStatus` chuyển nguyên chữ ký sang `server/contracts/room-view.ts` (chúng đọc hợp đồng, phụ lục). `RoomStatus` và hàm thuần ở `src/domain/room-status.ts` giữ nguyên chỗ.
- `assetHistory(db, ctx, id)` trả `{ moves, handovers }` (bỏ `incidents`); trang chi tiết tài sản gọi thêm `incidentsForAsset(db, id)` và ghép.
- Hai hàm ghi `invoices.invoiceTemplateId` và `leases.invoiceTemplateId` (dòng 105–125) chuyển nguyên chữ ký sang `server/invoices/template-assignment.ts`; action tương ứng import từ đó.

- [ ] **Step 1: Test:** sửa test của `assetHistory` thành mong đợi `{ moves, handovers }` không có `incidents`; thêm vào `tests/unit/architecture/registrations.test.ts` khẳng định `grep` rỗng cho: `@/server/invoices` trong `src/server/rooms/`, `@/server/incidents` trong `src/server/assets/`, `.update(invoices` và `.update(leases` trong `src/server/invoice-templates/`. Run → FAIL.
- [ ] **Step 2:** Chuyển các hàm, sửa import, ghép sự cố ở trang tài sản. Thêm comment đầu `src/server/cascade-delete.ts`: `// Ngoại lệ có chủ ý: xoá cơ sở/phòng ghi bảng của leasing vì DB không có ON DELETE CASCADE.`
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm test` → PASS. G4; G5: Cơ sở & phòng (lưới trạng thái), Chi tiết phòng, Chi tiết tài sản (mục sự cố), đổi mẫu hoá đơn của một hợp đồng và một hoá đơn.
- [ ] **Step 4:** Commit `refactor: chuyển trạng thái phòng và gán mẫu hoá đơn về phía hợp đồng`

### Task 10: Tách `server/contracts/service.ts`

**Files:** Create `src/server/contracts/{shared,deposits,leases,lifecycle}.ts`; Modify `service.ts` (chỉ re-export), file registrations nếu `register*` đổi file

**Interfaces** (giữ tên và chữ ký mọi hàm; `service.ts` re-export để 21 file đang import không phải sửa):
- `shared.ts`: `loadRoom`, `loadTenant`, `SIGN_RANK`, kiểu `Lease`, `DepositContract`
- `deposits.ts`: `createDepositContract`, `cancelDepositContract`, `updateDepositContract`, `listDepositContracts`, `getDepositContract`, `getPendingDepositContract`
- `leases.ts`: `nextLeaseCode`, `createLease`, `convertDepositToLease`, `listLeases`, `listLeaseOccupants`, `getLease`, `updateLease`, `updateLeaseAssets`
- `lifecycle.ts`: `deleteContract`, `cleanupPendingContractFiles`, `setSignStatus`, `exportContract` và các lời gọi `register*`

- [ ] **Step 1:** `npx vitest run tests/integration/contract*.test.ts tests/integration/convert.test.ts` → PASS, ghi số test.
- [ ] **Step 2:** Chuyển hàm theo nhóm, mỗi file ≤ 300 dòng, không sửa thân hàm.
- [ ] **Step 3:** Lệnh Step 1 → cùng số test, PASS; `npm run lint && npm run typecheck && npm test` → PASS (test registrations xanh). G4.
- [ ] **Step 4:** Commit `refactor: tách service hợp đồng theo cọc, hợp đồng thuê, vòng đời`

### Task 11: Trạng thái có kiểu

**Trước khi làm:** task này cho `db` import **kiểu** từ `src/domain` — một thay đổi quy tắc phụ thuộc. Hỏi người dùng, chỉ làm khi được đồng ý.

**Files:** Create `src/domain/statuses.ts`, `tests/unit/domain/statuses.test.ts`; Modify `src/db/schema/{contracts,invoices,assets,incidents,handovers,addenda}.ts`, `src/server/contracts/shared.ts`, `src/server/assets/service.ts:14`, `src/server/incidents/service.ts:12`, `src/server/handovers/service.ts:13`, `eslint.config.mjs`, `src/db/schema/facilities.ts:2`, `CLAUDE.md`

**Interfaces:** `src/domain/statuses.ts` (lõi dùng chung vì `db` và nhiều module dùng): `LeaseStatus = 'active' | 'ended'`; `DepositContractStatus = 'pending' | 'converted' | 'cancelled'`; `CancelOutcome = 'forfeit' | 'refund'`; `SignStatus = 'draft' | 'exported' | 'signed'`; `DepositEntryType = 'collect' | 'topup' | 'deduct' | 'refund' | 'forfeit'`; `DepositEntryStatus = 'pending' | 'done'`; `AssetStatus = 'in_use' | 'broken' | 'disposed'`; `IncidentStatus = 'new' | 'in_progress' | 'done' | 'cancelled'`; `HandoverKind = 'check_in' | 'check_out'`; trạng thái hoá đơn lấy đủ bằng `grep -rn "status" src/db/schema/invoices.ts src/server/invoices`. Cột dùng `.$type<…>()` (không sinh migration). Server thay định nghĩa tại chỗ bằng `export type { … } from '@/domain/statuses'`. ESLint boundaries: `db → domain` chỉ với `importKind: 'type'`; xoá `eslint-disable` ở `facilities.ts:2`. Dòng Dependency rules trong `CLAUDE.md` thêm "`db` chỉ `import type` từ `src/domain`".

- [ ] **Step 1: Test thất bại:** `expectTypeOf<typeof leases.$inferSelect['status']>().toEqualTypeOf<LeaseStatus>()` và tương tự mọi cột trên. `npm run typecheck` → FAIL.
- [ ] **Step 2:** Cài đặt; sửa lỗi kiểu `typecheck` báo (không dùng `as`).
- [ ] **Step 3:** G2 (`db:generate` → "No schema changes"); `npm run lint && npm run typecheck && npm test` → PASS. G4.
- [ ] **Step 4:** Commit `refactor: gắn kiểu cho cột trạng thái`

## Giai đoạn C — Chuyển sang module

### Task 12: Khung module, luật ranh giới, test kiến trúc

**Files:** Move `src/server/registrations.ts` → `src/modules/registrations.ts`; Create `tests/unit/architecture/import-graph.ts`, `tests/unit/architecture/modules.test.ts`, `tests/fixtures/import-graph/` (3–4 file mẫu); Modify `eslint.config.mjs`, `tests/unit/architecture/registrations.test.ts`, các file import registrations

**Interfaces:**
- `MODULE_TIERS = { platform: 1, users: 2, tenants: 2, facilities: 2, documents: 2, assets: 3, meters: 3, leasing: 4, import: 5, dashboard: 5 } as const` — export từ `tests/unit/architecture/import-graph.ts` và chép cùng giá trị vào `eslint.config.mjs` (test so khớp hai bản).
- `buildImportGraph(srcDir: string): Map<string, Set<string>>` — cạnh import/export tĩnh và `import('…')` động, bỏ `import type`, phân giải `@/` và đường dẫn tương đối.
- `moduleViolations(graph): string[]` — mỗi phần tử `"<file> -> <file>: <lý do>"`, lý do là một trong: `tầng không thấp hơn`, `không qua cổng công khai`, `dùng chung import module`. Bỏ qua cạnh tới `src/modules/registrations.ts` từ điểm vào.
- ESLint boundaries (đọc README bản đã cài trước khi viết): element `module` (`src/modules/*`, capture tên) với các phần `domain`, `server`, `ui`, cổng `index.ts`/`actions.ts`/`ui.ts`; luật: tầng thấp hơn và chỉ qua cổng; `ui` chỉ `import type` từ `index.ts` của module khác; `domain` → `src/domain`; `src/domain`, `src/components`, `src/lib`, `src/db` không import `src/modules`. Giữ luật cũ cho `src/server`, `src/features` tới Task 22, thêm: code cũ (`server`, `feature`, `app`) được import `src/modules/*` qua cổng công khai; `src/modules` không import `src/server`, `src/features` (chuyển từ dưới lên nên module đã chuyển chỉ cần module đã chuyển).

- [ ] **Step 1: Test thất bại:** trên fixture — một file ở module tầng 2 import module tầng 3 → `moduleViolations` báo `tầng không thấp hơn`; import `…/server/x` của module khác → `không qua cổng công khai`; `import type` không bị tính; dynamic import có bị tính. Trên `src` thật → `toEqual([])`. `MODULE_TIERS` trong test bằng bản trong `eslint.config.mjs`.
- [ ] **Step 2:** `npx vitest run tests/unit/architecture` → FAIL.
- [ ] **Step 3:** Viết helper, luật ESLint, dời registrations.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test && npm run build` → PASS. G4.
- [ ] **Step 5:** Commit `chore: dựng khung module và luật ranh giới`

### Quy trình chuyển một module (Task 13–21)

Mỗi task dưới đây theo đúng các bước này; task chỉ ghi phần riêng.

- [ ] **Step 1:** Cắt nhánh `refactor/module-<tên>` từ `main` mới nhất.
- [ ] **Step 2:** `git mv` server sang `src/modules/<tên>/server/<thư mục cũ>/`, component sang `src/modules/<tên>/ui/`, domain theo quy tắc chia ở mục "Module đích".
- [ ] **Step 3:** Tạo `index.ts`, `actions.ts`, `ui.ts` theo quy tắc cổng công khai; module không có action/component thì bỏ file cổng tương ứng.
- [ ] **Step 4:** Sửa import: ngoài module → cổng công khai; trong module → tương đối; `tests/`, `scripts/` được import đường dẫn trong module.
- [ ] **Step 5:** `npx vitest run tests/unit/architecture && npm run lint` → PASS (không vi phạm tầng/cổng).
- [ ] **Step 6:** `npm run typecheck && npm test && npm run build` → PASS, cùng số test như `main`.
- [ ] **Step 7:** G2, G3 (chỉ đổi chỗ), G4, G5 với các trang của task.
- [ ] **Step 8:** Trong `docs/architecture.md` mục 1, đổi dòng của module thành "Đã chuyển", cột vị trí thành `src/modules/<tên>/`; nếu task gỡ một bẫy ở mục 6 thì sửa dòng đó. Đánh dấu task trong plan; commit `refactor: chuyển <tên> sang src/modules`; mở PR; sau merge chạy G6.

### Task 13: Module `platform`
- Riêng: `src/proxy.ts`, `scripts/seed/*` (import `@/server/storage`) đổi sang `@/modules/platform`. Đây là PR nhiều file nhất (hầu hết action import `getAccessContext`), không có đổi logic.
- G5: đăng nhập, đăng xuất, Cài đặt chung (tài khoản ngân hàng), tải và xem ảnh giấy tờ khách, Nhật ký.

### Task 14: Module `users`
- G5: Người dùng — danh sách, thêm (popup, F5, Esc), sửa quyền và cơ sở, khoá, đặt lại mật khẩu.

### Task 15: Module `tenants`
- Riêng: `scripts/seed/tenants.ts` đổi import.
- G5: Khách thuê — tìm không dấu, thêm (popup, F5, Esc), sửa, xem hồ sơ có ảnh giấy tờ.

### Task 16: Module `facilities`
- Riêng: tách `features/settings/components/` — `amenity-settings.tsx`, `fee-*.tsx`, `fee-options.ts`, `use-run.tsx` vào `facilities/ui/` (nếu `use-run.tsx` được nơi khác dùng thì để `src/components/`); `features/rooms/components/` chỉ chuyển component không import dữ liệu hợp đồng (`RoomWithStatus`, sự cố) — phần còn lại chờ Task 19/20. `scripts/ensure-utility-fees.ts` đổi import.
- G5: Cơ sở & phòng — thêm cơ sở, thêm phòng hàng loạt, sửa phòng, tiện ích; Cài đặt phí theo toà.

### Task 17: Module `documents`
- Riêng (đổi chuỗi đường dẫn, ngoại lệ duy nhất của G3): `next.config.ts:5` `./src/server/pdf/fonts/*.ttf` → `./src/modules/documents/server/pdf/fonts/*.ttf`; `fonts.ts:5-11` đổi `'src/server/pdf/fonts/…'` tương ứng.
- Test mới `tests/unit/pdf-fonts.test.ts`: mọi đường dẫn font trong `fonts.ts` tồn tại trên đĩa và khớp một glob trong `nextConfig.outputFileTracingIncludes['/*']`. Viết test trước khi dời (chạy xanh trên chỗ cũ), dời xong vẫn xanh.
- G5 trên **preview Vercel** (không chỉ local): Mẫu giấy tờ — soạn, kéo trường, xem trước; xuất Word hợp đồng; "Xem PDF" hoá đơn và phiếu thu có dấu tiếng Việt đúng font.

### Task 18: Module `assets`
- G5: Tài sản — lọc Toà → Vị trí, thêm, chuyển tài sản, kho (cập nhật, xuất), chi tiết tài sản.

### Task 19: Module `meters`
- G5: Điện nước — ghi chỉ số (thử nhập thấp hơn chỉ số cũ), thay đồng hồ, lịch sử đồng hồ phòng.

### Task 20: Module `leasing` — server
- Chỉ chuyển `contracts/`, `addenda/`, `handovers/`, `charges/`, `invoices/`, `incidents/` và domain của chúng; giao diện ở `src/features/` tạm import cổng `@/modules/leasing/actions` (luật chuyển tiếp từ Task 12 cho phép).
- G5: tạo cọc → chuyển thành hợp đồng (hoá đơn nháp đầu tiên), phụ lục gia hạn và thanh lý, bàn giao check-in/out, tạo hoá đơn hàng loạt, duyệt, thu một phần, sự cố tính phí cho khách.

### Task 21: Module `leasing` — giao diện, rồi `import` và `dashboard`
- Chuyển `features/{contracts,deposits,handovers,charges,invoices,incidents}/` và phần còn lại của `features/rooms/` vào `leasing/ui/`; sau đó chuyển `import`, `dashboard` (domain `reminders.ts` vào `dashboard/domain/`). Nếu diff > 150 file, tách `import` + `dashboard` thành PR riêng theo cùng quy trình.
- G5: như Task 20 cộng Nhắc việc (Admin và Hùng), Nhập dữ liệu (file Excel mẫu).

### Task 22: Dọn cấu trúc cũ, README mới

**Files:** Delete thư mục rỗng `src/server/`, `src/features/`; Modify `eslint.config.mjs` (bỏ element `server`, `feature`), `CLAUDE.md`, `README.md`, `docs/superpowers/plans/README.md`

- [ ] **Step 1:** `find src/server src/features -type f` → rỗng (nếu còn file → quay lại task của module sở hữu). Xoá thư mục, bỏ luật cũ trong ESLint.
- [ ] **Step 2:** `CLAUDE.md` Architecture: bỏ "(target; …)" ở dòng Style, bỏ câu "Code chưa chuyển…" ở Dependency rules, bỏ "mảng chưa chuyển…" ở New code. `wc -l CLAUDE.md` ≤ 60.
- [ ] **Step 2b:** `docs/architecture.md`: bỏ mục 3 (N-Layer), luật chuyển tiếp ở mục 4, các dòng bẫy đã xử lý ở mục 6; mục 1 chỉ còn bảng module với vị trí `src/modules/<tên>/`; đổi "Cập nhật lần cuối".
- [ ] **Step 3:** Thay `README.md` bằng nội dung ở mục "README mới" dưới đây (điền đúng tên miền thật nếu người dùng cho; không thì giữ `<tên-miền-app>`).
- [ ] **Step 4:** Theo đúng README mới, chạy lại từ đầu trên một bản clone sạch: `git clone` → `npm ci` → điền `.env.local` → `npm run db:migrate` (DB dev) → `npm run dev` → đăng nhập. Ghi lại bước nào lệch với README và sửa README.
- [ ] **Step 5:** G1–G6 đầy đủ; xoá dòng plan này khỏi "Plan đang mở" (plan xong thì xoá file theo quy ước của thư mục plans).
- [ ] **Step 6:** Commit `docs: README theo cấu trúc module, bỏ cấu trúc N-Layer cũ`

---

## README mới (nội dung cho Task 22)

````markdown
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

   Biến được kiểm khi app khởi động (`src/lib/env.ts`); thiếu hoặc sai sẽ báo đúng tên biến.
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

**Thêm một tính năng:** viết service + action + schema trong `src/modules/<mảng>/server/<tên>/`, component trong `ui/`, quy tắc thuần trong `domain/` kèm unit test; export ra cổng công khai những gì nơi khác cần; route trong `src/app/(app)/<tên>/`. Thêm mới luôn mở popup (xem `CLAUDE.md`, mục Conventions). Mảng mới: tạo `src/modules/<mảng>/` và thêm vào `MODULE_TIERS` (cả `eslint.config.mjs` và `tests/unit/architecture/import-graph.ts`). Module có `register*` thì thêm vào `src/modules/registrations.ts`.

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
````

## Không làm trong kế hoạch này

- **Tách `src/domain/types.ts`** (kiểu dùng chung gồm cả kiểu hợp đồng): để ở lõi dùng chung; tách khi `leasing` ổn định.
- **Tách `invoice-editor.tsx` (425 dòng), `contract-edit-actions.tsx` (338 dòng)**: chưa đủ e2e để tách giao diện an toàn.
- **Đổi cột `text` sang `pgEnum`**: cần migration trên dữ liệu thật; Task 11 đã cho phần lớn lợi ích ở mức kiểu.
- **Chạy e2e tự động trong CI**: cần secret và môi trường preview; G4 chạy tay trên preview trong lúc chờ plan riêng.
- **`cascade-delete.ts` (module `facilities`) ghi bảng của `leasing`** khi xoá cơ sở/phòng: ngoại lệ có chủ ý vì DB không có `ON DELETE CASCADE`; ghi chú ở đầu file trong Task 9, không tự sửa.
