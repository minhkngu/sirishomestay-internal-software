# Tách trang Cơ sở và trang Phòng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách `/facilities` (Cơ sở) và `/rooms` (Phòng, lưới ô xanh/xám có hover), thêm diện tích/giường/tiện ích cho phòng, bỏ nút "Làm mới" ở mọi trang.

**Architecture:** Theo N-Layer của dự án: quy tắc thuần ở `src/domain/`, truy vấn ở `src/server/`, giao diện ở `src/features/`, route mỏng ở `src/app/(app)/`. Tiện ích là bảng danh mục + bảng nối với phòng. Dữ liệu hover (giá thuê, tiền cọc) mở rộng `listRoomsWithStatus`, tính theo lô và theo quyền.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + Postgres, zod, Vitest + PGlite, Playwright. Trước khi viết code Next.js, đọc `node_modules/next/dist/docs/` (xem AGENTS.md).

**Spec:** `docs/superpowers/specs/2026-11-18-tach-trang-co-so-phong-design.md`

## Global Constraints

- Chuỗi giao diện, comment, commit viết tiếng Việt; commit dạng `feat:` / `fix:` / `docs:`; mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Không sửa tay file trong `drizzle/`; sửa `src/db/schema/` rồi `npm run db:generate`.
- Quy tắc import: `features`/`components` không import `db`; một feature không import feature khác; chỉ `app` import `features`. `npm run lint` kiểm tra.
- Service nhận `(db, ctx, input)`, kiểm quyền bằng `assertCan`/`can`; server action bọc service bằng `guard` (xem `src/server/rooms/actions.ts`) rồi `revalidatePath`.
- Màu ô phòng: **có khách = xanh** (`occupied`, `ending_soon`, `occupied_with_next`), **không có khách = xám** (`vacant`, `deposited`). "Phòng trống" = `vacant`. Ô không có khách không hiện khung hover.
- Hover chỉ hiện: tên khách, giá thuê tháng, tiền cọc đã nhận, ngày hết hạn hợp đồng. Tên khách và ngày hết hạn cần `tenants_contracts` của toà; giá thuê và tiền cọc cần `tenants_contracts` hoặc `billing`.
- Không đổi quyền hiện có (`isAdmin` ở giao diện, `settings` ở server).
- Đang ở nhánh `tach-trang-co-so-phong`; không commit lên `main`.

## Review Focus

1. Người chỉ có quyền `meters` xem `/rooms`: hover/ô không lộ tên khách, giá thuê, tiền cọc, ngày hết hạn (Task 5).
2. Tiện ích đã ngừng dùng: vẫn hiện trên phòng đã gắn, không chọn được cho phòng mới, sửa phòng cũ không làm mất nó (Task 4).
3. Tạo nhanh dải phòng có mã đã tồn tại: giường/diện tích/tiện ích chỉ áp cho phòng mới tạo, không đè phòng cũ (Task 4).
4. Tên tiện ích trùng khác hoa thường hoặc thừa khoảng trắng ("Wifi" và " wifi ") bị từ chối (Task 3).
5. Bộ lọc toà không có phòng nào: hiện "0 phòng trống / 0 phòng" và trạng thái rỗng, không lỗi; phòng có hợp đồng nhưng chưa thu cọc hiện cọc 0 (Task 1, 5, 8).

---

### Task 1: Quy tắc đếm phòng trống và nhóm màu (domain)

**Files:**
- Create: `src/domain/room-occupancy.ts`
- Test: `tests/unit/domain/room-occupancy.test.ts`

**Interfaces:**
- Produces: `hasTenant(status: RoomStatus): boolean`; `vacancySummary(rooms: { status: RoomStatus }[]): { vacant: number; total: number }`.

