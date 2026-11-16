# Checklist kiểm thử đợt 2

Chỉ dùng môi trường thử với dữ liệu giả. Ghi kết quả và góp ý vào từng mục.

- [ ] **Cọc và thuê:** Chọn phòng trống, tạo hợp đồng cọc và kiểm tra trạng thái “Đã cọc”. Chuyển cọc thành hợp đồng thuê; kiểm tra phòng chuyển “Đang ở”, người ở và số tiền. Ghi chú: ______
- [ ] **Mẫu Word và ký:** Mở hợp đồng, xuất Word, kiểm tra dữ liệu và tải tệp đã ký để đánh dấu đã ký. Ghi chú: ______
- [ ] **Tài sản:** Chuyển hai tài sản từ kho vào một phòng; kiểm tra vị trí mới và lịch sử. Ghi chú: ______
- [ ] **Điện nước:** Ghi chỉ số mới, thử nhập thấp hơn chỉ số cũ để kiểm tra thông báo lỗi, sau đó thay đồng hồ và kiểm tra lịch sử. Ghi chú: ______
- [ ] **Bàn giao:** Tạo check-in, kiểm tra danh sách tài sản; tạo check-out, đánh dấu hỏng hoặc mất và nhập khoản phạt. Ghi chú: ______
- [ ] **Phân quyền:** Đăng nhập Hùng, mở phòng đang có khách tại Bình Thạnh; vẫn thấy trạng thái nhưng không thấy tên khách và tiền. Thử mở hợp đồng hoặc bàn giao trực tiếp. Ghi chú: ______
- [ ] **Vật tư:** Tại Tài sản & kho, nhập 20 bóng đèn, chuyển 3 vào phòng và kiểm tra kho còn 17, phòng có 3. Thử chuyển vượt số lượng và xuất dùng. Ghi chú: ______
- [ ] **Người ở:** Thử thêm công ty vào danh sách người ở của hợp đồng; ứng dụng phải từ chối và giải thích. Ghi chú: ______

## Kết quả chuẩn bị bản thử — 16/11/2026

- Migration và `db:seed` không `--reset` đã chạy trên Supabase dev `siris-pms`. Vì session pooler báo hết kết nối, lệnh chạy qua transaction pooler. Đối chiếu ngay sau seed: 2 cơ sở, 34 khách, 26 hợp đồng, 5 tài khoản; 6 loại vật tư và 18 mức tồn. Cả ba bảng vật tư bật RLS.
- Preview Vercel: [bản thử đợt 2](https://siris-internal-software-ailp7mkz5-lucas-projects-5f5d0170.vercel.app), deployment `dpl_AmirWHHXpwdk4TALCWmYeFL5K6Wy`, trạng thái READY, môi trường preview, chế độ dữ liệu giả. Preview dùng transaction pooler riêng để tránh lỗi hết kết nối session pooler; không đổi cấu hình production.
- Playwright đã chạy thực tế với `E2E_BASE_URL` là URL preview trên, dùng token OIDC tạm thời trong header để qua Vercel Authentication: **5/5 đạt**. Các ca bao phủ phân quyền phòng, vật tư, cọc → thuê → Word → ký → bàn giao, chuyển hai tài sản, ghi chỉ số giảm và thay đồng hồ. Đây là kết quả chạy trong phiên, không phải kết quả bỏ qua do thiếu `E2E_BASE_URL`.
- Các bài kiểm thử trình duyệt tạo thêm hợp đồng, tài sản và vật tư thử; chúng cũng ghi/thay đồng hồ mẫu phòng TD 301 và 302. Số liệu ở mục đầu được đo trước các thao tác kiểm thử này.
- Link preview và checklist đã được gửi trong cuộc trò chuyện; việc người dùng tự thử và duyệt vẫn đang chờ.
