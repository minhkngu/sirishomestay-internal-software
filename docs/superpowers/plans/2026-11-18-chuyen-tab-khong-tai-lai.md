# Chuyển tab, lọc, phân trang không tải lại trang — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quay lại tab đã mở hiện ngay không gọi server; lọc, tìm, đổi trang, đổi số dòng xử lý trong trình duyệt; bảng mặc định 15 dòng.

**Architecture:** Bật client cache của Next.js (`experimental.staleTimes`) và tải sẵn trang từ menu trái; các `revalidatePath`/`router.refresh()` có sẵn tiếp tục xoá cache khi người dùng tự lưu. Mỗi trang danh sách: server trả toàn bộ dòng trong quyền, một client component trong `src/features/<tên>/components/` đọc bộ lọc từ URL, lọc và phân trang tại chỗ; bộ lọc ghi URL bằng `window.history.replaceState` (không gọi server).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest (node), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-chuyen-tab-khong-tai-lai-design.md`

## Global Constraints

- Mặc định 15 dòng; lựa chọn số dòng đúng `15 / 30 / 50 / 100`; nhớ theo từng bảng trong `localStorage`, mọi đọc/ghi bọc try/catch.
- `experimental.staleTimes`: `dynamic: 3600`, `static: 3600`.
- Không đổi trang Nhật ký (`/audit`) và trang chi tiết.
- Không gọi server khi lọc/tìm/đổi trang/đổi số dòng. Bộ lọc vẫn nằm trên URL để chia sẻ link.
- Mình lưu thì trang cập nhật ngay; không thêm realtime hay tự lấy lại theo giờ.
- Dữ liệu gửi xuống client chỉ là dữ liệu service đã giới hạn theo quyền/cơ sở (giữ nguyên `facilityScope`, `assertCan`).
- Quy tắc import ở CLAUDE.md: `domain` không import ngoài `domain`; `features`/`components` không import `db`; feature không import feature khác.
- Chuỗi giao diện, comment, commit bằng tiếng Việt; commit dạng `feat:` / `fix:` / `perf:` / `test:`.
- E2E cần bản build production (Next tắt prefetch ở `next dev`): `NEXT_PUBLIC_DEMO_MODE=1 npm run build && NEXT_PUBLIC_DEMO_MODE=1 npm start`, rồi `E2E_BASE_URL=http://localhost:3000`. Chạy `node scripts/e2e-preflight.mjs` trước lần e2e đầu.

## Review Focus

- Mở link có sẵn `?toa=<id>&view=expiring` (hoặc id rác): lần dựng đầu đã lọc đúng, id không thuộc quyền bị bỏ qua — test e2e ở Task 8.
- Đang ở trang 5, đổi bộ lọc khiến còn 3 dòng: bảng về trang 1, không hiện bảng rỗng — `paginate` kẹp trang (Task 2) và `usePager` đặt lại theo `resetKey` (Task 3).
- `localStorage` bị chặn/ném lỗi hoặc chứa giá trị lạ (`"7"`, `"abc"`): dùng 15, không vỡ trang — test Task 2.
- Tìm khách có dấu/không dấu, số điện thoại dạng `0901 234 567` hoặc `+84901234567`: khớp như tìm ở server — test Task 2.
- Tự lưu một thay đổi rồi quay lại tab danh sách: thấy số mới, không phải bản cache — test e2e Task 8.

---

### Task 1: Test e2e cho hành vi "không tải lại" (chạy đỏ trên code hiện tại, làm số đo "trước")

**Files:**
- Create: `tests/e2e/no-reload.spec.ts`

**Interfaces:**
- Produces: spec `no-reload.spec.ts` mà Task 8 chạy lại để xác nhận xanh.

- [ ] **Step 1: Viết test**

Đăng nhập như `perf.spec.ts` (nút `/^Admin/`). Đếm request tới server của trang bằng `page.on('request')`, lọc `request.headers()['rsc'] === '1'` hoặc URL chứa `_rsc=` hoặc `request.resourceType() === 'document'`.

