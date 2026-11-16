# Tăng tốc chuyển trang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảm thời gian chuyển giữa các tab từ ~1,5–2 giây xuống dưới ~0,6 giây phía server, và cho phản hồi ngay khi bấm.

**Architecture:** Đo ngày 16/11/2026 từ máy dev tới Supabase `siris-pms` (ap-south-1): 1 truy vấn DB ≈ 140 ms, 1 lần `auth.getUser()` ≈ 400–600 ms. Mỗi lần chuyển trang hiện gọi `getUser()` 3 lần (proxy, layout, page) và 3 truy vấn quyền tuần tự 2 lần. Sửa gốc: xác thực JWT tại chỗ bằng `auth.getClaims()` (project dùng khoá ký ES256, JWKS được cache), dùng chung `AccessContext` trong một request bằng React `cache()`, chạy song song 3 truy vấn quyền; thêm `loading.tsx` và đặt function Vercel ở `bom1` cạnh DB.

**Tech Stack:** Next.js 16.4 (file `src/proxy.ts` thay middleware), @supabase/ssr + supabase-js 2.119, Drizzle, Vitest + PGlite, @vercel/config.

**Spec:** `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md` (§5 phân quyền thực thi ở server; §9 kiến trúc). Chẩn đoán: mục "Vì sao các tab load chậm" trong phiên làm việc 16/11; số đo ở trên.

## Global Constraints

- Đọc hướng dẫn liên quan trong `node_modules/next/dist/docs/` (proxy, `loading.js`) trước khi viết code — AGENTS.md.
- Phân quyền vẫn thực thi ở server: người chưa đăng nhập bị chuyển về `/login`; tài khoản `is_active = false` vẫn bị chặn (do `loadAccessContext` kiểm, không đổi).
- Giao diện tiếng Việt.
- Không đổi chữ ký `getAccessContext(): Promise<AccessContext>` và `loadAccessContext(db, userId)` — mọi trang và action đang dùng.

## Review Focus

1. **Token hết hạn khi đang mở web lâu** — proxy vẫn phải làm mới phiên (`getClaims()` của @supabase/ssr tự refresh qua cookie); người dùng không bị đá về `/login` sau 1 giờ. → Task 3 Step 3 (để tab mở qua thời hạn token hoặc xoá cookie access token, giữ refresh token, rồi chuyển tab).
2. **Không có cookie / cookie hỏng / chữ ký sai** → `readUserId` trả `null` và bị chuyển về `/login`, không ném lỗi 500. → Task 1 Step 1.
3. **Tài khoản bị khoá nhưng token còn hạn** → vẫn chặn. → `tests/integration/session.test.ts` hiện có ("null khi tài khoản bị khoá") phải vẫn PASS ở Task 1 Step 4.
4. **Admin đổi quyền của người khác** → lần chuyển trang kế tiếp của người đó thấy quyền mới (`cache()` chỉ sống trong một request, không giữ qua request). → Task 3 Step 3.
5. **`getClaims()` gọi mạng khi không xác thực tại chỗ được** (ví dụ project quay về khoá HS256) → vẫn đúng, chỉ chậm. → Task 1 Step 1 dùng mock nên không phụ thuộc; ghi chú trong `src/server/auth-user.ts`.

---

## Cấu trúc file

```
src/server/auth-user.ts        readUserId(): đọc user id từ JWT bằng getClaims
src/server/session.ts          getAccessContext bọc cache(); loadAccessContext chạy song song
src/proxy.ts                   dùng readUserId thay getUser
src/app/(app)/loading.tsx      khung "Đang tải…" khi chuyển tab
vercel.ts                      regions: ['bom1']
tests/unit/auth-user.test.ts
tests/unit/vercel-config.test.ts
```

### Task 1: Xác thực tại chỗ và bỏ lặp trong một request

**Files:**
- Create: `src/server/auth-user.ts`
- Modify: `src/server/session.ts`, `src/proxy.ts`
- Test: `tests/unit/auth-user.test.ts`, `tests/integration/session.test.ts` (giữ nguyên, phải PASS)

**Interfaces:**
- Produces: `readUserId(supabase: { auth: Pick<SupabaseClient['auth'], 'getClaims'> }): Promise<string | null>` — trả `data.claims.sub`; có `error`, `data` null hoặc ném lỗi → `null`.
- `getAccessContext` = `cache(async () => …)` (import `cache` từ `react`), bên trong dùng `readUserId` thay `auth.getUser()`.
- `loadAccessContext`: 3 truy vấn (profile, permissions, facilities) chạy bằng `Promise.all`; kết quả trả về không đổi.

- [ ] **Step 0: Đo mốc trước khi sửa** — làm theo Task 3 Step 1, ghi số vào cuối file này mục "Số đo".
- [ ] **Step 1: Viết test**

