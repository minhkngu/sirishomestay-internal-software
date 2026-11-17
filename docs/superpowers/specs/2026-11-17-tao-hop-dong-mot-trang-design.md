# Tạo hợp đồng thuê trên một trang

## Mục tiêu

Thay biểu mẫu tạo hợp đồng thuê nhiều bước bằng một trang duy nhất, các mục rõ ràng và một nút tạo. Áp dụng cả khi tạo mới và khi chuyển từ hợp đồng cọc. Giữ các quy tắc nghiệp vụ hiện có về quyền, phòng, người ở, phí, hóa đơn và chuyển cọc.

## Phương án

Đã cân nhắc hiển thị đầy đủ danh sách vật dụng trên trang hoặc chỉ hiện bản tóm tắt và mở vùng chỉnh sửa riêng. Chọn phương án đầu: người dùng thấy và chỉnh danh sách ngay tại mục bàn giao; mục này có mũi tên thu gọn/mở rộng. Mỗi tài sản là một thẻ gọn xếp cạnh nhau, chỉ hiện tên và model. Chọn thẻ mở menu ngay bên dưới với các thao tác chuyển vào kho, thanh lý hoặc bỏ khỏi phòng; không có dòng Hủy. Đóng menu bằng cách chọn lại hoặc bấm ra ngoài.

## Nội dung và hành vi

- Các mục gồm phòng và người thuê/người ở; thời hạn, giá thuê; tiền cọc, tiền đã cọc; phí dịch vụ; thanh toán và cách tính; ghi chú; biên bản bàn giao; ảnh đính kèm chung hợp đồng; tóm tắt và nút tạo.
- Chọn phòng nạp tài sản hiện có trong phòng. Cho phép chọn tài sản đã có trong hệ thống hoặc tạo tài sản mới ngay tại đây. Thẻ chỉ hiện tên và model; dữ liệu mẫu là minh họa, không phải giới hạn trường khi tạo tài sản.
- Bỏ khỏi phòng giữ lại tài sản và lịch sử, không coi là thanh lý hoặc chuyển vào kho. Cần bổ sung trạng thái vị trí phù hợp vì mô hình hiện tại bắt buộc tài sản thuộc phòng, khu chung hoặc kho. Thanh lý và chuyển kho ghi lịch sử theo nghiệp vụ tài sản.
- Tiền đã cọc là khoản thực nhận, được ghi vào sổ cọc khi tạo; phần còn thiếu là khoản chờ thu. Khi chuyển từ hợp đồng cọc, hiển thị và kế thừa số đã thực nhận, chỉ ghi khoản mới nếu có thêm, tránh ghi trùng. Kiểm tra số tiền hợp lệ và giải thích rõ khoản còn thiếu.
- Biên bản bàn giao nhận phòng được tạo cùng hợp đồng với danh sách tài sản đã chọn. Thay đổi tài sản chỉ có hiệu lực khi tạo thành công; không thay đổi chỉ vì người dùng mở hoặc chỉnh biểu mẫu.
- Ảnh được chọn trước khi tạo và gắn với hợp đồng, không gắn vào từng vật dụng. Nếu tải ảnh thất bại sau khi hợp đồng đã được tạo, thông báo rõ ảnh nào chưa được lưu và cho phép xử lý lại mà không tạo hợp đồng trùng.
- Hiển thị lỗi ngay cạnh trường hoặc mục liên quan; giữ dữ liệu đã nhập khi lỗi, hạn chế gửi trùng, và chuyển tới chi tiết sau khi tạo thành công.

## Kiểm chứng

Kiểm thử tạo mới và chuyển từ hợp đồng cọc, số tiền đã thu và còn thiếu, ghi chú, ảnh, danh sách bàn giao, các lựa chọn xử lý tài sản và trường hợp thất bại. Kiểm tra giao diện trên màn hình rộng và hẹp, đặc biệt danh sách thẻ và menu dưới thẻ. Bảo toàn thay đổi hiện có của người dùng trong workspace.
