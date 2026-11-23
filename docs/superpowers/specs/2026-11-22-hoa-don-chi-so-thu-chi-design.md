# Hoá đơn, chỉ số điện nước, phí hợp đồng và Thu chi — thiết kế

Tài liệu duy nhất cho nhánh `claude/hoa-don-tai-chinh`, thay các thiết kế rời trước đó (hoá đơn lẻ và chỉ số, kỳ hoá đơn, sửa phí hợp đồng, sổ quỹ Thu chi). Ghi theo hành vi cuối cùng của nhánh.

## Mục đích
Nhân viên lập hoá đơn cho một phòng, ghi và sửa chỉ số điện nước ngay trong hoá đơn, sửa phí của hợp đồng, và xem tiền thực thu, thực chi ở một nơi. Mọi chỉ số do người dùng điền và sửa tuỳ ý, không bị ràng buộc chéo nhau.

## Nguyên tắc đã chốt (người dùng quyết)
1. **Chỉ số là độc lập.** Mỗi lần ghi tháng luôn lưu số đầu và số cuối của riêng nó (số đầu được ghi cố định lúc tạo lần ghi, lần ghi cũ được ghi cố định bằng migration); không lần ghi nào tự đọc số đầu từ hợp đồng hay từ lần ghi khác lúc tính. Số đầu chỉ được tự điền bằng số cuối lần ghi trước cho tiện, không bắt buộc bằng. Sửa một lần ghi không đổi lần ghi nào khác, không đổi hoá đơn nào đã tạo, kể cả hoá đơn nháp. Hoá đơn đã duyệt giữ số cũ.
2. **Ràng buộc duy nhất của chỉ số:** số đầu không được lớn hơn số cuối của cùng lần ghi. Không ràng buộc với lần ghi trước hay sau, không có khoá theo hoá đơn đã duyệt.
3. **Chỉ số ban đầu ở hợp đồng** chỉ là số gợi ý lúc tạo: chép vào dòng của hoá đơn đầu và điền sẵn số đầu của lần ghi tháng đầu tiên của đồng hồ; từ đó là số riêng, sửa hợp đồng sau này chỉ ảnh hưởng hoá đơn hoặc lần ghi tạo mới. Phí theo đồng hồ bắt buộc có đồng hồ và chỉ số ban đầu do người dùng chọn và điền. Hợp đồng không có số cuối, không có ràng buộc nào với các lần chốt (chỉ số nguyên không âm).
4. **Ngày lắp đồng hồ** không dùng để chặn hay lọc gì ở hợp đồng, ghi chỉ số hay đổi phòng. Chỉ còn dùng khi thay đồng hồ trong kỳ hoá đơn. Đổi phòng giữa kỳ thì chốt chỉ số mọi đồng hồ chưa gỡ của phòng tại ngày đổi; đồng hồ hư thì người dùng tự điền số cuối như phiếu thanh lý.
5. **Bàn giao không phải khái niệm của chỉ số.** Chỉ số ban đầu chỉ để tham khảo khi tạo hoá đơn đầu, không hiện trong lịch sử chỉ số.
6. **Thu chi chỉ hiện tiền thật sự nhận hoặc trả.** Khoản chờ thu không hiện.

## Không làm
- Không bỏ "Sinh hàng loạt". Không đổi công thức: hoá đơn tháng N = tiền phòng + phí cố định tháng N (trả trước) + điện, nước, phí theo đồng hồ tháng N−1 (trả sau).
- Không gộp dữ liệu thu chi vào một bảng; giữ `payments`, `deposit_entries`, thêm `expenses`.
- Không làm quy trình thay đồng hồ vật lý, không xoá được phí theo đồng hồ trong popup sửa hợp đồng.

## Thiết kế

### 1. Hoá đơn lẻ và hạn thanh toán
- Nút **Tạo hoá đơn lẻ** (popup `FormDialog`): Toà → Phòng (có hợp đồng hiệu lực) → Tháng; xem trước dòng, tổng, cảnh báo; tạo một hoá đơn nháp. Dùng chung đường tính của sinh hàng loạt. Hợp đồng đã lập tới kỳ đó thì báo "đã trả trước tới …".
- `DueRule` có thêm `day_of_invoice_month` (ngày X của chính tháng hoá đơn); mặc định trong Cài đặt X = 5. Hoá đơn có hạn ngay lúc tạo; hạn sửa được.

### 2. Kỳ hoá đơn theo dòng tiền phòng
Hợp đồng bắt đầu giữa tháng, người dùng chỉnh dòng tiền phòng chỉ tính đến cuối tháng. Sau khi lưu, `invoices.period_start/period_end` được đồng bộ từ `meta.from/to` của các dòng `rent` (`rentPeriodOf`, sớm nhất đến muộn nhất) nên hoá đơn kế tiếp nối đúng từ ngày đã chỉnh. Hoá đơn không có dòng tiền phòng (bổ sung) giữ nguyên kỳ; áp cho cả hoá đơn đã duyệt; có audit "đổi kỳ".

