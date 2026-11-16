# Checklist duyệt chức năng

Dùng **môi trường thử với dữ liệu giả** (có dải "Môi trường thử — dữ liệu giả"). Thao tác tạo ra trong lúc thử được lưu lại trên môi trường thử. Mỗi mục: làm theo các bước, để ý điều ghi sau dấu →, rồi ghi kết quả vào ô ghi chú.

Tài khoản mẫu (đăng nhập nhanh ở trang đăng nhập): **Admin** (Cài đặt, thấy mọi cơ sở) · **Lan** (Quản lý Thảo Điền: khách & hợp đồng, hoá đơn) · **Minh** (Kế toán: hoá đơn) · **Hùng** (Kỹ thuật Bình Thạnh: điện nước, tài sản, sự cố) · **Vy** (Lễ tân Thảo Điền: khách & hợp đồng, điện nước).

## 1. Nhắc việc
- [ ] Đăng nhập Admin → trang Nhắc việc. → Dải số liệu (Đang ở / Đã cọc / Trống / Công nợ quá hạn); thẻ sắp theo mức độ, tối đa 8 dòng, "Xem tất cả" mở danh sách lọc sẵn. Ghi chú: ______
- [ ] Đăng nhập Hùng. → Chỉ thấy thẻ điện nước và sự cố của Bình Thạnh, không thấy hoá đơn hay khách. Ghi chú: ______
- [ ] Visa: hạn đã qua / sắp hết hạn có nhãn đúng; mở hồ sơ từ danh sách; đổi ngưỡng cảnh báo trong Cài đặt rồi đặt lại. Ghi chú: ______
- [ ] Hợp đồng sắp hết hạn, chưa ký, cọc chờ thu, ảnh sắp bị xoá (chỉ Admin). Ghi chú: ______

## 2. Khách thuê
- [ ] Tìm `nguyen van an` (không dấu) → ra kết quả. Ghi chú: ______
- [ ] Thêm khách nước ngoài với số điện thoại đã có, viết kiểu khác (`0901 234 567` / `+84 90 123 4567`). → Báo trùng bằng tiếng Việt, không tạo khách; đổi số hợp lệ thì lưu được. Ghi chú: ______
- [ ] Form khách Việt Nam và công ty: trường bắt buộc, thông báo lỗi. Tải ảnh giấy tờ; người thiếu quyền khách thuê không xem được ảnh. Ghi chú: ______

## 3. Cọc
- [ ] Chọn phòng trống, tạo hợp đồng cọc. → Phòng chuyển "Đã cọc". Ghi chú: ______
- [ ] Sổ cọc: thêm dòng thu bổ sung, đánh dấu đã thu. → Số dư luỹ kế đúng. Ghi chú: ______

## 4. Hợp đồng thuê
- [ ] Chuyển cọc thành hợp đồng thuê (wizard 5 bước, bước 4 có kỳ thanh toán và "tính nước theo đồng hồ"). → Phòng "Đang ở", người ở và số tiền đúng; cọc giữ chỗ chuyển sang sổ cọc; có **hoá đơn đầu tiên ở dạng nháp**. Ghi chú: ______
- [ ] Thêm công ty vào người ở. → Bị từ chối và giải thích. Ghi chú: ______
- [ ] Xuất Word, tải bản đã ký để đánh dấu đã ký. Ghi chú: ______

## 5. Bàn giao
- [ ] Check-in: danh sách tài sản của phòng; chụp ảnh từng món; hoàn tất. Ghi chú: ______
- [ ] Check-out: đánh dấu Hư/Mất, nhập tiền phạt; hoàn tất. Ghi chú: ______

## 6. Điện nước
- [ ] Ghi chỉ số mới; thử nhập thấp hơn chỉ số cũ. → Báo lỗi tại ô nhập, không tính tiền âm. Ghi chú: ______
- [ ] Thay đồng hồ; xem lịch sử đồng hồ của phòng. Ghi chú: ______

## 7. Hoá đơn và thu tiền
- [ ] Hoá đơn → Tạo hàng loạt: chọn cơ sở và kỳ → xem trước. → Cảnh báo "Chưa ghi chỉ số…"; hợp đồng đã trả trước ghi "Đã trả trước tới dd/mm/yyyy". Tạo nháp lần hai không sinh trùng. Ghi chú: ______
- [ ] Mở hoá đơn nháp: sửa dòng, thêm dòng điều chỉnh/phạt, sửa kỳ thành 3 tháng (hệ số), chọn hạn thanh toán, duyệt. → Hạn "ngày 5 tháng sau" đúng; sửa hoá đơn đã duyệt có ghi nhật ký. Ghi chú: ______
- [ ] Ghi thu một phần → "Thu một phần"; thu đủ → "Đã thu đủ"; quá hạn → "Quá hạn". Gỡ khoản thu; xoá hoá đơn có khoản thu phải bị chặn. Ghi chú: ______
- [ ] Hoá đơn tổng âm: nhập khoản thu âm bằng tổng → "Đã hoàn"; hoá đơn dương nhận số âm phải bị từ chối. Ghi chú: ______
- [ ] Phí phát sinh (nút "Thêm phí phát sinh" ở hợp đồng/phòng): đã vào hoá đơn đã duyệt thì không gỡ được; còn ở hoá đơn nháp thì gỡ được. Ghi chú: ______
- [ ] Công nợ của khách hiển thị ở hoá đơn. Ghi chú: ______

