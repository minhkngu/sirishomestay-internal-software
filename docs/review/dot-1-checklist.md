# Checklist kiểm thử đợt 1 — Nền tảng

Bản thử dùng dữ liệu giả. Ghi kết quả, ảnh chụp màn hình và thao tác dẫn đến lỗi vào mục ghi chú. Các thay đổi tạo ra trong lúc thử được lưu lại trên môi trường thử.

## Đăng nhập và phân quyền

- [ ] Đăng nhập nhanh bằng Admin: thấy dải môi trường thử và trang Nhắc việc. Ghi chú: ______
- [ ] Đăng xuất, đăng nhập bằng Hùng, mở trực tiếp `/tenants`: thấy “Không tìm thấy”, không thấy thông tin khách. Ghi chú: ______
- [ ] Đăng nhập Admin, mở Người dùng → Vy, thêm quyền Hoá đơn & thu tiền và lưu. Đăng nhập lại bằng Vy: menu Hoá đơn xuất hiện. Sau khi thử, Admin bỏ quyền vừa thêm để khôi phục. Ghi chú: ______
- [ ] Với người dùng chỉ được giao một cơ sở, kiểm tra danh sách cơ sở và thử mở phòng thuộc cơ sở khác bằng đường dẫn trực tiếp: không xem được dữ liệu ngoài phạm vi. Ghi chú: ______

## Cơ sở, phòng và cài đặt

- [ ] Mở Cơ sở & phòng, chọn Thảo Điền; kiểm tra sơ đồ phòng, tầng và các số liệu. Ghi chú: ______
- [ ] Chọn Tạo nhanh nhiều phòng, nhập tầng 5, từ 501 đến 503; kiểm tra kết quả và phòng trên sơ đồ. Nếu phòng đã tồn tại, xác nhận hệ thống báo bỏ qua thay vì tạo trùng. Ghi chú: ______
- [ ] Mở một phòng và kiểm tra các thông tin phòng hiển thị. Ghi chú: ______
- [ ] Trong Cài đặt, xem ngưỡng cảnh báo, loại phí và đơn giá; thử giá trị số ngày không hợp lệ và xác nhận có thông báo lỗi. Ghi chú: ______

## Khách thuê và giấy tờ

- [ ] Mở danh sách khách, tìm `nguyen van an`; kiểm tra kết quả không cần dấu. Ghi chú: ______
- [ ] Thêm khách nước ngoài bằng số điện thoại đã tồn tại, nhập theo cách viết khác: phải báo số trùng, không tạo khách. Đổi sang số hợp lệ chưa dùng và lưu; mở lại hồ sơ xác nhận dữ liệu. Ghi chú: ______
- [ ] Kiểm tra form khách Việt Nam và công ty, các trường bắt buộc và thông báo lỗi. Ghi chú: ______
- [ ] Tải ảnh giấy tờ mẫu, mở lại ảnh; kiểm tra người thiếu quyền khách thuê không truy cập được ảnh. Ghi chú: ______

## Nhắc visa và nhật ký

- [ ] Mở Nhắc việc bằng Admin; kiểm tra số lượng, ngày hết hạn, các trường hợp đã hết hạn và sắp hết hạn; mở hồ sơ từ danh sách. Ghi chú: ______
- [ ] Đổi ngưỡng cảnh báo visa trong Cài đặt và kiểm tra danh sách thay đổi; đặt lại giá trị ban đầu. Ghi chú: ______
- [ ] Mở Nhật ký, tìm thao tác vừa thực hiện và kiểm tra người thực hiện, đối tượng, thời gian. Ghi chú: ______

## Tổng hợp góp ý

- Đạt / chưa đạt: ______
- Vấn đề cần sửa và mức ảnh hưởng: ______
- Đề xuất cho các đợt tiếp theo: ______