### 3. Mô hình chỉ số
- `meter_readings`: loại `monthly` hoặc `handover`; mỗi đồng hồ một dòng `monthly` mỗi kỳ. Cột `opening` là số đầu riêng của lần ghi tháng, luôn có giá trị: lúc tạo tự điền bằng số cuối lần ghi liền trước (hoặc chỉ số ban đầu của hợp đồng, hoặc số lúc lắp); migration `0043` ghi cố định cho các lần ghi cũ còn trống.
- Tính tiêu thụ (`meterUsage`): số đầu = lần ghi cuối trước đầu kỳ, hoặc `opening` đã lưu khi kỳ chỉ có một lần ghi tháng; số cuối = lần ghi cuối trong kỳ. Số cuối nhỏ hơn số đầu thì báo "Chỉ số mới nhỏ hơn chỉ số cũ" và hoá đơn vẫn giữ dòng 0 đồng kèm cảnh báo nêu hai số, để sửa ngay trong hoá đơn; dòng điện nước không bao giờ biến mất.
- Hợp đồng bắt đầu giữa kỳ: tính từ ngày sau ngày bắt đầu, lấy chỉ số ban đầu làm số đầu; đồng hồ đã gắn phí chưa có chỉ số ban đầu (dữ liệu cũ) thì báo thiếu. Thay đồng hồ trong kỳ hoặc đổi phòng thì đòi chỉ số tại ngày đổi của mọi đồng hồ chưa gỡ.

### 4. Trang Chỉ số
- Một trang, không tab. Bộ lọc: Toà, Phòng, Loại đồng hồ, Kỳ ghi. Nút `Thêm đồng hồ`, `Chốt chỉ số`.
- Thân trang là bảng lịch sử các đồng hồ đã chốt trong tháng đang lọc: Đồng hồ, Phòng · Toà, Số đầu, Số cuối, Ngày chốt, Sửa/Xoá, chọn nhiều để xoá. Chỉ số ban đầu của hợp đồng hiện cùng danh sách, có nhãn "chỉ số ban đầu" (số đầu = số cuối), sửa/xoá được; không có khoá.
- **Chốt chỉ số** mở popup có bộ lọc riêng (Toà, Phòng, Loại, Tháng chốt) không phụ thuộc bộ lọc ngoài; lưới có ô số đầu và số cuối sửa được, bật "Chỉ đồng hồ chưa chốt". Lưu: số cuối không nhỏ hơn số đầu; lỗi hiện theo từng dòng, dòng hợp lệ vẫn lưu.
- Sửa số đầu của một tháng chưa có lần ghi thì phải nhập cùng số cuối.

### 5. Chỉ số trong hoá đơn
- Hoá đơn nháp: danh sách tháng hiện `Tháng MM/YYYY · số đầu – số cuối`; mở hộp thoại sửa cả số đầu lẫn số cuối của tháng đó, tiêu thụ và thành tiền tính ngay, lưu ngay không cần bấm Lưu hoá đơn. Ghi thẳng về bảng chỉ số, chỉ tính lại hoá đơn đang mở.
- Hoá đơn mới chưa lưu: chỉ số điền xong ghi thẳng vào bảng chỉ số.
- Duyệt chỉ kiểm (không ghi); thiếu chỉ số thì chặn và nêu đồng hồ nào. Dòng thiếu số vẫn giữ 0 đồng kèm cảnh báo để chốt ngay trong hoá đơn. Đồng hồ thay giữa kỳ thì sửa ở trang Chỉ số.
- **Hoá đơn đầu (kỳ ký hợp đồng):** lúc tạo, số đầu và số cuối được chép từ chỉ số ban đầu của hợp đồng vào `meta.opening/closing` của dòng điện nước, tiêu thụ 0. Từ đó là số riêng của hoá đơn, có nút **Sửa** ngay trong hoá đơn; đổi hợp đồng không làm đổi hoá đơn đã tạo, tính lại không ghi đè. Sửa số đầu ở hoá đơn đầu thì cũng ghi về chỉ số ban đầu của hợp đồng (lần chốt đầu từ ngày bắt đầu), không kéo theo lần chốt tháng hay hoá đơn nào khác. Xoá hoá đơn rồi tạo lại thì chép lại số hiện tại của hợp đồng.

### 6. Sửa phí dịch vụ trong popup sửa hợp đồng
- Mỗi dòng phí hiện tên · đơn vị, cách tính, đơn giá (`MoneyInput`); phí theo đồng hồ hiện thêm đồng hồ đang gắn, chỉ số ban đầu và ngày chốt, sửa được (đồng hồ cùng phòng, đang rảnh). Lưu cùng nút "Lưu thay đổi", có audit. Chỉ người có quyền `meters` của toà thấy và sửa phần đồng hồ.
- Chỉ số ban đầu chỉ hiện khi đã có (lần chốt bàn giao sớm nhất từ ngày bắt đầu hợp đồng); không tự lấy chỉ số lúc lắp thay vào. Không có ràng buộc với lần chốt trước hay sau, không kiểm ngày lắp.
- Hoá đơn đã lập giữ số cũ; muốn áp dụng số mới thì xoá hoá đơn rồi lập lại.

