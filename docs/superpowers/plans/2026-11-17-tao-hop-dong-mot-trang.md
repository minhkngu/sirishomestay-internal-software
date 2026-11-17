# Tạo hợp đồng thuê một trang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo hợp đồng thuê và biên bản bàn giao từ một trang, với cọc thực nhận, tài sản và ảnh hợp đồng.

**Architecture:** Mở rộng mô hình tài sản và hợp đồng, sau đó thực hiện tạo hợp đồng, sổ cọc, thay đổi tài sản và biên bản trong cùng giao dịch. Biểu mẫu gom các mục trên một trang; ảnh được tải sau khi có ID và có đường phục hồi khi tải thất bại. Tạo mới và chuyển hợp đồng cọc dùng cùng hợp đồng dữ liệu.

**Tech Stack:** Next.js App Router 16.4.6, React 19, TypeScript, Drizzle/Postgres, Vitest/PGlite, Playwright, hệ thống storage hiện có.

**Spec:** `docs/superpowers/specs/2026-11-17-tao-hop-dong-mot-trang-design.md`

## Global Constraints

- Giữ quyền, phạm vi cơ sở, quy tắc phòng, người ở, phí, hóa đơn và chuyển cọc hiện có; đọc tài liệu Next.js trong `node_modules/next/dist/docs/` trước khi sửa code Next.js.
- Bảo toàn các thay đổi có sẵn trong workspace; kiểm tra `git status` trước mỗi task, không stage hoặc ghi đè thay đổi không liên quan.
- Không thực hiện thay đổi tài sản khi người dùng chỉ chỉnh biểu mẫu; một lần bấm tạo, có ngăn gửi trùng.
- Ghi chú và model là chuỗi rỗng mặc định cho dữ liệu cũ; ảnh chung không dùng owner ảnh từng vật dụng hoặc file hợp đồng đã ký.
- Mỗi task viết test thất bại trước, chạy xác nhận, triển khai và chạy lại; commit riêng các file của task sau khi kiểm tra stage.

## Review Focus

- Số cọc đã kế thừa và khoản nhận thêm không được tính hai lần khi chuyển cọc: kiểm thử Task 2.
- Tài sản bị chuyển, thanh lý hoặc đổi cơ sở sau khi mở biểu mẫu phải gây lỗi và rollback toàn bộ: kiểm thử Task 3.
- Người có quyền hợp đồng nhưng không có quyền tài sản không được tạo, chuyển hoặc thanh lý tài sản: kiểm thử Task 3.
- Tải một ảnh thất bại sau khi tạo không tạo lại hợp đồng và cho phép tải lại ảnh lỗi: kiểm thử Task 4 và 5.
- Đổi phòng sau khi chỉnh tài sản không gửi nhầm thay đổi của phòng trước: kiểm thử Task 5.

## File structure

- `src/db/schema/assets.ts`, `src/db/schema/contracts.ts`, `drizzle/` và metadata migration: model, vị trí chưa xếp và ghi chú; cập nhật các chỗ hiển thị/lọc vị trí tài sản tương ứng.
- `src/server/assets/service.ts`: kiểm tra, ghi lịch sử và thao tác tài sản trong transaction; giữ các API hiện có.
- `src/server/contracts/service.ts`, `actions.ts`: mở rộng dữ liệu đầu vào, sổ cọc, transaction tạo hợp đồng và bàn giao.
- `src/server/handovers/service.ts`: helper tạo bản nháp check-in trong transaction hiện tại, giữ hành vi `startHandover`.
- `src/server/files/owners.ts`, `src/server/contracts/service.ts`: loại ảnh hợp đồng, kiểm soát quyền và cơ sở.
- `src/app/(app)/contracts/new/page.tsx`, `src/features/contracts/components/lease-wizard.tsx`: dữ liệu đầu vào và biểu mẫu một trang; tách component tài sản và tải ảnh trong cùng thư mục khi cần.
- `src/app/(app)/contracts/[id]/page.tsx`: hiển thị ghi chú, ảnh và đường tải lại ảnh.
- `tests/integration/{assets,contracts,handovers,files}.test.ts` và `tests/e2e/`: kiểm thử hành vi thực tế và giao diện.

---

### Task 1: Model và vị trí tài sản

**Files:** Modify `src/db/schema/assets.ts`, `src/db/schema/contracts.ts`, `src/server/assets/service.ts`, các màn hình tài sản dùng `LocationKind`; create migration trong `drizzle/`; test `tests/integration/assets.test.ts`, `tests/integration/schema.test.ts`.

**Interfaces:** Mở rộng `LocationKind` với `'unassigned'`; `Location` vẫn là `{ kind: LocationKind; id: string }`, trong đó vị trí `unassigned` dùng ID cơ sở. Thêm `assets.model: string` và `leases.note: string` mặc định `''`. Existing assets giữ nguyên vị trí và model rỗng.

