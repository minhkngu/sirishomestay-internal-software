# Điện nước theo đồng hồ, đồng hồ mặc định, bản xem mẫu dựng sẵn

Ngày: 2026-11-20. Gộp từ hai spec cùng ngày (công tơ mặc định và xem mẫu hoá đơn; một kiểu tính điện nước) và các điều bổ sung trong quá trình làm. Nối tiếp `2026-11-18-chi-so-dong-ho-theo-phi-design.md`.

## Ý định

- Chỉ còn **một cách** tính điện nước cho cả web. Điện, nước là phí của hợp đồng tính theo đồng hồ; đơn giá lấy từ hợp đồng. Giá trong Cài đặt chỉ là giá tham khảo, đổi giá không làm đổi hợp đồng đã có.
- Phòng nào cũng có sẵn đồng hồ để ghi chỉ số; đồng hồ hỏng vẫn chốt được hoá đơn.
- Xem mẫu hoá đơn, hợp đồng, biên bản không phải chờ server dựng mỗi lần bấm.

## Mục tiêu

1. Mỗi phòng luôn có hai đồng hồ mặc định, Điện và Nước (không xoá được; chỉ thêm đồng hồ khác). Mỗi đồng hồ có tên (bắt buộc với đồng hồ thêm, không trùng trong phòng) và mã tự sinh `DH-<toà>-<phòng>-<nn>`, duy nhất.
2. Hợp đồng: dòng phí tính theo đồng hồ (`quantity_source = 'meter'`) gắn đúng một đồng hồ của đúng phòng đó; đồng hồ đã gắn không dùng cho phí khác; nhập chỉ số tại ngày bắt đầu (`handover`). Điện, Nước được điền sẵn đồng hồ tương ứng nếu còn trống.
3. Hoá đơn kỳ ký vẫn có dòng điện với chỉ số đầu = cuối, tiền 0 (`Điện (chỉ số v → v)`).
4. Thay đồng hồ: dòng phí chuyển sang đồng hồ mới; không đọc được chỉ số cuối thì chốt bằng chỉ số ước tính + ghi chú bắt buộc, nhãn "(ước tính)" ở bảng đồng hồ và dòng hoá đơn. Chuyển phòng chuyển liên kết sang đồng hồ cùng loại của phòng mới. Thanh lý tính theo mọi phòng của hợp đồng.
5. Ghi chỉ số theo toà, phòng, tháng, có dấu phòng "Có người ở"/"Trống", đếm tiến độ theo phòng có người ở; tab "Theo tháng" chỉ xem theo toà.
6. Mẫu hoá đơn, hợp đồng, biên bản lưu sẵn bản xem PDF; mặc định chỉ gửi bản xem của mẫu mặc định, mẫu khác tải khi bấm mở; từ 2 mẫu trở lên là toggle.
7. Nhắc hết hạn hợp đồng theo ngày khách dọn đi (ngày kết thúc là sáng khách dọn đi).

## Không làm

- Không giữ hay chuyển dữ liệu hợp đồng, đồng hồ cũ (là dữ liệu thử, đã xoá bằng `scripts/reset-contract-data.ts`).
- Không có nút xoá đồng hồ; không hỗ trợ thay chậm có khoảng trống giữa ngày gỡ và ngày lắp.
- Chưa đổi cách tính tiền phòng theo "ngày kết thúc là sáng khách dọn đi" (tiền phòng vẫn tính đến hết ngày kết thúc).

## Điều không được xảy ra

- Một đồng hồ gắn hai dòng phí của hai hợp đồng đang chạy.
- Hoá đơn lấy đơn giá điện nước từ cài đặt.
- Dòng phí trỏ vào đồng hồ đã gỡ sau khi thay.
- Hoá đơn dùng chỉ số ước tính mà không có nhãn.
- Backfill tạo đồng hồ trùng; bản xem mẫu lệch PDF xuất thật.

## Thiết kế đã chốt

- **Một kiểu tính.** Mọi hợp đồng dùng `lease_fee_snapshots`; bỏ `fee_model`, bảng `lease_fees` và đường đọc `utility_rates` khi lập hoá đơn. Mức dùng của dòng phí tính bằng hàm thuần `meterFeeUsage` (`src/domain/meter-fee-usage.ts`) trên chuỗi đồng hồ của phòng, cắt theo ngày bắt đầu hợp đồng và bỏ qua đoạn rỗng; dùng chung cho hoá đơn tháng, kỳ ký và thanh lý.
- **Đồng hồ mặc định.** `createRoom`/`createRoomsBulk` tạo Điện và Nước (chỉ số đầu 0, ngày lắp là ngày tạo phòng) trong cùng giao dịch. Migration bổ sung cho phòng cũ, chạy lặp không tạo trùng; phòng chỉ có đồng hồ đã gỡ thì đồng hồ mới lấy chỉ số đầu bằng chỉ số cuối của đồng hồ gỡ gần nhất.
- **Tên và mã.** Mã sinh bởi `nextMeterCodes` (tính cả đồng hồ đã gỡ); thay đồng hồ giữ tên, nhận mã kế tiếp. Migration đặt tên và mã cho đồng hồ cũ.
- **Ước tính.** Cột `final_reading_estimated`, `estimate_note`. Mức dùng đoạn cũ = chỉ số cuối ước tính − chỉ số ghi gần nhất, tính tiền như thường. Gợi ý = chỉ số gần nhất + trung bình 3 tháng (hàm thuần kèm unit test).
- **Ghi chỉ số.** Lưới theo từng đồng hồ của phòng; đồng hồ phí hiện nhãn `tên (mã)`. Tab "Theo tháng": mỗi phòng một dòng, cột là tháng, ô hiện chỉ số, mức dùng, nhãn ước tính; tháng đổi đồng hồ hiện hai chỉ số.
- **Bản xem mẫu.** Cột `preview_pdf`, `preview_version` ở `invoice_templates` và `doc_templates`; dựng khi lưu mẫu và dựng lại khi hằng số phiên bản đổi. Danh sách chỉ trả bản xem cần thiết; mẫu khác tải qua action lấy bản xem một mẫu. Toggle từ 2 mẫu (`TOGGLE_FROM = 2`). Mẫu Word cũ đã xoá; một mẫu mới làm mặc định.
- **Nhắc hết hạn.** `severity = 'danger'` khi `endDate <= today`; chữ "dọn đi sáng dd/mm/yyyy", "dọn đi sáng nay", "quá hạn N ngày (dọn đi sáng …)".

## Kiểm thử

- Unit: `billing`, `meter-fee-usage`, `reminders`, `lease-fee-meters`.
- Integration (PGlite): `meters`, `addenda`, `contracts`, `contract-edit-delete`, `invoices`, `doc-template-preview`, `meter-backfill`, `meter-code-backfill`, `reset-contract-data`.
- Trình duyệt: tạo hợp đồng với phí Điện gắn đồng hồ và xem hoá đơn kỳ ký; tab Đồng hồ, hộp thoại thêm đồng hồ; danh sách mẫu với 1 và từ 2 mẫu.

## Còn mở

- Tiền phòng có dừng ở ngày trước ngày kết thúc hay không.
- Phí thêm giữa hợp đồng tính cả tháng trước; `replaceMeter` cũng chuyển liên kết hợp đồng đã kết thúc; phụ lục thiếu `leaseFeeId`.
