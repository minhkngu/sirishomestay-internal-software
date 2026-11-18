# Contract Quick Actions and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa thao tác hợp đồng ra danh sách, bổ sung chuyển nhượng người thuê và khả năng khôi phục từng bước có xác nhận.

**Architecture:** Lưu phiên bản hợp đồng cùng dấu mốc dữ liệu liên quan trong cùng giao dịch với mỗi thay đổi. Dựng bản xem trước và khôi phục dưới khóa giao dịch; giao diện danh sách nạp nội dung chi tiết và biểu mẫu theo hợp đồng được chọn.

**Tech Stack:** Next.js 16.4.6, React 19, TypeScript, Drizzle/PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-thao-tac-nhanh-va-khoi-phuc-hop-dong-design.md`

## Global Constraints

- Đọc tài liệu Next.js tương ứng trong `node_modules/next/dist/docs/` trước khi thay đổi mã.
- Bảo toàn các thay đổi chưa commit, migration 0023 và chức năng sửa/xóa hiện hữu.
- Chỉ xóa dữ liệu trong phạm vi hợp đồng, khi khôi phục phải xác nhận danh sách hiện hành; PDF đã ký được giữ nguyên.
- Quyền sửa cho phép khôi phục; quyền xóa riêng áp dụng khi xóa hợp đồng; admin có tất cả quyền.
- Không tạo hóa đơn khi ký hợp đồng; kiểm thử dữ liệu cô lập, không áp dụng migration vào môi trường thật trong quá trình kiểm thử.

## Review Focus

- Dữ liệu phát sinh hoặc phòng thay đổi sau lúc xem cảnh báo: từ chối xác nhận cũ và yêu cầu xem lại; kiểm thử ở Task 2.
- Thanh lý có biên bản và chỉ số, phòng đã có hợp đồng mới: chặn khôi phục mà không thay đổi dữ liệu; kiểm thử ở Task 2.
- Phụ lục và tệp do thao tác bị hoàn tác tạo ra: xóa đúng đối tượng, giữ PDF đã ký cũ và thử lại dọn tệp lỗi; kiểm thử ở Task 2.
- Hai người cùng thay đổi hoặc khôi phục: tuần tự hóa và không mất thay đổi; kiểm thử ở Task 2.
- Khách nhận trùng người thuê cũ hoặc ngoài phạm vi cơ sở: từ chối mà không tạo phụ lục; kiểm thử ở Task 3.

---

### Task 1: Lưu lịch sử thay đổi hợp đồng

**Files:**
- Modify: `src/db/schema/contracts.ts`, `src/db/schema/addenda.ts`, `src/server/contracts/service.ts`, `src/server/addenda/service.ts`
- Create: `src/server/contracts/history.ts`, migration mới và snapshot Drizzle tương ứng
- Test: `tests/integration/contract-history.test.ts`

**Interfaces:**
- Consumes: `DB`, `AccessContext`; các giao dịch sửa hợp đồng và tạo phụ lục hiện có.
- Produces: `captureContractVersion(tx: DB, ctx: AccessContext, kind: 'lease' | 'deposit', id: string, operation: 'edit' | 'termination' | 'assignment' | 'extension'): Promise<string>`; phiên bản lưu trạng thái cùng danh tính các bản ghi liên quan trước thay đổi, thứ tự và tác giả.

- [ ] Viết kiểm thử: sửa hợp đồng thuê/cọc, gia hạn và thanh lý tạo một phiên bản trước thay đổi; giao dịch thất bại không để lại phiên bản; nhiều thay đổi giữ đúng thứ tự và dữ liệu phiên bản trước.
- [ ] Chạy `npx vitest run tests/integration/contract-history.test.ts`, xác nhận lỗi vì chưa có lịch sử.
- [ ] Thiết kế schema/migration, lưu bản chụp đủ khôi phục thông tin hợp đồng và quan hệ bị nghiệp vụ thay đổi; gọi `captureContractVersion` trong cùng giao dịch từng thao tác. Không dựa riêng vào thời gian máy khách để xác định dữ liệu bị ảnh hưởng.
- [ ] Chạy lại kiểm thử trên, xác nhận pass; chạy `npx vitest run tests/integration/contracts.test.ts tests/integration/addenda.test.ts` để phát hiện hồi quy.

### Task 2: Xem trước và khôi phục một bước

**Files:**
- Create: `src/server/contracts/restore.ts`, `tests/integration/contract-restore.test.ts`
- Modify: `src/server/contracts/actions.ts`, `src/server/files/service.ts`, `src/server/addenda/finalize.ts` nếu cần ghi nhận liên hệ dữ liệu phát sinh

**Interfaces:**
- Consumes: lịch sử Task 1, `StorageAdapter`, quyền `tenants_contracts` và phạm vi cơ sở.
- Produces: `previewContractRestore(db: DB, ctx: AccessContext, kind: 'lease' | 'deposit', id: string): Promise<RestorePreview>`; `restoreContract(db: DB, ctx: AccessContext, kind: 'lease' | 'deposit', id: string, previewToken: string, storage: StorageAdapter): Promise<{ pendingFiles: number }>`; `RestorePreview` chứa phiên bản, danh sách loại/mã đối tượng bị xóa, lý do chặn và token đại diện cho trạng thái đã xem.

- [ ] Viết kiểm thử: xem trước liệt kê hóa đơn, cọc, thanh toán, phụ lục do thao tác và sau thao tác tạo; khôi phục xóa đúng các mục, giữ mục cũ và PDF gốc; hai lần khôi phục liên tiếp cần hai xác nhận riêng; không có lịch sử thì từ chối.
- [ ] Bổ sung kiểm thử chặn khi phòng có hợp đồng mới; hoàn tác thanh lý xóa đúng biên bản trả phòng và chỉ số do thanh lý tạo; người không có quyền sửa và ngoài cơ sở bị từ chối; hợp đồng khác không bị ảnh hưởng.
- [ ] Bổ sung kiểm thử token xem trước cũ, đồng thời thay đổi/khôi phục, lỗi giữa giao dịch và lỗi xóa tệp lưu trữ: không xóa ngoài xác nhận, rollback dữ liệu khi lỗi giao dịch và đưa tệp lỗi vào hàng đợi thử lại.
- [ ] Chạy `npx vitest run tests/integration/contract-restore.test.ts`, xác nhận lỗi vì chưa triển khai.
- [ ] Cài đặt xem trước, khóa và kiểm tra lại trạng thái trong giao dịch khôi phục, xóa có thứ tự khóa ngoại, khôi phục snapshot, xử lý hàng đợi tệp hiện có; thêm server actions cho hai thao tác.
- [ ] Chạy lại kiểm thử và `npx vitest run tests/integration/contract-edit-delete.test.ts`, xác nhận pass.

### Task 3: Phụ lục chuyển nhượng người thuê

**Files:**
- Modify: `src/db/schema/addenda.ts`, `src/server/addenda/service.ts`, `src/server/addenda/actions.ts`, schema/domain phụ lục hiện có và migration tương ứng
- Create: `src/features/contracts/components/assignment-dialog.tsx`, `tests/integration/contract-assignment.test.ts`

**Interfaces:**
- Consumes: `captureContractVersion`, dữ liệu khách thuê và cơ chế lưu/xuất phụ lục hiện có.
- Produces: `createAssignment(db: DB, ctx: AccessContext, leaseId: string, input: unknown): Promise<AddendumResult>` và `createAssignmentAction(leaseId: string, input: unknown)`.

- [ ] Kiểm thử: chuyển sang khách hợp lệ tạo phụ lục riêng, đổi người đứng tên, xóa người cũ khỏi người ở, giữ các điều khoản/hóa đơn/cọc và byte PDF gốc; khôi phục trả lại người cũ và loại bỏ phụ lục chuyển nhượng.
- [ ] Kiểm thử từ chối người nhận trùng, ngoài cơ sở, hợp đồng không hợp lệ hoặc thiếu quyền mà không ghi dữ liệu.
- [ ] Chạy `npx vitest run tests/integration/contract-assignment.test.ts`, xác nhận lỗi; thêm loại phụ lục chuyển nhượng riêng, action và popup. Giữ nghiệp vụ chuyển phòng hiện hữu riêng biệt, không nhầm với chuyển nhượng.
- [ ] Chạy lại kiểm thử và `npx vitest run tests/integration/addenda.test.ts`, xác nhận pass.

### Task 4: Danh sách và popup chi tiết

**Files:**
- Modify: `src/app/(app)/contracts/page.tsx`, `src/app/(app)/contracts/[id]/page.tsx`, `src/features/contracts/components/contract-list.tsx`, `src/features/contracts/components/contract-edit-actions.tsx`, `src/features/contracts/components/addendum-shell.tsx`, các dialog gia hạn/thanh lý liên quan.
- Create: `src/features/contracts/components/contract-detail-dialog.tsx`, `src/features/contracts/components/contract-row-actions.tsx`, `src/features/contracts/components/restore-dialog.tsx`, `tests/e2e/contract-quick-actions.spec.ts`.

**Interfaces:**
- Consumes: actions hiện có, `createAssignmentAction`, action xem trước/khôi phục Task 2 và dữ liệu chi tiết hợp đồng đã kiểm tra quyền.
- Produces: danh sách hàng hợp đồng với biểu tượng có tên truy cập/tooltip; popup chi tiết gần toàn màn hình và popup thao tác, duy trì điều hướng trực tiếp hiện có khi truy cập URL cũ.

- [ ] Viết E2E: nhấn mã mở chi tiết gần toàn màn hình không chuyển trang; mỗi nút có tên qua hover và bàn phím, mở đúng popup; không có nút trùng trong chi tiết; đóng popup trả focus; màn hình nhỏ vẫn truy cập được thao tác.
- [ ] Kiểm thử E2E: chỉ người có quyền xóa thấy thao tác xóa, người có quyền sửa được khôi phục, admin thấy tất cả; cảnh báo hợp đồng đã ký; khôi phục hiển thị danh sách hậu quả và yêu cầu xác nhận lại nếu dữ liệu thay đổi.
- [ ] Chạy `npx playwright test tests/e2e/contract-quick-actions.spec.ts` trong môi trường demo cô lập, xác nhận lỗi; triển khai popup và bố cục một hàng, nạp dữ liệu khi cần, không lộ dữ liệu ngoài quyền.
- [ ] Chạy lại E2E và `npx playwright test tests/e2e/addenda.spec.ts`, xác nhận pass.

### Task 5: Kiểm thử toàn luồng và bàn giao

**Files:**
- Modify: `tests/e2e/contract-quick-actions.spec.ts`, `tests/integration/contract-restore.test.ts` nếu cần bổ sung tình huống phát hiện khi kiểm thử.

- [ ] Trong demo cô lập, áp dụng migration mới; tạo hợp đồng, ký, chuyển nhượng, gia hạn, thanh lý và khôi phục; kiểm tra PDF cũ, dữ liệu liên quan, cảnh báo, quyền và thử lại dọn tệp.
- [ ] Chạy `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` và E2E liên quan; ghi kết quả thực tế và mọi kiểm thử bị chặn.
- [ ] Rà diff với tài liệu thiết kế, không thay đổi tệp ngoài phạm vi; báo rõ migration cần áp dụng ở môi trường đích và không tự triển khai.
