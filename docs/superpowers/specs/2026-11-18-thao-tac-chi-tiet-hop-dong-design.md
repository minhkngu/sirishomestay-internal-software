# Thao tác trên trang chi tiết hợp đồng

## Mục đích
Nhân viên làm việc chủ yếu ở trang chi tiết hợp đồng nhưng trang này chưa có nút thao tác nào (chỉ danh sách có), ghi chú không nhập được, và khối "Trạng thái ký" rườm rà. Gom lại cho gọn và dùng được ngay tại trang.

## Yêu cầu (theo lời người dùng)
1. Không xoá được hợp đồng (bấm ở trang danh sách, không phản hồi) — là lỗi.
2. Chuyển nút "Chuyển phòng" và các nút thao tác lên góc phải trên cùng trang chi tiết.
3. Ghi chú trong chi tiết hợp đồng không ghi được.
4. Hover icon chưa hiện ngay.
5. Khối trạng thái ký: chỉ giữ xuất Word, xuất PDF, tải bản đã ký; các trạng thái đưa lên trên.

## Mục tiêu / không làm
- Làm: 5 mục trên. Không đổi quy tắc nghiệp vụ của sửa, xoá, thanh lý, gia hạn, chuyển nhượng, khôi phục.
- Không làm: không đổi trang danh sách (chỉ dùng chung tooltip), không đổi hợp đồng cọc ngoài phần nó dùng chung với `SignStatus`.
- Thất bại nếu: nút ở trang chi tiết thao tác khác với danh sách, hoặc xoá/ghi chú vẫn im lặng khi lỗi.

## Cách làm đã chọn (A: hàng icon)
Hai hướng đã cân nhắc: A hàng icon dùng lại hộp thoại có sẵn; B một menu "Thao tác" có chữ. Người dùng chọn A.

- Góc phải khung đầu trang chi tiết: hàng icon Sửa, Xoá (khi có quyền `delete_contracts`), Thanh lý, Chuyển nhượng, Gia hạn, Khôi phục, thêm Chuyển phòng. Dùng lại `ContractRowActions`; nút Chuyển phòng mở `TransferWizard` hiện có, bỏ khỏi mục Phụ lục.
- Tooltip tức thì: thêm component tooltip dùng chung (`@base-ui/react`) thay cho thuộc tính `title`, áp dụng cho hàng icon (cả danh sách và chi tiết).
- Ghi chú (người dùng chốt): lưu chung với toàn bộ hợp đồng, không có nút lưu riêng và không thêm service riêng. Ghi chú sửa trong hộp thoại "Sửa hợp đồng" (đã có ô ghi chú, lưu qua `updateLease`), nay mở được ngay từ trang chi tiết nhờ hàng icon. Trang chi tiết vẫn hiện ghi chú để đọc. Khi kiểm tra phải xác nhận ghi chú lưu và hiện lại đúng.
- Trạng thái ký (người dùng chốt): chỉ hai trạng thái "Chưa ký" và "Đã ký", hiển thị ở khung đầu trang. Khối giấy tờ chỉ còn Xuất Word, Xuất PDF, Tải bản đã ký (và liên kết xem bản đã ký). Bỏ hai nút "Đánh dấu đã xuất" và "Đánh dấu đã ký (chưa có file)". Xuất Word/PDF không đổi trạng thái; chỉ tải lên bản đã ký mới chuyển sang "Đã ký".

## Các quyết định của tôi (người dùng chưa nói, cần soát)
- Giá trị lưu trong DB giữ nguyên (`draft`/`exported`/`signed`); `draft` và `exported` đều hiển thị "Chưa ký". Không cần migration.
- "Tải bản đã ký" hiểu là tải lên bản đã ký (đúng nhãn hiện tại); đã ký thì hiện thêm liên kết xem.
- Hợp đồng cọc dùng chung `SignStatus` nên đổi theo.

## Lỗi xoá hợp đồng
Chưa tái hiện được. Nghi vấn: `window.confirm` bị chặn nên không có phản hồi, hoặc phải bấm hai lần (icon mở hộp thoại rồi mới có nút Xoá). Sẽ tái hiện bằng trình duyệt trước khi sửa. Hướng sửa dự kiến: thay `window.confirm` bằng hộp xác nhận trong ứng dụng, bấm một lần là xoá được, luôn hiện kết quả hoặc lỗi.

## Để người làm quyết định
Bố cục chi tiết của hàng icon trên màn hình hẹp; câu chữ hộp xác nhận.

## Kiểm tra
Test tích hợp cho xoá hợp đồng và lưu ghi chú qua `updateLease`; kiểm tra trình duyệt cho hàng icon, tooltip, ghi chú, trạng thái ký.