```ts
// tests/unit/auth-user.test.ts
const client = (r: unknown) => ({ auth: { getClaims: vi.fn().mockResolvedValue(r), getUser: vi.fn(() => { throw new Error('không được gọi getUser') }) } })
it('trả sub khi token hợp lệ', async () => {
  expect(await readUserId(client({ data: { claims: { sub: 'u1' } }, error: null }) as never)).toBe('u1')
})
it('null khi có lỗi', async () => {
  expect(await readUserId(client({ data: null, error: new Error('invalid JWT') }) as never)).toBeNull()
})
it('null khi chưa đăng nhập', async () => {
  expect(await readUserId(client({ data: null, error: null }) as never)).toBeNull()
})
it('null khi getClaims ném lỗi', async () => {
  const c = { auth: { getClaims: vi.fn().mockRejectedValue(new Error('network')) } }
  expect(await readUserId(c as never)).toBeNull()
})
```

- [ ] **Step 2:** Chạy `npx vitest run tests/unit/auth-user.test.ts` → FAIL (chưa có module).
- [ ] **Step 3:** Cài `readUserId`; sửa `session.ts` (cache + `readUserId` + `Promise.all`) và `proxy.ts` (`const userId = await readUserId(supabase)`; `!userId && !isLogin` → redirect `/login`).
- [ ] **Step 4:** Chạy `npx vitest run tests/unit/auth-user.test.ts tests/integration/session.test.ts` → PASS; `npm test` → PASS toàn bộ; `npx tsc --noEmit` → sạch.
- [ ] **Step 5:** Commit `perf: xác thực JWT tại chỗ bằng getClaims, dùng chung AccessContext trong một request`.

### Task 2: Phản hồi ngay khi bấm tab, đặt function cạnh DB

**Files:**
- Create: `src/app/(app)/loading.tsx`, `vercel.ts`
- Modify: `package.json` (dev dependency `@vercel/config`)
- Test: `tests/unit/vercel-config.test.ts`

**Interfaces:**
- `loading.tsx`: default export không async; vài khối `animate-pulse` theo bố cục tiêu đề + bảng, kèm chữ ẩn cho trình đọc màn hình "Đang tải…". Không đọc dữ liệu.
- `vercel.ts`: `export const config: VercelConfig = { framework: 'nextjs', regions: ['bom1'] }` (Mumbai, cùng vùng với Supabase `ap-south-1`). Nếu kiểu `VercelConfig` của bản `@vercel/config` cài được không có `regions` thì dùng `vercel.json` `{ "regions": ["bom1"] }` và test đọc file JSON đó.

- [ ] **Step 1: Viết test**

```ts
// tests/unit/vercel-config.test.ts
import { config } from '../../vercel'
it('function Vercel chạy cùng vùng với Supabase', () => {
  expect(config.regions).toEqual(['bom1'])
})
```

- [ ] **Step 2:** Chạy `npx vitest run tests/unit/vercel-config.test.ts` → FAIL.
- [ ] **Step 3:** `npm i -D @vercel/config`; tạo `vercel.ts` và `loading.tsx`.
- [ ] **Step 4:** Chạy lại → PASS; `npm run lint` → 0 lỗi; `npm run build` → OK.
- [ ] **Step 5:** Commit `perf: khung đang tải khi chuyển tab, function Vercel ở bom1`.

### Task 3: Đo lại, kiểm tra và đẩy lên main

- [ ] **Step 1: Đo** — `npm run build && npm run start` (đo bản build, không đo `next dev` vì có thời gian biên dịch). Mở `http://localhost:3000` trong trình duyệt, đăng nhập nhanh bằng Admin (demo mode), bấm lần lượt Cơ sở & phòng → Khách thuê → Hợp đồng → Điện nước → Nhắc việc, mỗi vòng 2 lần. Lấy thời gian các request `?_rsc=` (tab Network). Ghi trung vị vào mục "Số đo".
- [ ] **Step 2:** Đạt khi trung vị sau sửa ≤ 600 ms và giảm ít nhất 60% so với mốc. Không đạt → dừng, quay lại systematic-debugging với số đo mới, không đoán thêm.
- [ ] **Step 3:** Kiểm Review Focus 1 và 4 bằng tay: đăng xuất → mở `/tenants` → về `/login`; Admin bỏ quyền `meters` của Vy, Vy chuyển tab → menu Điện nước biến mất; xoá cookie access token (giữ refresh token) rồi chuyển tab → vẫn vào được.
- [ ] **Step 4:** `npm test` → PASS; `npx playwright test` (nếu có `E2E_BASE_URL`) → PASS.
- [ ] **Step 5:** Cập nhật `docs/superpowers/plans/README.md` mục Tiến độ (số đo trước/sau). Commit `docs: số đo tốc độ chuyển trang`; `git push origin main`.

## Số đo

| Lúc | Trung vị request `_rsc` | Ghi chú |
|---|---|---|
| Trước sửa | | |
| Sau sửa | | |