- [ ] **Step 1: Viết test thất bại.** `hasTenant` đúng cho `occupied`, `ending_soon`, `occupied_with_next`; sai cho `vacant`, `deposited`. `vacancySummary` của `[vacant, deposited, occupied, vacant]` là `{ vacant: 2, total: 4 }`; của `[]` là `{ vacant: 0, total: 0 }`.
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/domain/room-occupancy.test.ts`, mong đợi FAIL (chưa có module).
- [ ] **Step 3: Cài đặt hai hàm trong `src/domain/room-occupancy.ts`** (thuần, import kiểu `RoomStatus` từ `./room-status`).
- [ ] **Step 4: Chạy lại test**, mong đợi PASS.
- [ ] **Step 5: Commit** `feat: quy tắc đếm phòng trống và phòng có khách` (kèm spec và plan trong `docs/superpowers/`).

### Task 2: Schema và migration (giường, tiện ích)

**Files:**
- Modify: `src/db/schema/facilities.ts` (thêm `beds: integer('beds')` vào `rooms`, cho phép null)
- Create: `src/db/schema/amenities.ts`; Modify: `src/db/index.ts` (export)
- Generate: `drizzle/0022_*.sql` bằng `npm run db:generate`
- Test: `tests/integration/schema.test.ts` (thêm case)

**Interfaces:**
- Produces: bảng `amenities` (`id` uuid PK, `name` text not null, `isActive` boolean default true, `createdAt`), bảng nối `roomAmenities` (`roomId` → rooms, `amenityId` → amenities, khoá chính ghép hai cột); cột `rooms.beds` (integer, null).

- [ ] **Step 1: Viết test thất bại** trong `schema.test.ts`: chèn một phòng với `beds: 2`, một tiện ích, một dòng `roomAmenities`; chèn trùng cặp `(roomId, amenityId)` lần hai báo lỗi `unique|duplicate`.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/schema.test.ts`, mong đợi FAIL.
- [ ] **Step 3: Sửa schema theo Interfaces**, chạy `npm run db:generate`, kiểm tra file SQL sinh ra chỉ có `ALTER TABLE rooms ADD beds` và hai `CREATE TABLE`.
- [ ] **Step 4: Chạy lại test**, mong đợi PASS.
- [ ] **Step 5: Commit** `feat: thêm cột giường và bảng tiện ích cho phòng`.

### Task 3: Dịch vụ danh mục tiện ích

**Files:**
- Create: `src/server/amenities/schemas.ts`, `service.ts`, `actions.ts`
- Test: `tests/integration/amenities.test.ts`

**Interfaces:**
- Consumes: bảng `amenities` (Task 2).
- Produces:
  - `type Amenity = typeof amenities.$inferSelect`
  - `listAmenities(db, ctx, opts?: { includeArchived?: boolean }): Promise<Amenity[]>` (sắp theo tên; mặc định chỉ đang dùng; không đòi quyền riêng)
  - `createAmenity(db, ctx, input: unknown): Promise<Amenity>`, `updateAmenity(db, ctx, id: string, input: unknown): Promise<Amenity>` (input `{ name?: string; isActive?: boolean }`); cả hai `assertCan(ctx, 'settings')`, ghi `recordAudit`
  - `createAmenityAction(input: unknown)`, `updateAmenityAction(id: string, input: unknown)`: bọc `guard`, `revalidatePath('/settings')` và `revalidatePath('/rooms')`
  - tên: `trim`, 1–50 ký tự, báo `'Nhập tên tiện ích'`; trùng không phân biệt hoa thường → `ValidationError('Tiện ích đã tồn tại', { name: 'Tiện ích đã tồn tại' })`

