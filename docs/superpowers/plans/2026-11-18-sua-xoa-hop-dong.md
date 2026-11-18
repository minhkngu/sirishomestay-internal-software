# Sửa và xoá hợp đồng Implementation Plan

> **For agentic workers:** Implement sequentially with superpowers:executing-plans and test-driven development.

**Goal:** Cho phép sửa và xoá hợp đồng theo thiết kế đã duyệt, với quyền xoá riêng và không tự tạo hoá đơn.

**Architecture:** Áp dụng kiểm tra quyền và giao dịch ở tầng dịch vụ; trang chi tiết gọi server actions và yêu cầu xác nhận. Dùng migration Drizzle để bổ sung quyền và giữ nguyên dữ liệu ngoài phạm vi xoá.

**Tech Stack:** Next.js, React, TypeScript, Drizzle, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-sua-xoa-hop-dong-design.md`

## Global Constraints

- Hợp đồng thuê và hợp đồng cọc; cảnh báo hợp đồng đã ký; không tự tạo hoá đơn.
- Khi sửa giữ nguyên hoá đơn và sổ cọc; khi xoá xoá các dữ liệu liên quan được xác nhận.
- Quyền xoá riêng được cấp bởi quản trị viên, kiểm tra phạm vi cơ sở ở máy chủ.

## Review Focus

- Các bản ghi có liên kết nhiều tầng và thanh toán được xoá nguyên tử, không ảnh hưởng dữ liệu gốc.
- Hợp đồng cọc đã chuyển thành hợp đồng thuê cần xử lý liên kết, tránh xoá dữ liệu ngoài phạm vi đã xác nhận.
- Người thiếu quyền, người ngoài cơ sở và yêu cầu giả mạo không được xoá.
- Sửa dữ liệu không thay đổi hoá đơn hoặc sổ cọc và phải xác nhận nếu đã ký.
- Tạo hợp đồng thường và chuyển cọc không tạo hoá đơn; dữ liệu cũ vẫn nguyên vẹn.

### Task 1: Quyền xoá và tạo hợp đồng

**Files:** `src/domain/access.ts`, `src/db/schema/users.ts`, `drizzle/`, `src/server/contracts/service.ts`, `tests/integration/contracts.test.ts`.

- [x] Thêm kiểm thử tạo hợp đồng thuê và chuyển cọc không phát sinh hoá đơn.
- [x] Chạy kiểm thử và xác nhận thất bại vì hoá đơn đang được tạo.
- [x] Bổ sung quyền `delete_contracts` vào danh mục và migration; loại bỏ tạo hoá đơn tự động.
- [x] Chạy kiểm thử liên quan và xác nhận đạt.

### Task 2: Sửa và xoá phía máy chủ

**Files:** `src/server/contracts/service.ts`, `src/server/contracts/actions.ts`, `tests/integration/contracts.test.ts`.

- [x] Thêm kiểm thử sửa cả hai loại hợp đồng, giữ nguyên các khoản liên quan, từ chối sửa hợp đồng đã ký nếu chưa xác nhận.
- [x] Thêm kiểm thử xoá với và không có quyền/cơ sở, dữ liệu nhiều tầng, xác nhận, và giao dịch toàn vẹn.
- [x] Chạy kiểm thử xác nhận thất bại, sau đó triển khai kiểm tra dữ liệu, quyền và giao dịch; ghi nhật ký.
- [x] Chạy lại kiểm thử và xác nhận đạt.

### Task 3: Giao diện và kiểm tra toàn bộ

**Files:** `src/app/(app)/contracts/[id]/page.tsx`, `src/features/contracts/components/`, kiểm thử giao diện nếu phù hợp.

- [x] Kết nối biểu mẫu sửa và xác nhận sửa hợp đồng đã ký; hiển thị xoá theo quyền, cảnh báo đầy đủ trước khi xoá.
- [ ] Kiểm tra luồng bằng kiểm thử thích hợp, chạy typecheck, lint và các kiểm thử liên quan; xử lý lỗi do thay đổi.
- [x] Kiểm tra lại diff, đảm bảo dữ liệu người dùng và các thay đổi ngoài phạm vi được giữ nguyên.

## Kết quả xác minh

- Vitest: 502 đạt, 1 bỏ qua; chạy ngoài sandbox để các máy chủ thử localhost hoạt động.
- TypeScript và build đạt; lint không lỗi, có 32 cảnh báo sẵn có.
- Chromium kiểm tra giao diện cô lập với action giả: xác nhận và huỷ sửa/xoá, ẩn nút khi thiếu quyền.
- Playwright xuyên suốt đã kiểm tra Admin sửa và xoá hợp đồng đã ký trên ứng dụng và PostgreSQL tạm; xác thực và kho tệp đều dùng bản giả cô lập.
- Tệp đính kèm được xoá khỏi kho; nếu xoá thất bại, metadata được giữ ẩn để có thể thử lại.
- Quyết định: quản trị viên tự có quyền xoá; hợp đồng cọc đã chuyển bị xoá sẽ gỡ liên kết khỏi hợp đồng thuê còn lại.
