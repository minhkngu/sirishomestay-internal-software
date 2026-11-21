# Hoá đơn lẻ, trang Chỉ số, dọn phí — thiết kế

## Mục đích
Nhân viên cần lập nhanh một hoá đơn cho một phòng, ghi chỉ số cuối tháng để chốt điện nước cho hoá đơn, và dọn danh sách loại phí cho gọn. Ba việc này gộp một đợt vì cùng nằm trên đường "chốt chỉ số → lập hoá đơn".

## Mục tiêu
- Tạo hoá đơn lẻ: Toà → Phòng → Tháng, hạn thanh toán lấy theo Cài đặt.
- Trang Chỉ số chỉ có hai việc: quản lý đồng hồ, và ghi/xem chỉ số chốt hằng tháng.
- Sửa trực tiếp số liệu điện nước trên hoá đơn khi thấy sai.
- Bỏ "Nhập tay" gây rối; cho xoá loại phí khỏi Cài đặt.

## Không làm
- Không bỏ "Sinh hàng loạt" (nhân viên vẫn dùng cho nhanh).
- Không đổi công thức: hoá đơn tháng N = tiền phòng + phí cố định tháng N (trả trước) + điện, nước, phí theo đồng hồ của tháng N−1 (trả sau).
- Không sửa dữ liệu hay quyền hiện có ngoài những gì liệt kê dưới đây.

## Chống thất bại
Một chức năng "xong" mà vẫn phải mở ba màn hình để lập một hoá đơn, hoặc sửa tay số điện trên hoá đơn rồi bị duyệt đè mất, là thất bại dù code chạy đúng.

## Hướng làm đã chọn (và vì sao)
Trang Chỉ số giữ một route, hai tab (**Chốt chỉ số**, **Đồng hồ**), tận dụng lưới ghi và danh sách đồng hồ có sẵn. Đã cân nhắc tách hai trang (thêm mục menu, bất tiện khi chốt số) và làm theo từng phòng (chậm khi chốt cả toà cuối tháng). Mọi lựa chọn khác trong tài liệu này là quyết định của người thiết kế, người dùng chưa duyệt từng cái.

## Thiết kế

### 1. Hoá đơn lẻ
- Nút phụ **Tạo hoá đơn lẻ** trên trang Hoá đơn, mở popup (`FormDialog`). Chọn Toà → Phòng (chỉ phòng có hợp đồng thuê đang hiệu lực) → Tháng.
- Popup xem trước các dòng, tổng tiền và cảnh báo, rồi tạo một hoá đơn nháp.
- Dùng lại đúng đường tính của sinh hàng loạt (`previewBatch`/`createDrafts` tách phần tính theo từng hợp đồng) để hai đường ra cùng con số. Hợp đồng đã lập tới kỳ đó thì báo "đã trả trước tới …", không tạo.
- Thiếu chỉ số tháng N−1 thì chặn, nêu rõ đồng hồ nào chưa chốt.
- Quyền: `billing` theo toà, như hiện nay.

### 2. Hạn thanh toán
- Thêm quy tắc `day_of_invoice_month` ("ngày X của chính tháng hoá đơn") vào `DueRule`, `dueRuleSchema` và `computeDueDate`; hai quy tắc cũ giữ nguyên.
- Mặc định trong Cài đặt là `day_of_invoice_month` với X = 5. Hợp đồng có `dueRule` riêng thì ưu tiên như cũ.
- Hoá đơn tạo ra (lẻ lẫn hàng loạt) có hạn ngay lúc tạo, tính từ tháng của kỳ (hoá đơn tháng 7 → 5/7). Quy tắc cũ vẫn tính lúc duyệt như hiện nay. Hạn sửa được trên hoá đơn.

### 3. Trang Chỉ số
- Tab **Chốt chỉ số**: lọc Toà / Tháng / Phòng. Bảng: Phòng · Số cũ (số chốt tháng trước) · Số chốt tháng này (ô nhập) · Dùng. Chỉ số đầu tiên của đồng hồ lấy từ số ghi khi tạo hợp đồng. Nút "Xem nhiều tháng" thay tab Theo tháng.
- Tab **Đồng hồ**: danh sách, thêm/thay/gỡ đồng hồ như hiện nay; thêm cột **Chỉ số hiện tại** (số chốt mới nhất + ngày) cạnh Chỉ số đầu.
- Lưu chỉ số chỉ thêm/sửa dòng chốt của tháng, không đổi chỉ số đầu (đã đúng trong code; chỉ sửa hiển thị).
- Chỉ số đầu chỉ chỉnh ở tab Đồng hồ.

