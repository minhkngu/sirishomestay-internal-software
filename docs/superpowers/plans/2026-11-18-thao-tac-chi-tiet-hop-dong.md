# Thao tác trên trang chi tiết hợp đồng — Kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang chi tiết hợp đồng có hàng icon thao tác ở góc phải trên cùng (gồm Chuyển phòng), tooltip hiện tức thì, xoá hợp đồng chạy được, ghi chú sửa được cùng hợp đồng, và trạng thái ký gọn còn Chưa ký / Đã ký.

**Architecture:** Dùng lại `ContractRowActions` (hộp thoại có sẵn) cho cả trang chi tiết; thêm hành động `transfer` và tooltip dùng chung. Trạng thái ký chỉ đổi cách hiển thị (giá trị DB giữ nguyên) qua một hàm thuần ở `src/domain/`. Không đổi service sửa/xoá ngoài phần sửa lỗi xoá.

**Tech Stack:** Next.js 16 App Router, React 19, `@base-ui/react` (tooltip, dialog), Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-thao-tac-chi-tiet-hop-dong-design.md`

## Global Constraints

- Giao diện, comment, commit viết tiếng Việt; commit dạng `feat:` / `fix:`. Commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Quy tắc import (CLAUDE.md): `features`/`components` không import `db`; `domain` không import module nào trong `src`; chỉ `app` import `features`.
- Đọc `node_modules/next/dist/docs/` trước khi viết code Next.js (AGENTS.md).
- Không sửa tay file trong `drizzle/`; kế hoạch này không có migration (giá trị `draft`/`exported`/`signed` giữ nguyên).
- Không bỏ hay tắt test/lint để qua. Hai lần sửa cùng một lỗi đều hỏng thì dừng và báo cáo.
- Cây làm việc đang có thay đổi chưa commit của trang Phòng (`rooms/[id]/page.tsx`, `server/rooms`, `server/incidents`, `room-incident-list.tsx`, hai test integration). Chỉ `git add` đúng các file của kế hoạch này, không dùng `git add -A`.
- Không commit lên `main`; nhánh hiện tại `codex/hop-dong`.

## Review Focus

- Xoá thất bại (lỗi quyền, lỗi DB): phải hiện thông báo lỗi trong hộp thoại, không im lặng.
- Xoá thành công từ trang chi tiết (cả khi mở trong modal chặn route): phải về `/contracts`, không để trang 404.
- Hợp đồng đã kết thúc: không có icon Thanh lý, Chuyển nhượng, Gia hạn, Chuyển phòng. Người không có `delete_contracts`: không có icon Xoá.
- Ghi chú để trống phải xoá được ghi chú cũ; ghi chú nhiều dòng giữ xuống dòng khi hiển thị.
- Tooltip hiện cả khi focus bàn phím, và hàng icon xuống dòng được trên màn hình hẹp.

---

### Task 1: Hàm nhãn trạng thái ký

**Files:**
- Create: `src/domain/sign-status.ts`
- Test: `tests/unit/domain/sign-status.test.ts`

**Interfaces:**
- Produces: `signStatusLabel(status: string): 'Chưa ký' | 'Đã ký'` — `'signed'` → `'Đã ký'`; mọi giá trị khác (`'draft'`, `'exported'`, chuỗi lạ) → `'Chưa ký'`.

- [ ] **Step 1: Viết test thất bại** `tests/unit/domain/sign-status.test.ts`: `draft` → `Chưa ký`, `exported` → `Chưa ký`, `signed` → `Đã ký`, `''` → `Chưa ký`.
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/domain/sign-status.test.ts`, kỳ vọng FAIL (module chưa có).
- [ ] **Step 3: Cài đặt** `signStatusLabel` trong `src/domain/sign-status.ts` (hàm thuần, không import gì).
- [ ] **Step 4: Chạy lại**, kỳ vọng PASS.
- [ ] **Step 5: Commit** `src/domain/sign-status.ts tests/unit/domain/sign-status.test.ts` — `feat: nhãn trạng thái ký Chưa ký / Đã ký`.

### Task 2: Tooltip hiện tức thì

