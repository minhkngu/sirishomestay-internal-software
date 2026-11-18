# Sửa và xoá hợp đồng

## Mục đích và phạm vi

Cho phép nhân viên sửa hợp đồng đã tạo để khắc phục sai sót, và cho người được cấp quyền riêng xoá hợp đồng nhập sai. Phạm vi dự kiến gồm hợp đồng thuê và hợp đồng cọc; tận dụng phân quyền theo cơ sở hiện có. Không bổ sung cơ chế khôi phục dữ liệu đã xoá.

## Phương án

Đã cân nhắc xoá hẳn dữ liệu liên quan và đánh dấu đã xoá để khôi phục. Người dùng chọn xoá hẳn vì đây là thao tác xử lý dữ liệu nhập sai; phương án đánh dấu đã xoá giữ lịch sử nhưng cần thêm quản lý và khôi phục.

## Hành vi

- Cho phép sửa hợp đồng kể cả khi đã có hoá đơn hoặc khoản tiền cọc. Giữ nguyên hoá đơn và các khoản tiền cọc hiện có; nhân viên tự kiểm tra và điều chỉnh. Nếu hợp đồng đã ký, cảnh báo và yêu cầu xác nhận trước khi lưu thay đổi.
- Quản trị viên tự có quyền xoá; những người khác cần được cấp quyền **xoá hợp đồng** riêng và có quyền đối với cơ sở liên quan. Kiểm tra quyền ở phía máy chủ, không chỉ ẩn nút.
- Trước khi xoá, cảnh báo rõ rằng hợp đồng và các hoá đơn, khoản tiền cọc, thanh toán, phụ lục, biên bản bàn giao liên quan sẽ bị xoá; yêu cầu xác nhận. Với hợp đồng đã ký, nêu rõ trạng thái đã ký trong cảnh báo. Thực hiện xoá nhất quán, không để dữ liệu liên quan dở dang.
- Không tự động tạo hoá đơn khi tạo hoặc ký hợp đồng. Các hoá đơn đã có được giữ nguyên cho đến khi nhân viên tự điều chỉnh hoặc xoá hợp đồng.
- Ghi nhận thao tác sửa và xoá trong lịch sử hoạt động theo cơ chế hiện có. Các ràng buộc dữ liệu và quyền truy cập hiện có vẫn được kiểm tra.

## Chi tiết triển khai

Người triển khai xác định cách tái sử dụng biểu mẫu và xử lý các liên kết dữ liệu phụ thuộc khác, bảo đảm không xoá hồ sơ khách thuê, phòng hoặc tài sản gốc. Kiểm thử quyền, cảnh báo, xác nhận, sửa không thay đổi hoá đơn và tiền cọc, xoá các dữ liệu liên quan, và việc tạo/ký hợp đồng không tự tạo hoá đơn.
