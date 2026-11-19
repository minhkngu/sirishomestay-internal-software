# Popup cho thao tác "thêm mới" — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi thao tác "thêm" mở popup ngay trên trang đang xem (không tải trang mới), và quy tắc này được ghi vào `CLAUDE.md` cho các tính năng sau.

**Architecture:** Nhóm A (trang riêng `/<mục>/new`): một slot parallel route `@modal` đặt ở `src/app/(app)/`, mỗi mục có một route chặn `(.)<mục>/new` render cùng component thân trang với `new/page.tsx` trong khung `RouteModal`. Nhóm B (form đang mở ngay trong trang): bọc form sẵn có vào `FormDialog`. Cả hai dùng chung `FormDialog` (khung `Dialog` của dự án).

**Tech Stack:** Next.js 16 App Router (parallel + intercepting routes), React 19, `@base-ui/react` Dialog (`src/components/ui/dialog.tsx`), sonner, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-popup-cho-thao-tac-them-moi-design.md`

## Global Constraints

- Đọc `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md` và `parallel-routes.md` trước khi viết route (AGENTS.md).
- Không đổi nội dung form, zod, quyền, server action.
- Kiến trúc N-Layer: route mỏng ở `src/app`; giao diện ở `src/features/<tên>/components`; `src/components/` dùng chung; một feature không import feature khác; chỉ `app` import `features`.
- Chuỗi giao diện, comment, commit viết tiếng Việt; commit dạng `feat:`/`fix:`/`docs:`. Chỉ commit khi người dùng yêu cầu; không commit trên `main`.
- Đóng popup bằng Esc/nút đóng gọi `router.back()`. Mở thẳng đường dẫn, F5, hoặc mở tab mới phải ra trang đầy đủ.
- Dev server không nhận thư mục route mới: sau khi tạo/xoá thư mục route phải dừng và `preview_start` lại `siris-dev`.
- Không xoá hay sửa test e2e hiện có để qua; nếu test cũ gãy vì popup thì sửa cho đúng hành vi mới và nói rõ trong báo cáo.
- Không chạy e2e (tạo dữ liệu `E2E…` trong DB) khi chưa hỏi người dùng dùng `E2E_BASE_URL` nào; chạy `node scripts/e2e-preflight.mjs` trước.

## Review Focus

1. Gửi form lỗi kiểm tra (để trống bắt buộc): popup ở lại, hiện lỗi, URL không đổi.
2. Đóng popup bằng Esc hoặc nút Back của trình duyệt quay về đúng URL cũ, giữ nguyên bộ lọc (ví dụ `/tenants?q=an`).
3. Tạo xong, danh sách phía sau có dòng mới mà không cần F5 (next.config có `staleTimes`, nên cần `router.refresh()`).
4. Tài khoản không có quyền mở `/users/new` bằng popup: thấy trang "không tìm thấy", không treo hay trắng.
5. Mở `/<mục>/new` thẳng hoặc F5: trang đầy đủ có tiêu đề, không có khung popup.

---

### Task 1: Hạ tầng popup dùng chung và dời hợp đồng lên slot chung

**Files:**
- Create: `src/components/form-dialog.tsx`, `src/components/route-modal.tsx`
- Create: `src/app/(app)/@modal/default.tsx`, `src/app/(app)/@modal/page.tsx`, `src/app/(app)/@modal/[...catchAll]/page.tsx`
- Create: `src/app/(app)/@modal/(.)contracts/[id]/page.tsx`, `src/app/(app)/@modal/(.)contracts/new/page.tsx`
- Create: `tests/e2e/popup-them-moi.spec.ts`
- Modify: `src/app/(app)/layout.tsx` (nhận prop `modal`, render sau `children` trong `AppShell`)
- Modify: `src/app/(app)/contracts/contract-detail.tsx:196-205` (thẻ `<a>` → `Link`, bỏ chú thích cũ)
- Delete: `src/app/(app)/contracts/@modal/` (cả thư mục), `src/app/(app)/contracts/layout.tsx`, `src/features/contracts/components/contract-detail-modal.tsx`, `src/features/contracts/components/new-contract-modal.tsx`

**Interfaces:**
- Produces: `FormDialog({ title: string; description?: string; open: boolean; onOpenChange: (open: boolean) => void; size?: 'sm' | 'md' | 'lg' | 'full'; children: ReactNode })` — `'use client'`, bọc `Dialog` + `DialogContent` + `DialogHeader`; thân cuộn dọc. `size`: `sm` → `sm:max-w-md`, `md` → `sm:max-w-xl`, `lg` → `sm:max-w-3xl`, `full` → `h-[94vh] w-[96vw] sm:max-w-none` (như popup chi tiết hợp đồng cũ). Mặc định `md`.
- Produces: `RouteModal({ title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'full'; children: ReactNode })` — `'use client'`, render `FormDialog` luôn mở, `onOpenChange(false)` gọi `router.back()`.
- Produces: quy ước các Task 2–4 theo: mỗi mục thêm `src/app/(app)/@modal/(.)<mục>/new/page.tsx` bọc thân trang bằng `RouteModal`; `@modal/default.tsx`, `page.tsx`, `[...catchAll]/page.tsx` đều `return null` (để popup đóng khi điều hướng sang trang không chặn).

- [ ] **Step 1: Viết test e2e thất bại** trong `tests/e2e/popup-them-moi.spec.ts` (copy khung `login` từ `tests/e2e/incidents.spec.ts`, `test.skip` khi thiếu `E2E_BASE_URL`): `test('tạo hợp đồng thuê từ trang khách hiện popup, F5 ra trang đầy đủ, Esc quay lại')` — vào `/tenants`, bấm link tên khách đầu tiên, bấm link `+ Tạo hợp đồng thuê`; assert `getByRole('dialog')` thấy được và `page.url()` kết thúc `/contracts/new?tenant=<id>`; `page.reload()` rồi assert `getByRole('dialog')` có count 0 và `getByRole('heading', { name: 'Tạo hợp đồng thuê' })` thấy; `page.goBack()` rồi vào lại, bấm link, nhấn `Escape`, assert URL quay về `/tenants/<id>` và dialog biến mất.
- [ ] **Step 2: Chạy test, xác nhận thất bại** (hiện bấm link sang trang mới, không có dialog). Hỏi người dùng `E2E_BASE_URL`, chạy `node scripts/e2e-preflight.mjs` rồi `npx playwright test tests/e2e/popup-them-moi.spec.ts`. Mong đợi: FAIL ở assert dialog.
- [ ] **Step 3: Viết `form-dialog.tsx` và `route-modal.tsx`** theo Interfaces; dùng các export của `src/components/ui/dialog.tsx` như `contract-detail-modal.tsx` đang dùng.
- [ ] **Step 4: Tạo slot `@modal` ở `src/app/(app)/`** (ba file `return null`), sửa `layout.tsx` nhận `modal: React.ReactNode` và render `{children}{modal}` bên trong `AppShell`.
- [ ] **Step 5: Dời popup hợp đồng**: `@modal/(.)contracts/[id]/page.tsx` giữ đúng logic cũ (bỏ tiền tố `(.)` khỏi `id`, render `ContractDetail` trong `RouteModal size="full" title="Chi tiết hợp đồng"`); `@modal/(.)contracts/new/page.tsx` render `NewContract` (từ `src/app/(app)/contracts/new-contract.tsx`, `showHeading={false}`) trong `RouteModal size="lg"` với `title` theo `sp.kind` ('Tạo hợp đồng cọc' / 'Tạo hợp đồng thuê'). Xoá các file nêu ở Files › Delete. Đổi thẻ `<a href="/contracts/new?deposit=…">` ở `contract-detail.tsx` thành `Link` và xoá chú thích cũ về `<a>`.
- [ ] **Step 6: Kiểm tra**: `npx tsc --noEmit` và `npm run lint` không lỗi; dừng và khởi động lại `siris-dev`; bằng trình duyệt: (a) `/contracts` → `Tạo hợp đồng thuê` hiện popup; (b) `/tenants/<id>` → `+ Tạo hợp đồng thuê` hiện popup (**điểm quyết định**: nếu bấm từ ngoài `/contracts` mà vẫn sang trang mới, dừng lại, báo người dùng, không tự đổi hướng); (c) bấm một dòng hợp đồng vẫn mở popup chi tiết; (d) xoá hợp đồng từ popup chi tiết vẫn về `/contracts` và popup đóng; (e) `/contracts/new` mở thẳng ra trang đầy đủ.
- [ ] **Step 7: Chạy lại test e2e Step 1**, mong đợi PASS.
- [ ] **Step 8: Commit** (nếu người dùng đồng ý): `feat: popup chung cho thao tác thêm, dời popup hợp đồng lên slot (app)`.

---

### Task 2: Thêm khách và thêm người dùng

**Files:**
- Create: `src/app/(app)/tenants/new-tenant.tsx`, `src/app/(app)/users/new-user.tsx`, `src/app/(app)/users/new/page.tsx`
- Create: `src/app/(app)/@modal/(.)tenants/new/page.tsx`, `src/app/(app)/@modal/(.)users/new/page.tsx`
- Modify: `src/app/(app)/tenants/new/page.tsx`, `src/app/(app)/users/[id]/page.tsx` (bỏ nhánh `id === 'new'`), `src/features/users/components/user-form.tsx:36` (thêm `router.refresh()` sau `router.push('/users')`)
- Test: `tests/e2e/popup-them-moi.spec.ts`

**Interfaces:**
- Consumes: `RouteModal` (Task 1).
- Produces: `NewTenant({ showHeading?: boolean }): Promise<JSX.Element>` (async server component; chứa đúng thân trang `tenants/new` hiện tại, gồm `assertCan` + `notFound()`); `NewUser({ showHeading?: boolean })` tương tự với thân của nhánh `new` ở `users/[id]/page.tsx` (quyền `settings`, danh sách cơ sở sắp theo tên, `<UserForm facilities={…} />`).

- [ ] **Step 1: Thêm hai test** vào `popup-them-moi.spec.ts`: `'Thêm khách hiện popup, tạo xong sang trang khách'` (vào `/tenants`, bấm `Thêm khách`, assert dialog thấy, điền như `no-reload.spec.ts:89-93`, bấm `Tạo khách`, assert URL `/tenants/<uuid>`) và `'Thêm người dùng hiện popup, tạo xong đóng popup, danh sách có dòng mới'` (vào `/users`, bấm `Thêm người dùng`, điền họ tên/email theo nhãn trong `user-form.tsx`, lưu, assert dialog biến mất và tên mới hiện trong bảng không cần reload).
- [ ] **Step 2: Chạy, xác nhận thất bại** (`npx playwright test tests/e2e/popup-them-moi.spec.ts -g "Thêm"`).
- [ ] **Step 3: Tách `NewTenant` và `NewUser`** theo Interfaces; `tenants/new/page.tsx` chỉ còn `return <NewTenant />`; tạo `users/new/page.tsx` trả `<NewUser />`; bỏ nhánh `new` khỏi `users/[id]/page.tsx` (giữ phần sửa người dùng nguyên vẹn).
- [ ] **Step 4: Thêm route chặn** `@modal/(.)tenants/new` (`title="Thêm khách thuê"`, `size="lg"`) và `@modal/(.)users/new` (`title="Thêm người dùng"`, `size="md"`), mỗi cái render `NewTenant`/`NewUser` với `showHeading={false}`.
- [ ] **Step 5: Sửa `user-form.tsx`**: sau tạo thành công gọi `router.push('/users')` rồi `router.refresh()` (staleTimes làm danh sách cũ nếu thiếu).
- [ ] **Step 6: Kiểm tra** tsc + lint; khởi động lại `siris-dev`; bằng trình duyệt thử Review Focus 1–5 cho cả hai form (đặc biệt: gửi form trống ở popup, F5 ở `/tenants/new` và `/users/new`, và `/users/new` bằng tài khoản không có quyền `settings`).
- [ ] **Step 7: Chạy lại e2e Step 1** và các spec cũ liên quan khách (`no-reload.spec.ts`, `dot-1.spec.ts`, `invoices.spec.ts`), mong đợi PASS.
- [ ] **Step 8: Commit** (nếu người dùng đồng ý): `feat: popup thêm khách và thêm người dùng`.

---

### Task 3: Báo sự cố

**Files:**
- Create: `src/app/(app)/incidents/new-incident.tsx`, `src/app/(app)/@modal/(.)incidents/new/page.tsx`
- Modify: `src/app/(app)/incidents/new/page.tsx`
- Test: `tests/e2e/popup-them-moi.spec.ts`, `tests/e2e/incidents.spec.ts` (nếu bước bấm `Báo sự cố` trên trang phòng cần chờ popup)

**Interfaces:**
- Consumes: `RouteModal`.
- Produces: `NewIncident({ sp: { room?: string; asset?: string }; showHeading?: boolean })` — thân trang `incidents/new` hiện tại (quyền `incidents`, `listAssignees`, `IncidentForm`).

- [ ] **Step 1: Thêm test** `'Báo sự cố từ danh sách hiện popup và giữ ?room=…'`: từ trang một phòng bấm link `Báo sự cố`, assert dialog thấy và URL chứa `/incidents/new?room=`; điền `Tiêu đề`, bấm nút `Báo sự cố` trong dialog, assert tiêu đề sự cố hiện ở trang chi tiết.
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Tách `NewIncident`; `incidents/new/page.tsx`** await `searchParams` rồi render nó; thêm route chặn `title="Báo sự cố"`, `size="md"`.
- [ ] **Step 4: Kiểm tra** tsc + lint, khởi động lại `siris-dev`, thử bằng trình duyệt từ `/incidents` (nút `Báo sự cố`) và từ trang phòng; F5 ở `/incidents/new?room=<id>` vẫn mang theo phòng.
- [ ] **Step 5: Chạy `tests/e2e/incidents.spec.ts` và test mới**, mong đợi PASS.
- [ ] **Step 6: Commit** (nếu người dùng đồng ý): `feat: popup báo sự cố`.

---

### Task 4: Nhóm B — phòng, tài sản, cơ sở bọc `Dialog`

**Files:**
- Modify: `src/features/rooms/components/room-panels.tsx` (bọc form một phòng và form hàng loạt; nút `Thêm phòng`, `Tạo nhanh nhiều phòng` giữ nguyên chữ), `src/features/assets/components/asset-form.tsx` (nút `Thêm tài sản`), `src/features/facilities/components/facility-form.tsx` (`NewFacilityButton`, nút `Thêm cơ sở`)
- Test: `tests/e2e/popup-them-moi.spec.ts`; chạy lại `tests/e2e/rooms-page.spec.ts`

**Interfaces:**
- Consumes: `FormDialog` (Task 1).
- Produces: không có API mới; mỗi component vẫn nhận cùng props.

- [ ] **Step 1: Thêm test** `'Thêm phòng hiện popup, tạo xong đóng popup và ô phòng mới hiện ở danh sách'` (vào `/rooms`, bấm `Thêm phòng` hoặc `Tạo nhanh nhiều phòng` như `rooms-page.spec.ts:14-22`, assert `getByRole('dialog')` thấy; sau khi tạo, assert dialog biến mất, `getByText('Đã tạo 1 phòng', { exact: true })` thấy, và ô phòng mới thấy mà không reload).
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Bọc form vào `FormDialog`**: mở khi bấm nút, đóng bằng `onOpenChange(false)` (reset trạng thái nhập) và khi tạo thành công rồi `router.refresh()`. Thông báo thành công của phòng chuyển sang `toast.success` (sonner) vì popup đóng; giữ đúng chữ `Đã tạo N phòng` để các e2e hiện có (`helpers.ts:createTempRoom`, `rooms-page.spec.ts`) vẫn khớp. Lỗi vẫn hiện trong popup. `size="lg"` cho phòng, `md` cho tài sản và cơ sở.
- [ ] **Step 4: Kiểm tra** tsc + lint; bằng trình duyệt: thêm phòng (một phòng và hàng loạt) ở `/rooms` và trang chi tiết toà (`facilityId` cố định), thêm tài sản ở `/assets`, thêm cơ sở ở `/facilities`; gửi form lỗi vẫn ở lại popup; Esc đóng và xoá dữ liệu đã nhập dở.
- [ ] **Step 5: Chạy** `tests/e2e/rooms-page.spec.ts`, `tests/e2e/contract-create-one-page.spec.ts` (dùng `createTempRoom`) và test mới, mong đợi PASS.
- [ ] **Step 6: Commit** (nếu người dùng đồng ý): `feat: popup thêm phòng, tài sản, cơ sở`.

---

### Task 5: Nhóm B — loại phí, đơn vị, phí phát sinh bọc `Dialog`

**Files:**
- Modify: `src/features/settings/components/fee-settings.tsx` (`+ Thêm loại phí` bọc `FeeTypeForm`; `+ Thêm đơn vị` bọc ô nhập đơn vị), `src/features/charges/components/one-off-dialog.tsx` (nút `Thêm phí phát sinh`; phần danh sách phí để nguyên bên ngoài popup)
- Test: `tests/e2e/popup-them-moi.spec.ts`; chạy lại e2e phí mặc định ở `tests/e2e/contract-create-one-page.spec.ts` (test `phí mặc định theo cơ sở…`)

**Interfaces:**
- Consumes: `FormDialog`.

*Ghi chú phạm vi:* `Thêm phí phát sinh` không có trong danh sách tên của spec nhưng đúng định nghĩa "thao tác thêm đang mở ngay trong trang"; làm cùng nhóm. Các nút thêm nằm bên trong form tạo hợp đồng (`+ Thêm phí dịch vụ`, `Thêm tài sản mới`) là phần của form đang điền, không phải thêm mục độc lập: không đổi.

- [ ] **Step 1: Thêm test** `'Thêm loại phí hiện popup, tạo xong thẻ phí hiện ở danh sách'` (mở `/settings`, tab `Phí dịch vụ`, bấm `Thêm loại phí`, assert dialog, điền như `contract-create-one-page.spec.ts:259-263`, bấm `Tạo loại phí`, assert dialog biến mất và `getByRole('article', { name })` thấy).
- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Bọc vào `FormDialog`** (`size="md"` cho loại phí, `sm` cho đơn vị và phí phát sinh), thay `aria-expanded` toggle bằng trạng thái mở của dialog; tạo xong đóng dialog; thông báo `Msg` chuyển sang `toast` khi dialog đã đóng, lỗi ở lại trong popup.
- [ ] **Step 4: Kiểm tra** tsc + lint; bằng trình duyệt thử ba nút, gồm thêm phí phát sinh trên trang chi tiết hợp đồng (popup chi tiết hợp đồng đang mở: `FormDialog` lồng vẫn hoạt động và Esc chỉ đóng lớp trên cùng).
- [ ] **Step 5: Chạy test mới và `contract-create-one-page.spec.ts` phần phí mặc định**, mong đợi PASS.
- [ ] **Step 6: Commit** (nếu người dùng đồng ý): `feat: popup thêm loại phí, đơn vị, phí phát sinh`.

---

### Task 6: Quy tắc dự án và kiểm tra toàn bộ

**Files:**
- Modify: `CLAUDE.md` (mục `## Conventions`, thêm một gạch đầu dòng nhóm dưới đây; không sửa phần khác, không sửa file đánh dấu "Managed by ai-rules")
- Modify: `docs/superpowers/specs/2026-11-19-popup-cho-thao-tac-them-moi-design.md` (xoá câu "Không có người xây độc lập đọc lại…" nếu thấy đã lỗi thời; cập nhật mục "Rủi ro" theo kết quả Task 1)