```ts
test('quay lại tab đã mở không gọi server', async ({ page }) => {
  // bấm menu "Khách thuê", chờ bảng; bấm "Hợp đồng", chờ bảng
  // reset bộ đếm; bấm lại "Khách thuê"
  expect(serverRequests).toEqual([])           // không request RSC/document nào
  await expect(page.getByRole('table')).toBeVisible()
})
test('lọc, tìm, đổi trang, đổi số dòng không gọi server', async ({ page }) => {
  // vào /tenants, reset bộ đếm
  // gõ vào ô "Tìm tên, SĐT, passport, CCCD…", chọn "Nước ngoài", chọn 30 ở "Số dòng", bấm "Trang sau"
  expect(serverRequests).toEqual([])
  expect(page.url()).toContain('kind=foreign')
})
test('bảng mặc định 15 dòng', async ({ page }) => {
  // vào /contracts?view=active
  await expect(page.locator('tbody tr')).toHaveCount(Math.min(15, total)) // total đọc từ dòng "a–b trên n"
  await expect(page.getByText(/^1–\d+ trên \d+$/)).toBeVisible()
})
```

- [ ] **Step 2: Chạy, xác nhận đỏ và ghi số "trước"**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/no-reload.spec.ts`
Expected: FAIL cả 3 test; ghi số request đếm được ở 2 test đầu vào ghi chú để đưa vào PR.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/no-reload.spec.ts
git commit -m "test: e2e chuyển tab và lọc không gọi server"
```

### Task 2: Hàm thuần — phân trang, số dòng, quy tắc lọc

**Files:**
- Create: `src/lib/paginate.ts`, `src/lib/page-size.ts`, `src/domain/list-filters.ts`
- Test: `tests/unit/lib/paginate.test.ts`, `tests/unit/lib/page-size.test.ts`, `tests/unit/domain/list-filters.test.ts`

**Interfaces:**
- Produces:
  - `paginate(total: number, page: number, size: number): { page: number; pageCount: number; start: number; end: number }` — `pageCount >= 1`, `page` kẹp vào `[1, pageCount]`, `start` tính từ 0 (bao gồm), `end` (không bao gồm, ≤ total).
  - `PAGE_SIZES = [15, 30, 50, 100] as const`, `DEFAULT_PAGE_SIZE = 15`
  - `readPageSize(tableKey: string, storage?: Pick<Storage, 'getItem'> | null): number` — khoá `siris:page-size:<tableKey>`; trả 15 nếu thiếu, không thuộc `PAGE_SIZES`, hoặc storage ném lỗi.
  - `writePageSize(tableKey: string, size: number, storage?: Pick<Storage, 'setItem'> | null): void` — nuốt lỗi.
  - Mặc định `storage` lấy `globalThis.localStorage` bên trong try.
  - `matchesTenantQuery(searchText: string | null, q: string): boolean`
  - `type ContractView = 'active' | 'expiring' | 'unsigned' | 'ended'`; `matchesContractView(view: ContractView, lease: { status: string; signStatus: string; endDate: string }, today: string, warningDays: number): boolean`
  - `type InvoiceView = 'all' | 'draft' | 'unpaid' | 'overdue'`; `matchesInvoiceView(state: string, view: InvoiceView): boolean`
  - `matchesPeriod(periodStart: string, period: string | null): boolean`

- [ ] **Step 1: Viết test thất bại**