### 7. Biên bản bàn giao
Bỏ mục chỉ số đồng hồ khỏi form (check-in, check-out) và dữ liệu lưu; mẫu mặc định bỏ bài "Chỉ số điện, nước". Chỉ số cuối khi trả phòng nhập ở phiếu thanh lý.

### 8. Thêm phí ngoài, hệ số và loại phí
- Hoá đơn nháp có nút **Thêm phí** dùng chung `FeePickerDialog` với form hợp đồng (đặt ở `src/components/`); phí đã có trong hợp đồng hiện "Đã thêm". Chọn xong thành dòng `one_off` có số lượng, đơn giá mặc định theo toà, sửa được. Phí chỉ lấy từ Cài đặt, không có dòng gõ tay; phụ thu và giảm giá có dòng riêng ở ô chi tiết.
- Tiền phòng và phí cố định tính theo thời gian chọn ở cột Thời gian của từng dòng (`meta.from/to`): hệ số = số ngày được chọn so với tháng (theo Cài đặt `proration`, 30 ngày hoặc ngày thực tế), ví dụ 20/30 ngày thì × 0,6667. Mỗi dòng hiện rõ hệ số; đổi thời gian của dòng hoặc kỳ hoá đơn thì dòng tính lại. Hợp đồng bắt đầu hoặc kết thúc giữa tháng chỉ là nơi sinh ra thời gian mặc định.
- Bỏ lựa chọn "Nhập tay" của loại phí (chuyển `manual` sang `period_input`). Thêm xoá loại phí: xoá hẳn khi chưa dùng; đã dùng thì từ chối và gợi ý Lưu trữ. Quyền `settings`, có audit.

### 9. Thu chi
- Tab **Thu chi** (`/cashbook`): danh sách chung thu + chi + cọc, lọc thời gian, loại, cơ sở; dải tổng quan Thu, Chi, Chênh lệch, Cọc đang giữ. Lọc và phân trang ở server.
- Chỉ hiện tiền thật sự nhận hoặc trả: `payments` (Thu tiền thuê); `deposit_entries` đã `done` và được tính (`collect`, `topup` là Thu cọc; `refund` là Chi hoàn cọc); `expenses` (sửa chữa, điện nước, lương, khác). Khoản chờ thu không hiện và không có nút Xác nhận. `deduct`, `forfeit` là bù trừ nội bộ, không cộng vào Thu/Chi.
- Nhập ở popup: Thu tiền thuê (gọi `recordLeasePayment`, phân bổ cũ nhất trước), Thu/hoàn cọc, Thêm khoản chi (sửa/xoá được, có audit). Mọi khoản thu và chi đều sửa và xoá được từ tab này, có audit: khoản chi; thu tiền thuê (sửa số tiền, ngày, hình thức, ghi chú, số tiền không vượt phần còn nợ của hoá đơn, xoá thì dư nợ hoá đơn tăng lại); thu, hoàn cọc (sửa số tiền, ngày, hình thức, ghi chú; xoá thì sổ cọc và cọc đang giữ tính lại).
- Bảng mới `expenses`: `facility_id` bắt buộc, `room_id` tuỳ chọn, `category`, `date`, `amount` > 0, `method`, `payee`, `note`. Quyền dùng lại `billing` theo cơ sở. Menu "Thu chi" sau "Hoá đơn".
- Hoá đơn giữ icon thu tiền và hộp thu tiền; bỏ lịch sử thu trong chi tiết hoá đơn. Đã có tiền thu thì không Bỏ duyệt.

## Chống thất bại
- Sửa một chỉ số mà hoá đơn nào khác (kể cả nháp) đổi theo, hoặc bị chặn bởi số trước, số sau, ngày lắp, là thất bại.
- Hai chỉ số bằng nhau mà tiêu thụ ra dương là thất bại.
- Sửa chỉ số ban đầu ở hợp đồng mà lần ghi hoặc hoá đơn đã có đổi theo, hoặc dòng điện nước biến mất khỏi hoá đơn, là thất bại.
- Tổng Thu lệch với tiền thu theo hoá đơn, hoặc cọc đang giữ lệch với sổ cọc, là thất bại.

## Để người xây tự quyết
Bố cục chi tiết, thứ tự cột, nhãn chữ, cách viết truy vấn gộp của sổ quỹ.

## Kiểm thử
Unit: `computeDueDate`, `rentPeriodOf`, `meterUsage`, `meterFeeUsage`, tính hoá đơn. Integration (PGlite): hoá đơn lẻ, kỳ đồng bộ, chỉ số độc lập (sửa không đổi hoá đơn nào, duyệt không đè), chốt chỉ số theo từng dòng, chỉ số ban đầu hợp đồng không bị ràng buộc, hoá đơn đầu giữ số riêng, sổ quỹ (nguồn, hướng, cọc, quyền, audit), xoá loại phí. E2E: popup hoá đơn lẻ, trang Chỉ số, tab Thu chi, popup sửa hợp đồng. Chỉ chạy khi chuẩn bị PR.
