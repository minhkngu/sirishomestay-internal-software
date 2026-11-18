# Handoff: hợp đồng và tài sản bàn giao

## Trạng thái

- Worktree: `/Users/minhkhoa/.codex/worktrees/e149/siris-internal-software`; nhánh: `thay-doi-hop-dong`.
- Các thay đổi dưới đây chưa được commit. Giữ nguyên thay đổi có sẵn của người dùng trong `tests/integration/assets.test.ts`; không đưa tệp này vào commit nếu chưa kiểm tra riêng.
- Yêu cầu gần nhất: thu gọn người ở, đổi phần biên bản bàn giao thành tài sản bàn giao và cho nhập tình trạng, ảnh của từng tài sản.

## Đã thực hiện

- Người ký được hiển thị là người ở mặc định; nút cộng nhỏ cho phép thêm người ở cùng và có thể xóa người được thêm.
- Phần **Tài sản bàn giao** hiển thị các tài sản đã chọn, cho nhập tình trạng và chọn nhiều ảnh cho từng tài sản. Có thể thêm hoặc loại tài sản theo quyền hiện có.
- Tình trạng được lưu vào từng mục bàn giao, không thay đổi tình trạng gốc của tài sản. Ảnh gắn với đúng mục bàn giao; ảnh tải lỗi có thể thử lại mà không tạo lại hợp đồng.
- Phân biệt nghiệp vụ: **Thanh lý** đánh dấu tài sản đã thanh lý, không thể tiếp tục điều chuyển sử dụng; **Bỏ khỏi phòng** chỉ bỏ vị trí phòng, tài sản vẫn có thể được sử dụng lại.

## Kiểm thử đã chạy

- `npm test`: 421 bài đạt, 1 bài bỏ qua; 58 tệp đạt, 1 tệp bỏ qua. Bài bỏ qua yêu cầu `TEST_POSTGRES_URL`.
- `npx tsc --noEmit`: đạt.
- `npm run lint`: không có lỗi, còn 32 cảnh báo.
- `E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/contract-create-one-page.spec.ts`: 6/6 đạt, bao gồm tạo hợp đồng, tình trạng và ảnh tài sản.

## Việc còn lại

1. Xem lại diff và kiểm tra thủ công giao diện nếu cần, đặc biệt trải nghiệm thêm người ở, nhập tình trạng, chọn và thử tải lại ảnh.
2. Rà lại yêu cầu trước đó về xem trước PDF mẫu hóa đơn bằng dữ liệu mẫu; trạng thái hoàn thiện của phần này chưa được xác minh trong lượt bàn giao này. Hoàn tất và kiểm thử nếu còn thiếu.
3. Xem lại các cảnh báo lint nếu cần; một cảnh báo liên quan thẻ `img` dùng để xem trước ảnh tạm thời.
4. Nếu cần xác minh toàn bộ kiểm thử PostgreSQL, cấu hình `TEST_POSTGRES_URL` cho cơ sở dữ liệu thử nghiệm và chạy lại bài bị bỏ qua.
5. Sau khi rà soát, commit các thay đổi thuộc phạm vi công việc; kiểm tra kỹ danh sách tệp staged và không vô tình commit `tests/integration/assets.test.ts` của người dùng.