```ts
// paginate
expect(paginate(40, 1, 15)).toEqual({ page: 1, pageCount: 3, start: 0, end: 15 })
expect(paginate(40, 3, 15)).toEqual({ page: 3, pageCount: 3, start: 30, end: 40 })
expect(paginate(3, 5, 15)).toEqual({ page: 1, pageCount: 1, start: 0, end: 3 })   // kẹp trang
expect(paginate(0, 1, 15)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 })
// page-size
expect(readPageSize('tenants', { getItem: () => '30' })).toBe(30)
expect(readPageSize('tenants', { getItem: () => '7' })).toBe(15)
expect(readPageSize('tenants', { getItem: () => 'abc' })).toBe(15)
expect(readPageSize('tenants', { getItem: () => { throw new Error('blocked') } })).toBe(15)
expect(readPageSize('tenants', null)).toBe(15)
// ghi đúng khoá; storage ném lỗi thì không ném ra ngoài
writePageSize('tenants', 50, { setItem: spy }); expect(spy).toHaveBeenCalledWith('siris:page-size:tenants', '50')
expect(() => writePageSize('tenants', 50, { setItem: () => { throw new Error() } })).not.toThrow()
// tenant query (searchText lưu dạng không dấu, chữ thường như cột tenants.search_text)
expect(matchesTenantQuery('nguyen van an 0901234567', 'Nguyễn  Văn')).toBe(true)
expect(matchesTenantQuery('nguyen van an 0901234567', '0901 234 567')).toBe(true)
expect(matchesTenantQuery('nguyen van an 0901234567', '+84901234567')).toBe(true)
expect(matchesTenantQuery('nguyen van an', '')).toBe(true)
expect(matchesTenantQuery(null, 'an')).toBe(false)
// contract views (today '2026-11-18', warningDays 30)
expect(matchesContractView('expiring', { status: 'active', signStatus: 'signed', endDate: '2026-12-18' }, '2026-11-18', 30)).toBe(true)
expect(matchesContractView('expiring', { status: 'active', signStatus: 'signed', endDate: '2026-12-19' }, '2026-11-18', 30)).toBe(false)
expect(matchesContractView('unsigned', { status: 'ended', signStatus: 'exported', endDate: '2025-01-01' }, '2026-11-18', 30)).toBe(true)
expect(matchesContractView('active', { status: 'ended', signStatus: 'signed', endDate: '2025-01-01' }, '2026-11-18', 30)).toBe(false)
// invoice
expect(matchesInvoiceView('partial', 'unpaid')).toBe(true)
expect(matchesInvoiceView('overdue', 'unpaid')).toBe(false)
expect(matchesInvoiceView('paid', 'all')).toBe(true)
expect(matchesPeriod('2026-10-01', '2026-10')).toBe(true)
expect(matchesPeriod('2026-10-01', null)).toBe(true)
expect(matchesPeriod('2026-09-01', '2026-10')).toBe(false)
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `npx vitest run tests/unit/lib/paginate.test.ts tests/unit/lib/page-size.test.ts tests/unit/domain/list-filters.test.ts`
Expected: FAIL (module không tồn tại)

- [ ] **Step 3: Cài đặt**

`matchesTenantQuery` chép đúng chuẩn hoá của `searchTenants` (`src/server/tenants/service.ts:147-151`): `removeDiacritics(q).toLowerCase().replace(/\s+/g, ' ').trim()`, rồi `normalizePhone` từ `src/domain/phone.ts`; so khớp `includes` trên `searchText.toLowerCase()`. `matchesContractView` theo `listLeases` (`src/server/contracts/service.ts:227-229`): `expiring` = `status === 'active' && endDate <= addDays(today, warningDays)` (dùng `addDays` của `src/domain/dates.ts`); `unsigned` = `signStatus !== 'signed'`, mọi trạng thái. `matchesInvoiceView` chép hàm `matches` ở `src/app/(app)/invoices/page.tsx`.

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: lệnh ở Step 2. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/paginate.ts src/lib/page-size.ts src/domain/list-filters.ts tests/unit/lib/paginate.test.ts tests/unit/lib/page-size.test.ts tests/unit/domain/list-filters.test.ts
git commit -m "feat: hàm phân trang, nhớ số dòng và quy tắc lọc danh sách tại chỗ"
```

### Task 3: Thành phần dùng chung cho danh sách lọc tại chỗ

**Files:**
- Create: `src/components/list/use-list-params.ts`, `src/components/list/pager.tsx`, `src/components/list/param-chips.tsx`, `src/components/list/refresh-button.tsx`
- Modify: `src/components/list/facility-filter.tsx`