- [ ] Viết test tạo/đọc asset có model, di chuyển room → unassigned (vẫn `in_use`, giữ lịch sử) → room, từ chối unassigned thuộc cơ sở khác; dữ liệu cũ đọc model/note rỗng.
- [ ] Chạy `npx vitest run tests/integration/assets.test.ts tests/integration/schema.test.ts`; xác nhận test mới FAIL vì thiếu model/vị trí.
- [ ] Thêm schema, migration bằng quy trình Drizzle hiện tại, parsing và xử lý vị trí mới; bổ sung nhãn/lọc cần thiết tại các màn hình hiện có. Không đổi nghĩa `warehouse`, `common` hoặc `disposed`.
- [ ] Chạy lại hai test trên và `npx tsc --noEmit`; xác nhận PASS.
- [ ] Commit riêng thay đổi task với message `feat: hỗ trợ model và vị trí chưa xếp của tài sản`.

### Task 2: Sổ cọc thực nhận và ghi chú

**Files:** Modify `src/server/contracts/service.ts`, `src/server/contracts/actions.ts`; test `tests/integration/contracts.test.ts`.

**Interfaces:** Mở rộng `LeaseInput` với `note?: string` và `receivedDeposit?: number` (tổng thực nhận, bao gồm số kế thừa; mặc định bằng số kế thừa khi chuyển cọc, hoặc 0 khi tạo mới). `createLease` và `convertDepositToLease` giữ chữ ký hiện tại; `getLease` trả `lease.note` qua dữ liệu lease.

- [ ] Viết test: cọc 9 triệu, thực nhận 3 triệu → một dòng `done` 3 triệu và một dòng `pending` 6 triệu, hóa đơn cọc 6 triệu; chuyển cọc đã nhận 5 triệu, tổng thực nhận 7 triệu → giữ dòng 5 triệu, thêm dòng `done` 2 triệu, `pending` 2 triệu; cọc 0, số âm, số vượt tiền cọc và số thấp hơn số kế thừa phải được xử lý rõ ràng (0 hợp lệ, ba trường hợp sau từ chối). Kiểm tra note round-trip và dữ liệu cũ không truyền `receivedDeposit`.
- [ ] Chạy `npx vitest run tests/integration/contracts.test.ts`; xác nhận test mới FAIL.
- [ ] Trong `insertLease`, validate số nguyên không âm và giới hạn theo hợp đồng; dùng số dư thực nhận của các dòng chuyển sang để tính phần mới và phần thiếu, không cộng dòng pending vào số thực nhận. Ghi nhận khoản mới `done` với ngày hiện tại theo giờ Việt Nam, phần thiếu `pending`; tính hóa đơn từ phần thiếu thực tế.
- [ ] Chạy lại test contracts; xác nhận PASS, gồm các test cũ về chuyển cọc và hóa đơn.
- [ ] Commit riêng với message `feat: ghi nhận tiền cọc thực nhận khi tạo hợp đồng`.

### Task 3: Transaction tài sản và bàn giao

**Files:** Modify `src/server/contracts/service.ts`, `src/server/assets/service.ts`, `src/server/handovers/service.ts`; test `tests/integration/contracts.test.ts`, `tests/integration/handovers.test.ts`.

**Interfaces:** Thêm `LeaseInput.handover?: { expectedRoomAssetIds: string[]; addAssetIds: string[]; newAssets: Array<{ code: string; name: string; model: string; category: string; value: number; condition: string }>; remove: Array<{ assetId: string; action: 'warehouse' | 'dispose' | 'unassigned' }> }`. Khi trường này có mặt, tạo đúng một check-in `draft`; khi vắng, giữ tương thích callers cũ. Helper tài sản/bàn giao nhận transaction đang dùng, không tạo transaction độc lập.

- [ ] Viết test tạo phòng có 3 asset: giữ 1, chuyển kho 1, thanh lý 1; thêm 1 asset có sẵn cùng cơ sở và tạo 1 mới → biên bản chỉ có 3 asset cuối, đúng vị trí/trạng thái và lịch sử; thêm test riêng `unassigned` giữ lịch sử. Kiểm tra `startHandover` trả bản nháp đã tạo.
- [ ] Viết test stale snapshot (asset đã chuyển/đã thanh lý hoặc tài sản mới xuất hiện), asset khác cơ sở, ID trùng, thiếu quyền `assets`, và mã tài sản mới trùng → từ chối; không còn lease, invoice, cọc, handover, tài sản mới hoặc movement sau rollback.
- [ ] Chạy `npx vitest run tests/integration/contracts.test.ts tests/integration/handovers.test.ts`; xác nhận FAIL.
- [ ] Xác thực snapshot và quyền tại server trong transaction; áp dụng thay đổi qua helper tái sử dụng validation/audit của asset, tạo asset mới và snapshot check-in. Giữ hành vi tạo lease cũ khi `handover` vắng; đảm bảo lỗi cuộn lui toàn bộ.
- [ ] Chạy lại hai test và `npx vitest run tests/integration/assets.test.ts`; xác nhận PASS.
- [ ] Commit riêng với message `feat: tạo bàn giao và cập nhật tài sản cùng hợp đồng`.