**Files:**
- Create: `src/components/ui/tooltip.tsx`
- Modify: `src/features/contracts/components/contract-row-actions.tsx` (dòng icon, hiện dùng `title`)

**Interfaces:**
- Produces: `IconTip({ label, children }: { label: string; children: ReactElement })` — bọc một phần tử kích hoạt bằng `Tooltip` của `@base-ui/react/tooltip` với `delay={0}` (cả `Provider` và `Trigger`), nội dung là `label`. Phần tử con phải giữ `aria-label` để e2e `getByRole('button', { name })` vẫn khớp.

- [ ] **Step 1: Đọc** `node_modules/@base-ui/react/tooltip/index.parts.d.ts` để dùng đúng tên part (`Provider`, `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`). Kiểu dáng popup theo `dialog.tsx`/`popover.tsx` trong cùng thư mục.
- [ ] **Step 2: Cài đặt** `IconTip` trong `src/components/ui/tooltip.tsx` (`'use client'`).
- [ ] **Step 3: Sửa** `ContractRowActions`: bọc từng icon `Button` bằng `IconTip`, bỏ thuộc tính `title`, giữ `aria-label`.
- [ ] **Step 4: Kiểm tra trình duyệt** (`preview_start`, trang `/contracts`): rê chuột vào icon, tooltip hiện ngay không chờ; chụp màn hình. Chạy `npx tsc --noEmit` (bỏ qua lỗi trong `.next/`) và `npm run lint`.
- [ ] **Step 5: Commit** hai file trên — `feat: tooltip hiện tức thì cho icon thao tác hợp đồng`.

### Task 3: Sửa lỗi xoá hợp đồng

**Files:**
- Modify: `src/features/contracts/components/contract-edit-actions.tsx` (`remove`, chế độ `mode === 'delete'`)
- Test: `tests/integration/contracts.test.ts` (hoặc file test xoá hợp đồng hiện có — tìm bằng `grep -n deleteContract tests/integration`)

**Interfaces:**
- Consumes: `deleteContractAction(kind, id, true)` từ `src/server/contracts/actions.ts` (không đổi chữ ký).
- Produces: chế độ `delete` của `ContractEditActions` tự xác nhận trong hộp thoại, không dùng `window.confirm`.

- [ ] **Step 1: Tái hiện trước khi sửa.** Chạy ứng dụng với dữ liệu mẫu, đăng nhập tài khoản có `delete_contracts`, bấm icon Xoá ở danh sách rồi nút "Xoá hợp đồng" trong hộp thoại. Ghi lại: `window.confirm` có hiện không, có request `deleteContractAction` không (`read_network_requests`), có lỗi console không. Nghi vấn đã biết: `window.confirm` bị chặn nên `remove()` thoát im lặng. Nếu kết quả khác nghi vấn, báo lại người dùng trước khi sửa.
- [ ] **Step 2: Viết test thất bại** (service): xoá một hợp đồng thuê có dữ liệu liên quan (hoá đơn, thanh toán, phụ lục, bàn giao, tệp) bằng `deleteContract` rồi khẳng định hợp đồng và dữ liệu con biến mất, `pendingFiles` là 0 với storage bộ nhớ. Nếu test tương đương đã có thì bỏ bước này và ghi rõ test nào đã phủ. Chạy, kỳ vọng PASS hoặc FAIL tuỳ nguyên nhân thật; nếu FAIL là lỗi service thì sửa ở `deleteContract`.
- [ ] **Step 3: Thay `window.confirm` bằng xác nhận hai bước trong hộp thoại:** trạng thái `confirming`; bước 1 chỉ hiện nút "Xoá hợp đồng"; bấm thì hiện đoạn cảnh báo hiện có (giữ nội dung, thêm "Hợp đồng đã ký." khi `signed`) cùng hai nút "Xác nhận xoá" (destructive) và "Huỷ". "Xác nhận xoá" gọi `deleteContractAction`; lỗi trả về luôn hiện trong `role="alert"`. Chế độ không có `mode` (nút xoá cũ ở trang chi tiết) cũng dùng luồng này.
- [ ] **Step 4: Kiểm tra trình duyệt:** xoá một hợp đồng thử ở danh sách thành công, danh sách cập nhật; thử trường hợp lỗi (tài khoản thiếu quyền, nếu dựng được) có thông báo.
- [ ] **Step 5: Commit** — `fix: xoá hợp đồng xác nhận ngay trong hộp thoại`.

