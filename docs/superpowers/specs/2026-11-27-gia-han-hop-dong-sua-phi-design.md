# Gia hạn hợp đồng: ghi thẳng giá, phí, cọc vào hợp đồng

Ngày: 2026-11-27 · Trạng thái: chờ duyệt (đã đổi hướng theo quyết định của Lucas lúc 12:56 cùng ngày)

## Ý định và lý do

Khi gia hạn, nhân viên thường đổi giá thuê, tăng đơn giá điện nước, bỏ phí cũ, thêm phí mới và đôi khi đổi cọc. Popup Gia hạn hiện chỉ nhập ngày, giá thuê và cọc. Mục tiêu: làm trọn việc đó trong một popup Gia hạn, và để **hợp đồng là nơi giữ giá, phí, cọc đang áp dụng**, nên nhân viên luôn biết sửa ở đâu (Sửa hợp đồng).

## Quyết định của Lucas

- Gia hạn **ghi thẳng** giá thuê, phí, cọc và ngày kết thúc vào hợp đồng khi bấm Lưu.
- **Phụ lục chỉ là tài liệu tham khảo**: ghi lại giá trị trước và sau gia hạn, không dùng để tính tiền.
- Trong Sửa hợp đồng, nếu giá trị khác phụ lục gia hạn mới nhất thì **đánh dấu đỏ cảnh báo**. Chỉ cảnh báo, không chặn, không yêu cầu thao tác thêm (không popup nhắc, không hỏi xác nhận).
- **Chỉ đổi cọc nếu có**: cọc mới trống hoặc bằng cọc cũ thì không cập nhật cọc và không ghi sổ cọc.

## Mục tiêu

- Popup Gia hạn: ngày kết thúc mới, giá thuê, cọc, và phần Phí (sửa đơn giá, bỏ phí cũ, thêm phí mới) giống Sửa hợp đồng.
- Ngày hiệu lực mặc định là ngày liền sau ngày hết hạn cũ (sửa được); chỉ dùng cho tài liệu phụ lục.
- Chi tiết phụ lục hiện so sánh Trước/Sau.
- Sửa hợp đồng hiện cảnh báo đỏ khi giá thuê, cọc, ngày kết thúc hoặc phí khác phụ lục gia hạn mới nhất.

## Không làm

- Không tự đổi giá đúng ngày hiệu lực; không có điều chỉnh giữa kỳ cho gia hạn.
- Không nhắc lập hoá đơn kỳ cuối trước khi gia hạn.
- Không làm lại luồng Chuyển phòng.
- Không đổi cách xử lý các phụ lục cũ đã lưu.

## Hệ quả cần biết

- Hoá đơn **chưa tạo** (kể cả kỳ cuối của hợp đồng cũ) sẽ tính theo giá mới ngay sau khi lưu Gia hạn. Hoá đơn đã tạo không đổi vì `invoice_lines` lưu cứng.
- Điện, nước vẫn tính theo điều khoản hiện tại của hợp đồng.
- Phí tính theo đồng hồ không bỏ được trong gia hạn, giống Sửa hợp đồng (muốn bỏ thì làm ở luồng khác); chỉ sửa giá hoặc thêm phí đồng hồ mới (có đồng hồ và chỉ số đầu).

## Thiết kế

1. **Popup.** Thêm vào `extension-dialog.tsx`: ô giá thuê, cọc, phần Phí dùng lại `LeaseFees` và dữ liệu `feeData` như Sửa hợp đồng. Bỏ lựa chọn kỳ áp dụng (kỳ tiếp theo, kỳ hiện tại). Giữ nút Xem trước.
2. **Ghi vào hợp đồng.** Một giao dịch: chụp phiên bản (cho Khôi phục), cập nhật `leases` (`endDate`, `monthlyRent`, `depositAmount` nếu đổi), sửa phí qua `applyLeaseFeeEdits`, ghi khoản chờ vào sổ cọc chỉ khi cọc đổi, tạo phụ lục, ghi nhật ký.
3. **Phụ lục tham khảo.** Cột mới `addenda.reference` (jsonb): `{ before, after }`, mỗi bên có `endDate`, `monthlyRent`, `depositAmount`, `fees[]` (loại phí, tên, đơn vị, đơn giá, nguồn số lượng). Phụ lục gia hạn mới **không** điền `newMonthlyRent`, `newDepositAmount`, `newFees`, nên `contractTermsAt` và hoá đơn không đổi; phụ lục cũ giữ nguyên cách tính.
4. **Cảnh báo đỏ.** Form Sửa hợp đồng nhận `reference.after` của phụ lục gia hạn mới nhất và so với giá trị đang nhập: giá thuê, cọc, ngày kết thúc, từng phí (đơn giá, phí thêm, phí bỏ). Hiện chữ và viền đỏ kèm giá trị phụ lục. Không chặn lưu.
5. **Khôi phục.** Phiên bản chụp hiện không gồm dòng phí; bổ sung để Khôi phục sau gia hạn hoàn lại cả phí.
6. **Trước/Sau.** Chi tiết phụ lục gia hạn đọc từ `reference.before` và `reference.after`.
7. **Kiểm thử.** Viết ở `tests/` như kế hoạch; chạy khi chuẩn bị PR.

## Các cách đã cân nhắc

- Phụ lục tính ra điều khoản theo ngày (mô hình cũ, thiết kế ban đầu của spec này): tự đổi giá đúng ngày hiệu lực nhưng nhân viên không biết sửa ở đâu sau gia hạn. Lucas đã không chọn.
- **Ghi thẳng vào hợp đồng, phụ lục chỉ tham khảo (chọn).**

## Còn mở

- Phí đồng hồ không bỏ được trong gia hạn: xác nhận chấp nhận như Sửa hợp đồng.
- Khôi phục nay phải hoàn lại cả phí; nếu Lucas không muốn mở rộng, chỉ cần ghi chú giới hạn.
- Có kiểm tra khoản "Thu cọc bổ sung" chờ trong sổ cọc có bị tính trùng dòng "Tiền cọc còn thiếu" trên hoá đơn không (khi cọc tăng).