### Task 4: Ảnh hợp đồng và phục hồi

**Files:** Modify `src/server/files/owners.ts`, `src/server/contracts/service.ts`, `src/app/(app)/contracts/[id]/page.tsx`; test `tests/integration/files.test.ts`.

**Interfaces:** Owner type `lease_photo` nhận lease ID, quyền `tenants_contracts` theo cơ sở của phòng; hỗ trợ JPEG/PNG/WebP, tối đa 2 MiB và thumbnail như ảnh bàn giao. `listFiles(db, ctx, 'lease_photo', leaseId)` chỉ trả ảnh đã xác nhận.

- [ ] Viết test upload/confirm/list ảnh theo lease, sai cơ sở hoặc thiếu quyền bị từ chối, loại file/kích thước không hợp lệ bị từ chối; ảnh chưa confirm không xuất hiện. Test cơ chế UI tải lại chỉ file lỗi với lease ID đã tạo và không gọi tạo lại.
- [ ] Chạy `npx vitest run tests/integration/files.test.ts`; xác nhận test mới FAIL.
- [ ] Đăng ký resolver `lease_photo`, giới hạn file và quyền; thêm vùng ảnh/đường bổ sung ảnh trong chi tiết hợp đồng. Tách helper tải một file để form tái sử dụng sau khi có lease ID.
- [ ] Chạy lại test files; xác nhận PASS.
- [ ] Commit riêng với message `feat: đính kèm ảnh chung cho hợp đồng thuê`.

### Task 5: Biểu mẫu một trang và kiểm chứng toàn luồng

**Files:** Modify `src/app/(app)/contracts/new/page.tsx`, `src/features/contracts/components/lease-wizard.tsx`, `src/app/(app)/contracts/[id]/page.tsx`; create các component con trong `src/features/contracts/components/` nếu cần; test mới `tests/e2e/contract-create-one-page.spec.ts` theo cấu hình Playwright của repo.

**Interfaces:** Form gửi `LeaseInput` của Task 2–3 tới action hiện có; ảnh lưu trong state trình duyệt, chỉ tải sau action thành công. Dữ liệu page cung cấp danh sách tài sản theo cơ sở/phòng và số dư cọc đã thực nhận, có kiểm tra quyền tại server. Mỗi asset hiển thị `name` và `model`; menu neo dưới thẻ, đóng bằng click ngoài hoặc chọn lại.

- [ ] Viết Playwright test: mọi mục trên cùng trang, không có nút tiếp bước; tạo mới với cọc 9 triệu/đã nhận 3 triệu, note, ảnh, một asset chuyển kho và một asset mới → một hợp đồng, đúng sổ cọc, ảnh và check-in. Kiểm tra chuyển từ cọc, thu gọn/mở tài sản, menu dưới thẻ, mobile và desktop.
- [ ] Viết test đổi phòng sau khi chọn xử lý asset → danh sách và các thay đổi cũ không được gửi; một upload lỗi → vẫn giữ lease ID, chỉ retry ảnh lỗi, không tạo lease lần hai. Test lỗi validation giữ dữ liệu và chỉ vị trí lỗi; kiểm tra quyền bị từ chối.
- [ ] Chạy test mới bằng `npx playwright test tests/e2e/contract-create-one-page.spec.ts`; xác nhận FAIL vì wizard hiện tại.
- [ ] Gộp nội dung wizard thành các mục hiển thị cùng lúc; validate đầy đủ trước submit, chỉ một nút tạo; thêm form tạo/chọn asset, menu và tóm tắt. Nhận ảnh trước khi submit; sau tạo tải từng ảnh, giữ màn hình phục hồi nếu lỗi và chỉ chuyển chi tiết sau khi hoàn thành hoặc người dùng chọn tiếp tục.
- [ ] Chạy Playwright test mới, `npm test`, `npm run lint`, `npx tsc --noEmit`; xác nhận PASS. Kiểm tra thủ công giao diện rộng/hẹp và luồng chuyển cọc; báo rõ nếu môi trường không đủ để chạy E2E.
- [ ] Commit riêng với message `feat: tạo hợp đồng thuê trên một trang`.