### Task 4: Chuyển phòng thành hành động thao tác nhanh

**Files:**
- Modify: `src/server/contracts/actions.ts` (`quickContractDataAction`: thêm `freeRooms` vào `form`)
- Modify: `src/features/contracts/components/transfer-wizard.tsx` (nhận `defaultOpen`, `onCompleted`)
- Modify: `src/features/contracts/components/contract-row-actions.tsx` (hành động `transfer`, prop `redirectAfterDelete`)

**Interfaces:**
- Consumes: `addendumFormData(db, ctx, id)` trả `freeRooms: { id: string; code: string }[]` (đang dùng ở `contract-detail.tsx`).
- Produces:
  - `quickContractDataAction(...).data.form` thêm `freeRooms: { id: string; code: string }[]`.
  - `TransferWizard` thêm `defaultOpen?: boolean; onCompleted?: () => void`, chuyển thẳng xuống `AddendumShell` (đã hỗ trợ cả hai).
  - `ContractRowActions({ id, kind, active, canDelete, redirectAfterDelete?: string })`; thêm mục `{ key: 'transfer', label: 'Chuyển phòng', icon: ArrowLeftRight }` chỉ hiện khi `kind === 'lease' && active`, đặt sau "Gia hạn hợp đồng". Khi xoá xong và có `redirectAfterDelete` thì `router.replace(redirectAfterDelete)`, ngược lại hành vi cũ (`close`).

- [ ] **Step 1: Thêm** `freeRooms` vào `form` của `quickContractDataAction`.
- [ ] **Step 2: Thêm** `defaultOpen`/`onCompleted` cho `TransferWizard`.
- [ ] **Step 3: Thêm** hành động `transfer` vào `ContractRowActions`: render `TransferWizard` với `currentRoomId`, `freeRooms`, `meters`, `today` lấy từ `data.form`, `defaultOpen`, `onCompleted={close}`.
- [ ] **Step 4: Thêm** `redirectAfterDelete` như mô tả ở trên.
- [ ] **Step 5: Kiểm tra** `npx tsc --noEmit`, `npm run lint`; cập nhật `tests/e2e/contract-quick-actions.spec.ts` dòng 14 để danh sách tên nút có thêm `'Chuyển phòng'` cho hợp đồng đang hiệu lực.
- [ ] **Step 6: Commit** — `feat: chuyển phòng trong thao tác nhanh hợp đồng`.

### Task 5: Hàng icon ở đầu trang chi tiết

**Files:**
- Modify: `src/app/(app)/contracts/contract-detail.tsx` (khung đầu trang hợp đồng thuê và hợp đồng cọc; mục Phụ lục)

**Interfaces:**
- Consumes: `ContractRowActions` (Task 4), `signStatusLabel` (Task 1), `can(ctx, 'delete_contracts', facilityId)` từ `@/domain/access`.