- [ ] **Step 1: Viết test thất bại** (theo kiểu `facilities-rooms.test.ts`): tạo "Wifi" rồi tạo " wifi " → ValidationError (Review Focus 4); đổi tên thành tên đã có → ValidationError; `updateAmenity(..., { isActive: false })` làm `listAmenities` mặc định không còn nó nhưng `includeArchived: true` còn; người không có `settings` gọi `createAmenity` → `ForbiddenError`.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/amenities.test.ts`, mong đợi FAIL.
- [ ] **Step 3: Cài đặt service, schemas, actions** theo Interfaces, theo mẫu `src/server/facilities/`.
- [ ] **Step 4: Chạy lại test**, mong đợi PASS.
- [ ] **Step 5: Commit** `feat: quản lý danh mục tiện ích`.

### Task 4: Phòng có diện tích, giường, tiện ích (tạo, sửa, tạo nhanh, chi tiết)

**Files:**
- Modify: `src/server/rooms/schemas.ts`, `src/server/rooms/service.ts`
- Test: `tests/integration/facilities-rooms.test.ts`

**Interfaces:**
- Consumes: `amenities`, `roomAmenities`, `rooms.beds` (Task 2).
- Produces:
  - `roomInput` thêm `beds: optInt` và `amenityIds: z.array(z.string().uuid()).default([])`; `roomUpdateInput` giữ dạng partial; `bulkInput` thêm `areaM2: z.number().nonnegative().nullish()`, `beds: optInt`, `amenityIds` như trên.
  - `createRoom`/`updateRoom`/`createRoomsBulk` ghi `beds`, `areaM2` và thay tập `roomAmenities` (không đẩy `amenityIds` vào `values` của bảng `rooms`).
  - Tiện ích mới gắn vào phòng phải đang dùng; khi sửa phòng, id đã gắn từ trước (kể cả đã ngừng dùng) vẫn được giữ. Id không tồn tại hoặc đã ngừng dùng mà chưa gắn → `ValidationError('Tiện ích không hợp lệ', { amenityIds: ... })`.
  - `createRoomsBulk` chỉ gắn giường/diện tích/tiện ích cho phòng **mới tạo**; phòng đã có mã trùng (`skipped`) giữ nguyên.
  - `getRoomDetail(...)` trả thêm `amenities: { id: string; name: string }[]` (kể cả tiện ích đã ngừng dùng).

- [ ] **Step 1: Viết test thất bại** trong `facilities-rooms.test.ts`: (a) `createRoom` với `areaM2: 25.5, beds: 2, amenityIds: [wifi, mayLanh]` → `getRoomDetail(...).amenities` có đúng hai tiện ích, `room.beds` bằng 2; (b) tiện ích đã ngừng dùng không gắn được cho phòng mới; (c) phòng đã gắn "Wifi", ngừng dùng "Wifi", `updateRoom` đổi `beds` và gửi lại cùng `amenityIds` → vẫn còn "Wifi" (Review Focus 2); (d) `updateRoom` với `amenityIds: []` xoá hết tiện ích; (e) `createRoomsBulk` dải 101–103 khi 102 đã có với `beds: 1, amenityIds: [wifi]` → phòng 101, 103 có giường 1 và Wifi, phòng 102 vẫn `beds` null và không có tiện ích (Review Focus 3).
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/facilities-rooms.test.ts`, mong đợi các case mới FAIL.
- [ ] **Step 3: Cài đặt theo Interfaces.** `createRoomsBulk` lấy id phòng mới bằng `.returning({ id, code })`.
- [ ] **Step 4: Chạy lại cả file test**, mong đợi PASS (các test cũ không hỏng).
- [ ] **Step 5: Commit** `feat: phòng có diện tích, giường và tiện ích`.

### Task 5: Dữ liệu hover của danh sách phòng

**Files:**
- Modify: `src/server/rooms/service.ts` (`RoomWithStatus`, `listRoomsWithStatus`)
- Test: `tests/integration/room-visibility.test.ts`

**Interfaces:**
- Produces: `RoomWithStatus` thêm `monthlyRent?: number | null; depositBalance?: number | null`. Chỉ có khi phòng có hợp đồng `active` **và** người gọi `can(ctx,'tenants_contracts',facilityId) || can(ctx,'billing',facilityId)`. `depositBalance` tính bằng `depositBalance()` của `src/domain/deposit.ts` trên các dòng `depositEntries` của hợp đồng đó. Lấy cọc bằng một truy vấn `inArray(leaseId, ...)` cho cả danh sách, không gọi từng phòng.