**Interfaces:**
- Consumes: `paginate`, `PAGE_SIZES`, `readPageSize`, `writePageSize` (Task 2); `parseFacilityFilter` (`src/lib/facility-filter.ts`).
- Produces (tất cả `'use client'`):
  - `useListParam(key: string): string | null` — đọc qua `useSearchParams()`.
  - `setListParams(patch: Record<string, string | null>): void` — dựng từ `window.location.search`, `null`/`''` thì xoá khoá, gọi `window.history.replaceState(null, '', url)`. Không dùng `router`.
  - `useFacilitySelection(allowedIds: string[]): string[]` — `parseFacilityFilter(useListParam('toa'))` lọc theo `allowedIds`.
  - `usePager<T>(rows: T[], tableKey: string, resetKey: string): { pageRows: T[]; pager: PagerProps }` — số dòng khởi tạo 15, đọc `readPageSize` trong `useEffect` (tránh lệch SSR); trang giữ trong state, về 1 khi `resetKey` hoặc số dòng đổi.
  - `Pager(props: PagerProps)` — hiện `"{start+1}–{end} trên {total}"` (khi total = 0: `"0 trên 0"`), select `aria-label="Số dòng"` với 15/30/50/100, nút `aria-label="Trang trước"` / `"Trang sau"`, chữ `Trang {page}/{pageCount}`.
  - `ParamChips({ param, items, defaultValue }: { param: string; items: { value: string; label: string; count?: number }[]; defaultValue: string })` — giao diện giống `FilterChips`, nút `<button>` gọi `setListParams({ [param]: value === defaultValue ? null : value })`, `aria-pressed` cho mục đang chọn.
  - `RefreshButton()` — `router.refresh()` trong `startTransition`; chữ "Làm mới", khi đang chạy disabled và chữ "Đang làm mới…".
  - `FacilityFilter({ facilities }: { facilities: { id: string; name: string }[] })` — bỏ prop `selected` và `router.replace`; đọc bằng `useFacilitySelection(facilities.map(f => f.id))`, ghi bằng `setListParams({ toa: ids.join(',') || null })`.

- [ ] **Step 1: Cài đặt các file trên**

- [ ] **Step 2: Kiểm tra kiểu và lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: không lỗi. Để các trang chưa chuyển vẫn biên dịch, `FacilityFilter` tạm nhận `selected?: string[]` (bỏ qua, đánh dấu comment "xoá ở Task 7").

- [ ] **Step 3: Commit**

```bash
git add src/components/list
git commit -m "feat: bộ lọc ghi URL không gọi server, phân trang và nút làm mới dùng chung"
```

### Task 4: Giữ trang đã xem và tải sẵn từ menu

**Files:**
- Modify: `next.config.ts`, `src/components/app-shell/sidebar.tsx`, `src/app/(app)/meters/page.tsx`
- Test: `tests/unit/next-config.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
it('giữ trang đã xem trong trình duyệt', () => {
  expect(nextConfig.experimental?.staleTimes).toEqual({ dynamic: 3600, static: 3600 })
})
```

- [ ] **Step 2: Chạy, xác nhận đỏ** — `npx vitest run tests/unit/next-config.test.ts` → FAIL

- [ ] **Step 3: Cài đặt**
  - `next.config.ts`: thêm `staleTimes: { dynamic: 3600, static: 3600 }` vào `experimental`, comment tiếng Việt nêu lý do (giữ tới khi F5 / tự lưu / bấm Làm mới).
  - `sidebar.tsx`: `Link` thêm `prefetch={true}`.
  - `meters/page.tsx`: thay `<form method="get">` bằng `Form` từ `next/form` (điều hướng mềm, không tải lại tài liệu); thêm `<RefreshButton />` vào `PageHeader` action. Dữ liệu điện nước vẫn lấy theo `facility`/`period` ở server.

- [ ] **Step 4: Chạy, xác nhận xanh** — lệnh Step 2 → PASS; `npx tsc --noEmit`.

- [ ] **Step 5: Kiểm chứng trên bản build production** (Next tắt prefetch khi `next dev`)

