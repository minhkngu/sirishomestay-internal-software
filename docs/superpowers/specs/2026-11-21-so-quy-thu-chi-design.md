# Sổ quỹ Thu chi — thiết kế

## Mục đích
Tiền thu, chi, cọc hiện nằm rải rác: thu tiền thuê nhập ở danh sách hoá đơn, cọc nhập trong chi tiết hợp đồng, chi chưa có chỗ nào. Hoá đơn chỉ nên là giấy đòi tiền. Cần một tab **Thu chi** làm sổ quỹ chung: xem tất cả khoản thu, chi, cọc ở một nơi và nhập chúng ở đó.

## Mục tiêu
- Tab mới **Thu chi** (`/cashbook`): danh sách chung thu + chi + cọc, lọc theo thời gian, loại, cơ sở; dải tổng quan Thu, Chi, Chênh lệch, Cọc đang giữ.
- Nhập ở một nơi: popup "Thu tiền thuê", "Thu/hoàn cọc", "Thêm khoản chi".
- Chi gồm: sửa chữa, điện nước, lương (kèm "Khác" để khỏi ép sai loại).
- Bỏ phần tiền thu khỏi **giao diện** hoá đơn.

## Không làm
- Không gộp dữ liệu vào một bảng, không chuyển dữ liệu cũ: giữ `payments`, `deposit_entries`; thêm bảng `expenses`.
- Không đổi công thức công nợ hay cách phân bổ tiền thu (cũ nhất trước).
- Không làm bảng lương theo từng nhân viên, đối chiếu ngân hàng, đính kèm chứng từ, xuất Excel.
- Không sửa/xoá khoản thu tiền thuê đã ghi từ tab này (như hiện nay, chưa có chức năng đó).

## Chống thất bại
Tổng "Thu" ở tab Thu chi lệch với tiền đã thu theo hoá đơn, hoặc cọc đang giữ lệch với sổ cọc trong hợp đồng, là thất bại dù giao diện đẹp. Hoá đơn còn nút thu tiền sau khi đã chuyển sang tab mới cũng là thất bại.

## Hướng làm đã chọn
**A — gom xem, nhập một nơi** (người dùng chọn). Loại bỏ: một bảng sổ quỹ duy nhất (phải viết lại công nợ và chuyển dữ liệu thật, nhiều chỗ có thể vỡ); chỉ thêm tab Chi (không phải sổ quỹ chung).

## Thiết kế

### Dữ liệu
- Bảng mới `expenses`: `id`, `facility_id` (bắt buộc), `room_id` (tuỳ chọn), `category` (`repair` | `utility` | `salary` | `other`), `date`, `amount` (bigint, > 0), `method`, `payee` (người/đơn vị nhận, text), `note`, `created_by`, `is_demo`, `created_at`, `updated_at`. Migration bằng `db:generate`.
- Không đổi `payments`, `deposit_entries`.

### Danh sách chung (dòng sổ quỹ)
Gộp ba nguồn thành một dạng dòng: `{ source, id, date, direction, category, amount, facility, room/hợp đồng, bên liên quan, method, note }`.
- `payments` → Thu, loại "Tiền thuê/hoá đơn", gắn hợp đồng qua hoá đơn.
- `deposit_entries` trạng thái `done`: `collect`, `topup` → Thu cọc; `refund` → Chi hoàn cọc. `deduct`, `forfeit` là bù trừ nội bộ, **hiện nhưng không cộng vào Thu/Chi** (nhãn "không tiền mặt"). Trạng thái `pending` hiện "chờ thu", không cộng.
- `expenses` → Chi theo `category`.
- Cọc đang giữ = collect + topup − refund − deduct − forfeit (chỉ `done`), cùng cách tính với sổ cọc hiện có.
- Số trong dải tổng quan luôn tính từ dữ liệu đang lọc. Lọc, phân trang xử lý ở server (dữ liệu sổ quỹ lớn dần), dùng `Pager` chung.

### Nhập liệu (popup, `FormDialog`)
- **Thu tiền thuê**: chọn hợp đồng, số tiền mặc định = tổng dư nợ, ngày, hình thức, ghi chú. Gọi lại `recordLeasePayment` hiện có.
- **Thu/hoàn cọc**: dùng lại `addDepositEntry` và `markDepositDone`.
- **Thêm khoản chi**: loại, cơ sở, phòng (tuỳ chọn), ngày, số tiền (`MoneyInput`), người nhận, ghi chú. Sửa và xoá khoản chi được (có audit).
- Khoản thu tiền thuê và cọc chỉ xem, không sửa/xoá từ tab này.

### Quyền
Dùng lại quyền `billing` theo cơ sở (xem, nhập thu, nhập chi). Không thêm quyền mới để khỏi phải cấp lại cho người dùng hiện có. Đổi nhãn thành "Hoá đơn, thu chi".

### Bỏ khỏi giao diện hoá đơn
- Danh sách hoá đơn: bỏ icon thu tiền, `CollectPaymentDialog`, cột/tính toán công nợ theo hợp đồng.
- Chi tiết hoá đơn: bỏ phần lịch sử thu tiền (`payment-dialog`).
- Giữ nguyên ở server: `recordLeasePayment`, `leaseDebt`, phân bổ cũ nhất trước (tab Thu chi dùng). Giữ quy tắc "đã có tiền thu thì không Bỏ duyệt", đổi lời nhắc sang "xem ở Thu chi".

### Điều hướng
Mục "Thu chi" trong menu, ngay sau "Hoá đơn", yêu cầu `billing`.

## Việc để người xây tự quyết
Bố cục chi tiết, thứ tự cột, cách viết truy vấn gộp (union hay ba truy vấn rồi gộp có phân trang đúng), nhãn chữ.

## Kiểm thử
Integration (PGlite): dòng gộp đúng nguồn/hướng, deduct/forfeit/pending không cộng tổng, cọc đang giữ khớp sổ cọc, quyền theo cơ sở, thêm/sửa/xoá chi có audit, thu tiền thuê từ tab vẫn phân bổ cũ nhất trước. Cập nhật e2e hoá đơn (bỏ bước thu tiền) và thêm e2e tab Thu chi. Chỉ viết, chạy khi chuẩn bị PR.

## Các lựa chọn do người thiết kế đặt (người dùng chưa duyệt từng cái)
Dùng quyền `billing`; lương chỉ là một loại chi chứ không theo nhân viên; deduct/forfeit không tính vào Thu/Chi; phân trang ở server; khoản thu tiền thuê và cọc không sửa/xoá từ tab này; loại "Khác" cho chi.