- [ ] **Step 1: Thêm vào `Conventions` của `CLAUDE.md` đúng nội dung sau:**

```markdown
- Thao tác "thêm mới" luôn hiện popup, không điều hướng sang trang mới. Form cần dữ liệu từ server: làm trang `src/app/(app)/<mục>/new/page.tsx` với thân trang tách thành component dùng chung (`new-<mục>.tsx`), rồi thêm route chặn `src/app/(app)/@modal/(.)<mục>/new/page.tsx` bọc thân đó bằng `RouteModal`. Form tự chứa: bọc bằng `FormDialog`. Liên kết "thêm" dùng `Link`, không dùng `<a>` (trừ khi cố ý tải trang đầy đủ). Sau khi tạo: `router.refresh()` để danh sách phía sau cập nhật. Phải kiểm tra: bấm từ danh sách ra popup, F5 hoặc mở thẳng ra trang đầy đủ, Esc quay về đúng URL cũ.
```

- [ ] **Step 2: Chạy toàn bộ kiểm tra**: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`; đọc kết quả từng lệnh.
- [ ] **Step 3: Chạy e2e đầy đủ một lần** (sau khi hỏi người dùng `E2E_BASE_URL` và chạy preflight): `npm run test:e2e`; chạy lại riêng các test gãy; báo cáo test nào đã sửa vì hành vi popup.
- [ ] **Step 4: Quét còn sót**: `grep -rnE 'href=[^>]*/new' src` và `grep -rnE '(Thêm|Tạo|Báo)' src/features src/app --include=*.tsx` rà các nút "thêm" còn mở trang mới hoặc toggle trong trang; mỗi chỗ còn sót phải chuyển sang popup hoặc ghi lý do không đổi vào báo cáo cuối.
- [ ] **Step 5: Báo cáo cuối** theo quy tắc dự án: đã đổi gì; đã kiểm chứng gì (lệnh + kết quả); chưa kiểm chứng gì.
- [ ] **Step 6: Commit** (nếu người dùng đồng ý): `docs: quy tắc popup cho thao tác thêm mới`.