### 4. Sửa chỉ số điện nước ngay trong hoá đơn (ghi ngược về tab Chỉ số)
- Hiện dòng phí hợp đồng (kể cả điện, nước) bị khoá trong `updateLines`, và khi duyệt hệ thống tính lại theo đồng hồ. Đổi thành một nguồn sự thật duy nhất là bảng chỉ số:
  - Dòng theo đồng hồ trong hoá đơn nháp cho sửa **chỉ số mới** (và chỉ số cũ nếu là kỳ đầu của đồng hồ). Lưu = cập nhật dòng chốt tháng N−1 của đồng hồ đó (cùng kiểm tra như `saveReadings`: không nhỏ hơn số trước, không lớn hơn số sau), rồi tính lại dòng. Tab Chỉ số thấy số mới ngay.
  - Không còn cờ "chỉnh tay" tách khỏi chỉ số, nên duyệt tính lại vẫn đúng và không đè.
  - Ghi audit cho cả chỉ số và hoá đơn (số cũ → số mới).
  - Chỉ sửa được khi hoá đơn còn nháp, và đồng hồ chỉ có một đoạn chốt trong tháng (đồng hồ thay giữa tháng hoặc có chỉ số bàn giao thì báo "sửa ở tab Chỉ số"). Nếu hoá đơn tháng sau của cùng đồng hồ đã duyệt (số này là số đầu của nó) thì chặn và nêu rõ.
- Các dòng khác (phí phát sinh, điều chỉnh…) vẫn sửa trực tiếp như hiện nay. Hoá đơn đã duyệt giữ rule hiện tại (sửa dòng có audit).

### 4b. Thêm phí ngoài vào hoá đơn
- Hoá đơn nháp có nút **Thêm phí** mở **đúng hộp thoại chọn phí đang dùng khi tạo hợp đồng** (`FeePickerDialog`: tìm kiếm, lọc cách tính, nút tạo phí mới giống Cài đặt, giá theo toà), để hai nơi giống hệt nhau về giao diện lẫn cách dùng. Loại phí đã có trong hợp đồng hiện "Đã thêm" và không chọn được (dùng `usedTypeIds` có sẵn). Chọn xong thành dòng `one_off` có số lượng, đơn giá mặc định theo toà, sửa được. Vẫn cho thêm dòng tự do như đang có.
- Ràng buộc kiến trúc: một feature không import feature khác. Chuyển `FeePickerDialog` (cùng `BareSelect` và kiểu `FeeOption` nó dùng) từ `features/contracts` sang `src/components/` dùng chung, cả hợp đồng và hoá đơn import từ đó. Chỉ di chuyển và đổi import, không đổi hành vi ở hợp đồng; `renderCreateFee` vẫn do tầng route cấp như hiện nay.

### 4c. Hệ số và tính theo ngày
- Tiền phòng và phí dịch vụ cố định đã nhân hệ số kỳ (tính theo ngày khi không đủ tháng, theo Cài đặt `proration`: 30 ngày hoặc ngày thực tế; hoặc `fullMonth`). Giữ nguyên, bổ sung: mỗi dòng hiện rõ hệ số áp dụng (vd. "× 0,6667 = 20/30 ngày") để nhân viên đối chiếu, và đổi hệ số/kỳ ở đầu hoá đơn thì các dòng này tính lại.

### 5. Phí
- Bỏ lựa chọn "Nhập tay" khỏi form loại phí. Migration chuyển `fee_types.quantity_from = 'manual'` sang `period_input`; chỗ nào đọc `manual` (picker hợp đồng, `legacyFixed`) đổi theo, kiểm tra không đổi cách tính hợp đồng đang chạy.
- Thêm **xoá** loại phí: xoá hẳn khi chưa có `lease_fee_snapshots`, hoá đơn hay đồng hồ nào dùng; nếu đã dùng thì từ chối với thông báo và gợi ý "Lưu trữ" (giữ nguyên chức năng lưu trữ). Xoá kèm giá theo toà và mặc định theo toà (đã cascade). Quyền `settings`, có audit.

## Việc để người xây tự quyết
- Bố cục chi tiết, văn bản nhãn, thứ tự cột.
- Cách tách hàm tính hoá đơn theo từng hợp đồng cho popup.
- Dạng của dữ liệu `meta.overridden`.

## Kiểm thử
Unit cho `computeDueDate` (quy tắc mới, tháng ngắn), logic tính hoá đơn lẻ; integration (PGlite) cho tạo hoá đơn lẻ, duyệt không đè dòng đã sửa, xoá phí đã/chưa dùng, migration `manual`; e2e cho popup tạo hoá đơn lẻ và tab Chỉ số.
