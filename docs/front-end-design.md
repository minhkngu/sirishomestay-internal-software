# Quy tắc thiết kế giao diện

### Bố cục trang danh sách
- Thứ tự: tiêu đề + dòng mô tả ngắn → dải tổng quan → tab → một thanh lọc → bảng → phân trang. Không thêm panel/cây lọc bên cạnh.
- Mỗi tab chỉ một nút chính; nút phụ dùng outline/ghost.
- Dải tổng quan là một khung chia ô (2 cột trên điện thoại, 4 cột trên desktop): nhãn 13px, số 24px `tabular-nums`, đơn vị nhỏ màu muted. Không icon trong ô, không lặp lại số đếm ở toolbar hay tab.
- Số trong dải tổng quan và bảng luôn tính từ dữ liệu đang lọc, không viết cứng.

### Bộ lọc
- Dùng `Select` trong `src/components/ui/select.tsx` cho mọi menu lọc và ô "Số dòng"; không dùng `<select>` native cho menu nổi vì menu native theo hệ điều hành, lệch thiết kế. Mọi chỗ chọn một giá trị đều dùng `Select`; không còn `<select>` native. Trong form, dùng `OptionSelect` (`src/components/option-select.tsx`): có kiểm soát hoặc `defaultValue`, có `name` thì gửi kèm form qua ô ẩn.
- Các bộ lọc cùng chiều cao 36px (`h-9`), cùng bo góc; mũi tên do `Select` vẽ, không tự thêm mũi tên native.
- Lọc vị trí là hai dropdown phẳng, phụ thuộc: **Toà → Vị trí**. Chưa chọn toà chỉ có Tất cả, Kho, Khu chung, Chưa xếp trên toàn bộ toà; chọn toà mới hiện danh sách phòng. Đổi toà phải reset vị trí.
- Không dựng lại cây vị trí; không lặp cùng một bộ lọc ở nhiều nơi.
- "Chưa xếp" = tài sản thuộc toà nhưng chưa gán phòng/kho; luôn lọc được trên tất cả toà. Không có tài sản không thuộc toà (`facility_id` NOT NULL; xoá toà/phòng thì tài sản bị xoá theo).
- Tìm kiếm/lọc xử lý tại trình duyệt, không gọi server; giữ trạng thái lọc trong state của trang hoặc URL như hiện có.

### Bảng
- Bảng nằm trong một card `rounded-2xl border`, không shadow; header chữ thường 13px màu muted, không in hoa.
- Cột định danh 2 dòng: mã đậm + tên nhỏ. Vị trí một dòng dạng "Phòng 101 · Bình Thạnh" hoặc "Kho · ...". Trạng thái là chip nhạt (Tốt / Trầy xước / Hỏng / Đã thanh lý). Tiền căn phải, `tabular-nums`, dùng `formatVND`.
- Không lặp cột "Toà" nếu đã nằm trong cột vị trí; không hiện cột rỗng ở mọi dòng.
- Có checkbox chọn dòng; header có checkbox "chọn tất cả" (indeterminate khi chọn một phần). Thanh thao tác hàng loạt là overlay cố định, không đẩy layout bảng.
- Dưới `lg`, bảng chuyển thành dòng 2 dòng, không tràn ngang; vẫn đủ trường, không cắt số.
- Phân trang dùng `Pager` chung; ô "Số dòng" dùng `Select` của app.

### Hộp thoại và biểu mẫu
- Form thêm/sửa ngắn (thêm tài sản, thêm vật tư, cập nhật kho) đặt trong `Dialog`, không nhét form thô vào đầu trang.
- Nhãn nằm trên ô, ô cao 36px; nút chính ở footer; lỗi hiện trong hộp thoại.
- Thiết kế lại không được đổi dữ liệu, quyền hay hành vi nghiệp vụ.

### Màu, chữ, trạng thái
- Nền `#F6F8F7`, card trắng, viền `border-border/70`. Xanh thương hiệu chỉ trên nút chính, tab active, mục đang chọn và chip trạng thái.
- Không gradient, glow, icon trong ô màu. Shadow chỉ cho overlay thật (dialog/menu/thanh nổi); ưu tiên border hoặc ring.
- Be Vietnam Pro: tiêu đề trang 20px, số tổng 24px, nội dung 14px, nhãn 12–13px.
- Trạng thái tài sản: `disposed` → Đã thanh lý, `broken` → Hỏng, `in_use` → hiện tình trạng (Hư/Hỏng gộp thành Hỏng). Số 0 in là 0; thiếu dữ liệu dùng "—"; dữ liệu cũ thiếu toà ghi "Không rõ toà".

### Ô nhập tiền
- Ô tiền dùng `src/components/ui/money-input.tsx` (tự thêm dấu chấm, giữ con trỏ, cho phép số âm khi cần); không dùng `type="number"` cho tiền.
- Hiển thị tiền bằng `formatVND` (dấu chấm hàng nghìn, không đổi sang dấu phẩy).

### Điện thoại
- Topbar gọn: "Siris" + avatar + Đăng xuất; ẩn tên người dùng ở màn hẹp.
- Bộ lọc xuống dòng gọn, không tràn ngang; bảng thành dòng 2 dòng; nút chính vẫn ở đầu trang hoặc đầu tab.
- Khi đổi một `<select>` native sang `Select`, cập nhật e2e từ `selectOption` sang click trigger rồi `getByRole('option')`.