## 8. Phụ lục: gia hạn / chuyển phòng / thanh lý / đổi người ở
Mỗi phụ lục có bước **Xem trước tiền** — xem trước không lưu gì.
- [ ] Gia hạn tăng giá và cọc. → Có điều chỉnh chờ cho kỳ sau (hoặc ghi vào hoá đơn đã duyệt nếu chọn), sổ cọc có khoản thu bổ sung chờ, ngày kết thúc cập nhật. Ghi chú: ______
- [ ] Chuyển phòng giữa tháng (cần chỉ số điện nước hai phòng). → Tạo check-out phòng cũ, check-in phòng mới; điều chỉnh đúng dấu; phòng đích không trống bị chặn. Ghi chú: ______
- [ ] Đổi người ở (2 → 3). → Điều chỉnh phí theo người. Ghi chú: ______
- [ ] Thanh lý (có mất cọc một phần/toàn bộ): xem trước → lưu → hoá đơn thanh lý nháp → duyệt. → Hợp đồng "Đã kết thúc", số dư cọc về 0, tiền hoàn theo dõi trên hoá đơn (Chờ hoàn khách → Đã hoàn). Ghi chú: ______
- [ ] Phụ lục: xuất Word, đánh dấu đã ký. Ghi chú: ______

## 9. Tài sản và vật tư
- [ ] Chuyển hai tài sản từ kho vào phòng; kiểm tra vị trí và lịch sử (có bàn giao và sự cố). Ghi chú: ______
- [ ] Vật tư: nhập 20 bóng đèn, chuyển 3 vào phòng → kho 17, phòng 3; thử chuyển vượt số lượng. Ghi chú: ______

## 10. Sự cố
- [ ] Báo sự cố từ trang phòng, thêm ảnh; chuyển Mới → Đang xử lý → Xong. Lọc "Việc của tôi". Ghi chú: ______
- [ ] Sự cố do khách có chi phí → khi Xong, có phí phạt chưa tính trong phí phát sinh của hợp đồng đang ở. Ghi chú: ______

## 11. Người dùng và phân quyền
- [ ] Hùng mở trực tiếp `/tenants`, `/invoices`, hợp đồng, bàn giao → "Không tìm thấy". Hùng xem phòng đang có khách: thấy trạng thái, không thấy tên khách và tiền. Ghi chú: ______
- [ ] Người chỉ được giao một cơ sở mở phòng thuộc cơ sở khác bằng đường dẫn → không xem được. Ghi chú: ______
- [ ] Admin thêm quyền Hoá đơn cho Vy → Vy thấy menu Hoá đơn; bỏ quyền để khôi phục. Ghi chú: ______
- [ ] Nhật ký: thao tác vừa làm có người thực hiện, đối tượng, thời gian (kèm trước/sau cho sửa hoá đơn đã duyệt). Ghi chú: ______

## 12. Mẫu Word / PDF / ảnh
- [ ] Mẫu giấy tờ: tải mẫu, "Thử xuất với dữ liệu mẫu". Ghi chú: ______
- [ ] Xuất Word: hợp đồng, phụ lục, hoá đơn, phiếu thu (từ khoản thu). → Dữ liệu và định dạng tiền/ngày đúng. Ghi chú: ______
- [ ] Xuất PDF (hợp đồng, hoá đơn) và Ảnh (chỉ hoá đơn). → Chỉ chạy khi đã cấu hình `GOTENBERG_URL`; chưa cấu hình phải báo rõ, không lỗi trắng. Ghi chú: ______

## 13. Nhập Excel
- [ ] Nhập → "Tải file mẫu" từng loại (khách, phòng, hợp đồng, số dư cọc, công nợ, chỉ số, tài sản). Ghi chú: ______
- [ ] Nhập file khách có dòng sai: xem trước hiện dòng lỗi (tải CSV lỗi được), nhập các dòng hợp lệ; nhập lại cùng file không tạo trùng. Ghi chú: ______
- [ ] Nhập công nợ hai lần → mỗi hợp đồng một hoá đơn; công nợ đã có khoản thu bị báo lỗi dòng. Ghi chú: ______

## 14. Cài đặt
- [ ] Ngưỡng cảnh báo (số ngày không hợp lệ phải báo lỗi), loại phí, đơn giá điện nước (đổi giá có hiệu lực từ ngày), ngày tạo hoá đơn dự kiến theo cơ sở, cách tính lẻ ngày. Ghi chú: ______

## Tổng hợp góp ý
- Đạt / chưa đạt: ______
- Vấn đề cần sửa và mức ảnh hưởng: ______
- Đề xuất cho giai đoạn sau: ______