- [ ] **Step 1: Thêm vào khung đầu trang** (`<div className="flex flex-wrap items-center justify-between ...">`), căn phải, `<ContractRowActions id={lease.id} kind="lease" active={isActive} canDelete={can(ctx, 'delete_contracts', lease.facilityId)} redirectAfterDelete="/contracts" />`. Làm tương tự cho hợp đồng cọc (`kind="deposit"`, `active={false}`). Hàng icon phải xuống dòng được trên màn hình hẹp (`flex-wrap`).
- [ ] **Step 2: Bỏ** khối `TransferWizard` (và import) ở cuối mục Phụ lục; bỏ biến `form` khỏi chỗ chỉ còn dùng cho chuyển phòng nếu không còn nơi nào dùng (`OccupantDialog` vẫn dùng).
- [ ] **Step 3: Ghi chú:** giữ nguyên chỗ hiện ghi chú (`lease.note`, `whitespace-pre-wrap`); không thêm ô nhập (đã chốt lưu chung qua "Sửa hợp đồng").
- [ ] **Step 4: Test thất bại→qua cho ghi chú** (`tests/integration/contracts.test.ts`): `'sửa hợp đồng lưu ghi chú, để trống thì xoá ghi chú'` — gọi `updateLease` với `note: 'Khách hút thuốc\nXe 2 bánh'` rồi `getLease(...).note` bằng đúng chuỗi đó; gọi lại với `note: ''` rồi `note` là `''`. Nếu test FAIL thì lỗi ghi chú nằm ở service: sửa ở `updateLease`, ngược lại lỗi nằm ở giao diện và Step 5 sẽ làm rõ.
- [ ] **Step 5: Kiểm tra trình duyệt** (trang đầy đủ `/contracts/<id>` và modal mở từ danh sách): hàng icon ở góc phải; mở "Sửa hợp đồng", đổi ghi chú, lưu, thấy ghi chú mới ở Tổng quan; icon Chuyển phòng mở form; xoá một hợp đồng thử rồi về `/contracts`.
- [ ] **Step 6: Commit** — `feat: hàng thao tác ở đầu trang chi tiết hợp đồng`.

### Task 6: Gọn trạng thái ký và giấy tờ

**Files:**
- Modify: `src/features/contracts/components/sign-status.tsx`
- Modify: `src/features/contracts/components/export-menu.tsx` (chỉ nếu cần gộp nhãn/bố cục)
- Modify: `src/app/(app)/contracts/contract-detail.tsx` (khối "Giấy tờ" của hợp đồng thuê, khối giấy tờ của hợp đồng cọc, huy hiệu ở đầu trang)

**Interfaces:**
- Consumes: `signStatusLabel` (Task 1), `setSignStatusAction(kind, id, 'signed', fileId)` (không đổi).
- Produces: `SignStatus({ kind, id, status, signedFileId })` còn là điều khiển tải lên: khi chưa ký hiện `FileUpload` nhãn "Tải bản đã ký" (xong thì gọi `setSignStatusAction(..., 'signed', fileId)` rồi `router.refresh()`); khi đã ký hiện liên kết "Xem bản đã ký". Không còn danh sách bước, nút "Đánh dấu đã xuất", nút "Đánh dấu đã ký (chưa có file)" hay tiêu đề "Trạng thái ký".

- [ ] **Step 1: Thêm huy hiệu** `signStatusLabel(lease.signStatus)` cạnh huy hiệu "Đang hiệu lực" ở đầu trang (màu lục khi "Đã ký", trung tính khi "Chưa ký"); làm tương tự cho hợp đồng cọc.
- [ ] **Step 2: Rút gọn** `SignStatus` như mô tả; đặt `ExportMenu` (Xuất Word, Xuất PDF) và `SignStatus` cùng một khối "Giấy tờ", nút xuất đứng trước.
- [ ] **Step 3: Kiểm tra trình duyệt:** hợp đồng chưa ký thấy "Chưa ký", xuất Word/PDF vẫn tải được và trạng thái vẫn "Chưa ký"; tải lên một PDF đã ký thì đổi thành "Đã ký" và có liên kết xem. Chạy `npx tsc --noEmit` và `npm run lint`.
- [ ] **Step 4: Commit** — `feat: gọn khối trạng thái ký hợp đồng`.

### Task 7: Kiểm tra tổng

- [ ] **Step 1:** `npx vitest run tests/unit tests/integration/contracts.test.ts tests/integration/addenda.test.ts` — kỳ vọng tất cả PASS.
- [ ] **Step 2:** `npm run lint` và `npx tsc --noEmit` — kỳ vọng 0 lỗi trong `src`/`tests`.
- [ ] **Step 3:** `node scripts/e2e-preflight.mjs`, rồi chỉ chạy `E2E_BASE_URL=<môi trường thử> npx playwright test tests/e2e/contract-quick-actions.spec.ts`; sửa selector nếu tooltip hay xác nhận xoá hai bước làm test cũ lệch (không bỏ test).
- [ ] **Step 4:** Báo cáo: những gì đã đổi, lệnh đã chạy và kết quả, phần chưa kiểm tra.