Build + start như Global Constraints. Mở `/`, xem tab Network: mỗi mục menu có một request prefetch trả nội dung trang (không chỉ khung `loading.tsx`); bấm qua lại các tab đã mở không có request mới. Nếu prefetch chỉ trả khung xám: thay `prefetch={true}` bằng `onMouseEnter={() => router.prefetch(href)}` và ghi lại kết quả vào ghi chú PR.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts src/components/app-shell/sidebar.tsx "src/app/(app)/meters/page.tsx" tests/unit/next-config.test.ts
git commit -m "perf: giữ trang đã xem trong trình duyệt và tải sẵn từ menu"
```

### Task 5: Khách thuê — nạp đủ một lần, lọc và phân trang tại chỗ

**Files:**
- Modify: `src/server/tenants/service.ts:132-160`, `src/app/(app)/tenants/page.tsx`, `src/features/tenants/components/tenant-search.tsx`
- Create: `src/features/tenants/components/tenant-list.tsx`
- Test: `tests/integration/tenants.test.ts`

**Interfaces:**
- Consumes: Task 2 (`matchesTenantQuery`), Task 3 (`useListParam`, `setListParams`, `useFacilitySelection`, `usePager`, `Pager`, `FacilityFilter`, `RefreshButton`).
- Produces: `searchTenants` nhận `limit?: number | null` — `null` thì không giới hạn; mặc định vẫn 50 (trang tạo hợp đồng truyền 500, giữ nguyên).
- `TenantList({ tenants, facilities, visaWarningDays }: { tenants: Tenant[]; facilities: { id: string; name: string }[]; visaWarningDays: number })`.

- [ ] **Step 1: Viết test thất bại** trong `tests/integration/tenants.test.ts`: tạo 60 khách trong cùng cơ sở; `searchTenants(db, ctx, {})` trả 50; `searchTenants(db, ctx, { limit: null })` trả 60.

- [ ] **Step 2: Chạy, xác nhận đỏ** — `npx vitest run tests/integration/tenants.test.ts` → FAIL (kiểu/hành vi)

- [ ] **Step 3: Cài đặt**
  - Service: chỉ gọi `.limit()`/`.offset()` khi `limit !== null`.
  - `TenantSearch`: giữ ô tìm (debounce 300ms) và select loại khách, ghi bằng `setListParams` thay cho `router.replace`.
  - `TenantList`: lọc `q` (`matchesTenantQuery(t.searchText, q)`), `kind`, cơ sở (`homeFacilityId`); `usePager(filtered, 'tenants', `${q}|${kind}|${toa}`)`; hiện `FacilityFilter`, `TenantSearch`, `TenantTable` với `pageRows`, `Pager`.
  - Trang: bỏ `searchParams`; `searchTenants(db, ctx, { limit: null })`; action của `PageHeader` thêm `<RefreshButton />` cạnh "Thêm khách".

- [ ] **Step 4: Chạy, xác nhận xanh** — lệnh Step 2 → PASS; `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit** — `feat: khách thuê lọc, tìm và phân trang tại chỗ`

### Task 6: Hợp đồng và Hoá đơn — lọc và phân trang tại chỗ

**Files:**
- Modify: `src/app/(app)/contracts/page.tsx`, `src/app/(app)/invoices/page.tsx`
- Create: `src/features/contracts/components/contract-list.tsx`, `src/features/invoices/components/invoice-list.tsx`

**Interfaces:**
- Consumes: Task 2 (`matchesContractView`, `matchesInvoiceView`, `matchesPeriod`), Task 3 (tất cả).
- `ContractList({ leases, deposits, facilities, today, warningDays })` — `leases: LeaseListItem[]`, `deposits` là kết quả `listDepositContracts`, `today: string` (tính ở server bằng `todayVN()`), `warningDays: number` (`settings.contractWarningDays`).
- `InvoiceList({ invoices, facilities })` — `invoices` là kết quả `listInvoices`.

- [ ] **Step 1: Cài đặt**
  - Hợp đồng: trang gọi `listLeases(db, ctx, {})` và `listDepositContracts(db, ctx, { status: 'pending' })` song song; bỏ `searchParams`. `ContractList` dùng `ParamChips` `param="view"` `defaultValue="active"` với 5 mục và nhãn hiện có (`VIEWS`); view `deposits` hiện dòng cọc, các view khác lọc `matchesContractView`; lọc cơ sở theo `facilityId`; `usePager(rows, 'contracts', `${view}|${toa}`)`. Giữ nguyên cột và kiểu hiển thị của bảng hiện tại.
  - Hoá đơn: trang gọi `listInvoices(db, ctx, {})`; bỏ `searchParams`. `InvoiceList`: `ParamChips` `param="view"` `defaultValue="all"` kèm `count` tính trên dòng đã lọc kỳ + cơ sở; ô `type="month"` `aria-label="Kỳ"` ghi `setListParams({ period })` khi đổi (bỏ nút "Lọc kỳ"); `usePager(rows, 'invoices', `${view}|${period}|${toa}`)`.
  - Cả hai trang thêm `<RefreshButton />` vào action của `PageHeader`.