- [ ] **Step 1: Viết test thất bại** trong `room-visibility.test.ts` (dùng hợp đồng giá 9.000.000 của test hiện có, thêm một dòng cọc `collect` 9.000.000 `done` và một dòng `pending` 1.000.000): người có `billing` → `monthlyRent` 9000000, `depositBalance` 9000000 (dòng `pending` không tính), không có `tenantName`; người có `tenants_contracts` → có cả `tenantName`, `leaseEndDate`, tiền; người chỉ có `meters` → không có `monthlyRent`, `depositBalance`, `tenantName`, `leaseEndDate` (Review Focus 1); phòng đang có hợp đồng chưa thu cọc → `depositBalance` bằng 0; phòng trống → không có hai trường này.
- [ ] **Step 2: Chạy** `npx vitest run tests/integration/room-visibility.test.ts`, mong đợi FAIL.
- [ ] **Step 3: Cài đặt** trong `listRoomsWithStatus`: lấy thêm `leases.id` và `leases.monthlyRent`, rồi một truy vấn cọc theo lô.
- [ ] **Step 4: Chạy lại cả file**, mong đợi PASS (test cũ về `getRoomDetail` không đổi).
- [ ] **Step 5: Commit** `feat: danh sách phòng trả giá thuê và tiền cọc theo quyền`.

### Task 6: Tab "Tiện ích" trong Cài đặt

