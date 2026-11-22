# Sửa phí dịch vụ trong popup chỉnh sửa hợp đồng

## Ý và lý do

Popup "Chỉnh sửa hợp đồng" hiện chỉ hiện tên · đơn vị, ô đơn giá và chữ "Theo đồng hồ" cho phí điện nước: không biết đang gắn đồng hồ nào, chỉ số đầu bao nhiêu, cũng không sửa được. Nhân viên phải mở tab Chỉ số hoặc sửa trong hoá đơn để đối chiếu. Mong muốn: khối phí trong popup sửa hiện đầy đủ như form tạo hợp đồng, sửa được cả đồng hồ lẫn chỉ số đầu; số đồng hồ lấy từ hợp đồng, biên bản bàn giao không cần chỉ số.

## Mục tiêu

- Mỗi dòng phí hiện: tên · đơn vị, cách tính (theo người ở / theo phòng / theo đồng hồ / nhập mỗi kỳ / số lượng cố định), đơn giá (`MoneyInput`).
- Phí theo đồng hồ hiện thêm: đồng hồ đang gắn, chỉ số đầu và ngày chốt; sửa được đồng hồ (cùng phòng, đang rảnh) và chỉ số đầu.
- Lưu cùng nút "Lưu thay đổi" của hợp đồng, ghi audit như tab Chỉ số.
- Bỏ phần chỉ số đồng hồ khỏi biên bản bàn giao (màn hình và bản in); số đồng hồ chỉ nằm ở hợp đồng, tab Chỉ số và phiếu thanh lý.
- Trang Chỉ số hiện đúng số đầu kỳ mà hoá đơn dùng khi hợp đồng bắt đầu giữa tháng.

## Phi mục tiêu

- Không đổi cách tính tiền, không tự sửa hoá đơn đã tạo.
- Không làm quy trình thay đồng hồ vật lý, không xoá được phí theo đồng hồ.
- Không thêm bảng/cột dữ liệu mới.

## Quyết định

- **Hoá đơn đã lập giữ nguyên số cũ.** Hoá đơn tháng đầu lập sau khi sửa thì dùng chỉ số mới. Muốn áp dụng chỉ số mới cho hoá đơn đã lập thì phải xoá hoá đơn đó rồi lập lại. Popup ghi rõ điều này.
- Chỉ người có quyền `meters` của toà mới thấy và sửa đồng hồ/chỉ số; người chỉ có quyền hợp đồng vẫn sửa được đơn giá.
- Giữ nguyên quy tắc: phí theo đồng hồ không gỡ được trong popup này.
- Biên bản bàn giao chỉ còn tài sản, tình trạng, ảnh, phạt.

## Cách làm

Đã cân nhắc: (a) chỉ hiện để xem rồi dẫn sang tab Chỉ số — trái yêu cầu; (b) chỉ cho sửa chỉ số, đổi đồng hồ phải qua quy trình thay đồng hồ — nặng hơn nhu cầu sửa nhầm; (c) sửa đầy đủ ngay trong popup — chọn cách này vì đúng thao tác người dùng đang làm và dùng lại được kiểm tra sẵn có.

### Dữ liệu cho popup

`quickContractDataAction` bổ sung vào mỗi phí: `quantitySource`, `quantity`, `meter` (id, nhãn), `opening` (giá trị chỉ số đầu, ngày chốt, id dòng chỉ số nếu có), và cờ `canEditMeters`. Chỉ số đầu của một phí = lần chốt sớm nhất của đồng hồ đang gắn có ngày từ ngày bắt đầu hợp đồng; không có thì lấy `meters.start_reading`/`installed_on` (dùng chung một hàm với trang chi tiết và hoá đơn để các nơi khớp nhau). Không có quyền `meters` thì không trả phần này.

### Lưu

`updateLease` nhận thêm cho dòng phí cũ: `existingMeterId`, `initialReading`. Trong cùng transaction:

- Đổi đồng hồ: đồng hồ phải thuộc phòng của hợp đồng, chưa gỡ, không gắn phí của hợp đồng đang chạy khác (trừ chính phí này); cập nhật `lease_fee_meters`; ghi chỉ số đầu cho đồng hồ mới tại ngày chốt cũ (hoặc ngày bắt đầu hợp đồng), báo lỗi nếu đồng hồ chưa lắp hoặc đã có chỉ số khác giá trị cùng ngày.
- Đổi chỉ số: sửa dòng chỉ số đầu đang dùng (hoặc `meters.start_reading` nếu dữ liệu cũ không có dòng); số nguyên ≥ 0, không nhỏ hơn chỉ số liền trước và không lớn hơn chỉ số liền sau của đồng hồ, không trước ngày lắp.
- Ghi audit (`meter_readings` khi sửa chỉ số, `meter` khi đổi liên kết), tiếng Việt.

Không tính lại hay sửa hoá đơn nào.

### Giao diện

Dòng phí theo đồng hồ trong popup sửa dùng lại bố cục của `LeaseFees` (form tạo): đơn giá `MoneyInput`, `BareSelect` chọn đồng hồ, ô chỉ số đầu, ngày chốt màu muted. Dòng phí vừa thêm trong phiên cũng sửa được đồng hồ/chỉ số trước khi lưu. Dòng phí không theo đồng hồ hiện cách tính và đơn giá, vẫn có nút Xoá. Thêm một dòng ghi chú: hoá đơn đã lập giữ nguyên; muốn áp dụng chỉ số mới thì xoá hoá đơn cũ và lập lại.

### Biên bản bàn giao

Bỏ mục "Chỉ số đồng hồ" khỏi form biên bản (cả check-in, check-out) và khỏi dữ liệu lưu biên bản. Mẫu biên bản mặc định bỏ bài "Chỉ số điện, nước"; mẫu cũ còn `@bang:chi_so` sẽ in bảng rỗng. Chỉ số đầu vẫn được ghi khi tạo hợp đồng và hiện ở trang hợp đồng/tab Chỉ số; chỉ số cuối khi trả phòng nhập ở phiếu thanh lý.

### Trang Chỉ số

Chuỗi số phải khớp hoá đơn: hoá đơn kỳ ký ghi chỉ số đầu hợp đồng làm cả số đầu và số cuối (chưa phát sinh); hoá đơn tháng sau lấy số cuối của kỳ trước làm số đầu.

- **Chốt tháng này:** số đầu kỳ = lần chốt gần nhất **trước ngày chốt của kỳ**, gồm chỉ số đầu hợp đồng khi hợp đồng bắt đầu giữa tháng; bỏ qua dòng chốt tháng của chính kỳ đang ghi. Nhãn ghi rõ ngày của lần chốt được dùng. Hợp đồng bắt đầu 21/11 thì tháng 11 hiện số đầu 1.250 (không phải 0), khớp hoá đơn kỳ ký. Không đổi dữ liệu.
- **Lịch sử:** dòng chốt đầu hợp đồng hiện Số đầu = Số cuối = chỉ số đầu, Dùng 0 (khớp hoá đơn kỳ ký); dòng chốt tháng và dòng bàn giao trả phòng hiện Số đầu = lần chốt trước, Dùng = chênh lệch. Không còn ô "—" ở các dòng này; vẫn giữ chip "Bàn giao" để biết là mốc chốt.

## Kiểm thử

Bổ sung test tích hợp cho: hiện đúng chỉ số đầu; đổi chỉ số hợp lệ và ghi audit; chặn số âm/nhỏ hơn trước/lớn hơn sau; đổi đồng hồ cùng phòng, chặn đồng hồ phòng khác/đang bận; hoá đơn đã lập giữ nguyên, hoá đơn lập lại dùng số mới; biên bản bàn giao không còn chỉ số; bảng Chốt tháng này và Lịch sử hiện đúng số đầu khi hợp đồng bắt đầu giữa tháng. Cập nhật test e2e popup sửa hợp đồng và trang biên bản bàn giao. Theo quy ước dự án, chỉ chạy test khi chuẩn bị mở PR.