- [ ] **Step 2: Kiểm tra** — `npx tsc --noEmit && npm run lint && npx vitest run tests/integration/contracts.test.ts tests/integration/invoices.test.ts` → không lỗi, PASS.

- [ ] **Step 3: Commit** — `feat: hợp đồng và hoá đơn lọc, phân trang tại chỗ`

### Task 7: Cơ sở & phòng, Tài sản, Sự cố

**Files:**
- Modify: `src/app/(app)/facilities/page.tsx`, `src/app/(app)/assets/page.tsx`, `src/app/(app)/incidents/page.tsx`, `src/features/assets/components/asset-table.tsx`, `src/features/assets/components/stock-table.tsx`
- Create: `src/features/facilities/components/room-list.tsx`, `src/features/assets/components/assets-view.tsx`, `src/features/incidents/components/incident-list.tsx`

**Interfaces:**
- Consumes: Task 3.
- `RoomList({ rooms, facilities })` — `rooms` từ `listRoomsWithStatus(db, ctx, {})`.
- `AssetsView({ facilities, tree, assets, stock })` — `FacilityFilter` + `StockTable` + `AssetTable`, lọc theo `facilityId`.
- `AssetTable` và `StockTable` tự phân trang: `usePager(rows, 'assets' | 'stock', resetKey)` với `resetKey` là chuỗi id các dòng đầu vào (đổi khi bộ lọc đổi).
- `IncidentList({ items, facilities, userId })` — `items: (BoardItem & { facilityId: string; assigneeId: string | null })[]`; `ParamChips` `param="mine"` (`''` = Tất cả, `'1'` = Việc của tôi); không phân trang (bảng Kanban).

- [ ] **Step 1: Cài đặt** — cả ba trang bỏ `searchParams`, gọi service không truyền `facilityIds`/`assigneeId`, thêm `<RefreshButton />` vào action. Xoá prop `selected` tạm của `FacilityFilter`.

- [ ] **Step 2: Kiểm tra toàn bộ tĩnh** — `npx tsc --noEmit && npm run lint && npm test` → không lỗi, PASS.

- [ ] **Step 3: Commit** — `feat: cơ sở, tài sản, sự cố lọc tại chỗ`

### Task 8: Xác nhận e2e và đo sau

**Files:**
- Modify: `tests/e2e/no-reload.spec.ts`

- [ ] **Step 1: Bổ sung test cho Review Focus**

```ts
test('link có sẵn bộ lọc dựng đúng ngay lần đầu', async ({ page }) => {
  // goto /contracts?view=expiring&toa=<id cơ sở đầu tiên>,00000000-0000-0000-0000-000000000000
  // chip "Sắp hết hạn" aria-pressed="true"; nút cơ sở hiện "Toà (1)"
})
test('tự lưu rồi quay lại thấy dữ liệu mới', async ({ page }) => {
  // vào /tenants, ghi nhớ tổng "trên n"; vào /tenants/new, tạo khách tên ngẫu nhiên, lưu
  // bấm menu "Khách thuê": tổng là n+1, tìm theo tên thấy khách vừa tạo
})
```

- [ ] **Step 2: Build production và chạy riêng spec này**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/no-reload.spec.ts`
Expected: PASS cả 5 test. Ghi số request "sau" (0 ở hai test đầu) cạnh số "trước" của Task 1.

- [ ] **Step 3: Chạy toàn bộ e2e một lần** — `E2E_BASE_URL=http://localhost:3000 npm run test:e2e` → PASS (nếu đỏ, dùng `ai-rules-handling-failures`).

- [ ] **Step 4: Commit** — `test: e2e link có bộ lọc và cập nhật sau khi tự lưu`