**Files:**
- Create: `src/features/settings/components/amenity-settings.tsx`
- Modify: `src/features/settings/components/settings-tabs.tsx`, `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `listAmenities`, `createAmenityAction`, `updateAmenityAction`, `Amenity` (Task 3).
- Produces: `AmenitySettings({ amenities }: { amenities: { id: string; name: string; isActive: boolean }[] })`; `SettingsTabs` nhận thêm prop `amenities` cùng kiểu và thêm tab `value="amenities"` nhãn "Tiện ích".

- [ ] **Step 1: Cài đặt `AmenitySettings`**: danh sách tiện ích (tên sửa được, nút Lưu; nút "Ngừng dùng"/"Dùng lại"), form "Thêm tiện ích"; dùng `useRun` và `Msg` như các tab khác trong `settings-tabs.tsx`.
- [ ] **Step 2: Nối vào `SettingsTabs` và `settings/page.tsx`** (`listAmenities(db, ctx, { includeArchived: true })` trong `Promise.all`).
- [ ] **Step 3: Kiểm** `npx tsc --noEmit && npm run lint`, mong đợi không lỗi.
- [ ] **Step 4: Kiểm tay** trên `npm run dev`: thêm "Wifi", đổi tên, ngừng dùng, tải lại vẫn đúng.
- [ ] **Step 5: Commit** `feat: tab Tiện ích trong Cài đặt`.

### Task 7: Form tạo phòng dùng chung và form sửa phòng

**Files:**
- Modify: `src/features/rooms/components/room-panels.tsx`, `src/app/(app)/facilities/[id]/page.tsx`, `src/app/(app)/rooms/[id]/page.tsx`
- Create: `src/features/rooms/components/room-edit-form.tsx`

**Interfaces:**
- Consumes: `createRoomAction`, `createRoomsBulkAction`, `updateRoomAction`, `listAmenities`, `getRoomDetail().amenities` (Task 3, 4).
- Produces:
  - `RoomPanels(props: { amenities: { id: string; name: string }[]; facilities: { id: string; name: string }[]; facilityId?: string })`: nếu có `facilityId` thì dùng cố định và ẩn ô chọn cơ sở; nếu không, hiện ô "Cơ sở" (`<select>`, nhãn "Cơ sở") chọn từ `facilities`. Cả form "Thêm phòng" và "Tạo nhanh nhiều phòng" thêm ô Diện tích (m²), Giường, và nhóm checkbox Tiện ích. Nhãn ô giữ nguyên các nhãn cũ để e2e cũ còn chạy.
  - `RoomEditForm(props: { room: { id: string; code: string; floor: string | null; roomType: string | null; areaM2: string | null; beds: number | null; listPrice: number | null; capacity: number | null }; amenities: { id: string; name: string; isActive: boolean }[]; selectedIds: string[] })`: gọi `updateRoomAction`; tiện ích đã ngừng dùng chỉ hiện nếu đang được gắn.
- Trang `/rooms/[id]` hiện diện tích, giường, tiện ích trong khối thuộc tính phòng; `RoomEditForm` chỉ hiện khi `ctx.isAdmin`. Đổi chữ liên kết quay lại thành "← Danh sách phòng" trỏ tới `/rooms`. Trang `/facilities/[id]` truyền `facilityId` và `amenities` cho `RoomPanels`.

- [ ] **Step 1: Cài đặt `RoomPanels` mới và `RoomEditForm`** theo Interfaces.
- [ ] **Step 2: Cập nhật hai trang chi tiết** theo Interfaces.
- [ ] **Step 3: Kiểm** `npx tsc --noEmit && npm run lint`.
- [ ] **Step 4: Kiểm tay**: ở `/facilities/[id]` tạo phòng có giường và tiện ích, mở `/rooms/[id]` thấy thông tin, sửa lại được.
- [ ] **Step 5: Commit** `feat: form phòng có diện tích, giường, tiện ích và sửa phòng`.

### Task 8: Trang Phòng `/rooms` (lưới ô, hover, đếm phòng trống, tạo phòng)

**Files:**
- Create: `src/features/rooms/components/room-cell.tsx`, `src/features/rooms/components/room-grid.tsx`, `src/app/(app)/rooms/page.tsx`
- Modify: `src/features/rooms/components/room-map.tsx`, `src/components/app-shell/nav.ts`, `src/app/(app)/facilities/page.tsx`
- Delete: `src/features/facilities/components/room-list.tsx` (sau khi không còn nơi dùng)

**Interfaces:**
- Consumes: `hasTenant`, `vacancySummary` (Task 1); `RoomWithStatus` có `monthlyRent`, `depositBalance` (Task 5); `RoomPanels` (Task 7); `FacilityFilter`, `useFacilitySelection` từ `@/components/list/`.
- Produces:
  - `RoomCell(props: { room: { id: string; code: string; status: RoomStatus; tenantName?: string | null; monthlyRent?: number | null; depositBalance?: number | null; leaseEndDate?: string | null } })`: liên kết tới `/rooms/${id}`; xanh nếu `hasTenant(status)`, xám nếu không; phòng `deposited` có nhãn nhỏ "Đã cọc"; `ending_soon` có viền cảnh báo nhưng vẫn xanh. Khung hover (hiện khi hover và focus bàn phím) chỉ render khi `hasTenant` và có ít nhất một trường dữ liệu; mỗi trường chỉ hiện khi có giá trị: khách, "Giá thuê" (`formatVND`), "Đã cọc" (`formatVND`), "Hết hạn" (`formatDateVN`).
  - `RoomGrid(props: { rooms: RoomWithStatus-like[]; facilities: { id: string; name: string }[] })` (client): lọc theo `useFacilitySelection`, hiện "N phòng trống / M phòng" bằng `vacancySummary` trên phòng đã lọc, gom theo toà rồi theo tầng, dùng `RoomCell`; không có phòng thì dùng `EmptyState` (`@/components/list/empty-state`) với title "Chưa có phòng phù hợp."
  - `/rooms` (server): `PageHeader title="Phòng"` không có nút làm mới; admin thấy `RoomPanels` (không truyền `facilityId`, truyền `facilities` và `amenities`); nạp `listRoomsWithStatus(db, ctx, {})`.
  - `RoomMap` (trang chi tiết toà) dùng `RoomCell` để màu khớp; giữ bộ lọc trạng thái hiện có.
  - Menu: `{ href: '/facilities', label: 'Cơ sở' }` và `{ href: '/rooms', label: 'Phòng', icon: DoorOpen }` ngay sau; `/facilities` bỏ `RoomList`, tiêu đề "Cơ sở", giữ các liên kết tới từng toà và `NewFacilityButton`.

- [ ] **Step 1: Cài đặt `RoomCell`**, đổi `RoomMap` dùng nó.
- [ ] **Step 2: Cài đặt `RoomGrid` và trang `/rooms`**, thêm mục menu, sửa `/facilities` (danh sách cơ sở dạng thẻ hoặc bảng có tên, mã, địa chỉ và liên kết tới `/facilities/[id]`; giữ liên kết có tên toà vì e2e cũ bấm `link /Thảo Điền/`).
- [ ] **Step 3: Xoá `room-list.tsx`**, chạy `npx tsc --noEmit && npm run lint`, mong đợi không lỗi import.
- [ ] **Step 4: Kiểm tay** trên `npm run dev` bằng tài khoản admin và một tài khoản chỉ có `meters`: màu đúng, số phòng trống đúng, hover đúng quyền, lọc toà không có phòng hiện trạng thái rỗng.
- [ ] **Step 5: Commit** `feat: trang Phòng dạng lưới và tách khỏi trang Cơ sở`.

### Task 9: Bỏ nút "Làm mới" ở mọi trang

**Files:**
- Modify: `src/app/(app)/{invoices,contracts,tenants,meters,assets,incidents}/page.tsx` (`facilities/page.tsx` đã sửa ở Task 8)
- Delete: `src/components/list/refresh-button.tsx`

- [ ] **Step 1: Gỡ `<RefreshButton />` và dòng import** ở 6 trang trên; trang `meters` có `action={<RefreshButton />}` thì bỏ prop `action`.
- [ ] **Step 2: Xoá `refresh-button.tsx`**, chạy `grep -rn "RefreshButton\|refresh-button" src tests` mong đợi không còn kết quả.
- [ ] **Step 3: Chạy** `npx tsc --noEmit && npm run lint`, mong đợi không lỗi.
- [ ] **Step 4: Commit** `feat: bỏ nút Làm mới ở các trang danh sách`.

### Task 10: Kiểm thử e2e và rà soát cuối

**Files:**
- Create: `tests/e2e/rooms-page.spec.ts`

- [ ] **Step 1: Chạy** `node scripts/e2e-preflight.mjs` (theo CLAUDE.md) trước khi chạy e2e.
- [ ] **Step 2: Viết e2e** (dùng hàm `login` như các spec cũ): Admin vào `/rooms`, mở "Tạo nhanh nhiều phòng", chọn cơ sở "Thảo Điền", tiền tố duy nhất theo `Date.now()`, tầng 9, từ 901 đến 902, bấm Tạo; thấy "Đã tạo 2 phòng" và hai ô mới hiện trên lưới (xám, không có khung hover). Thêm: ô phòng đang có khách có khung hover chứa "Giá thuê" khi Admin rê chuột; Hùng (`/^Hùng/`, chỉ xem trạng thái) rê chuột vào cùng loại ô không thấy "Giá thuê" và không thấy tên khách.
- [ ] **Step 3: Chạy** `E2E_BASE_URL=<môi trường thử> npx playwright test tests/e2e/rooms-page.spec.ts`, mong đợi PASS; rồi chạy riêng các spec cũ có đi qua `/facilities` (`incidents`, `contract-create-one-page`, `dot-1`, `dot-2`, `no-reload`), mong đợi PASS.
- [ ] **Step 4: Chạy** `npm test`, `npm run lint`, `npm run build`, mong đợi đều qua.
- [ ] **Step 5: Commit** `test: e2e trang Phòng`.
