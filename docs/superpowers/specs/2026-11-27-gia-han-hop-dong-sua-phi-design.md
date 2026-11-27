# Gia hạn hợp đồng: sửa giá thuê và phí khi gia hạn

Ngày: 2026-11-27 · Trạng thái: chờ duyệt

## Ý định và lý do

Khi gia hạn, nhân viên thường đổi giá thuê, tăng đơn giá điện nước, bỏ phí cũ và thêm phí mới. Popup Gia hạn hiện chỉ nhập ngày kết thúc, giá thuê và cọc nên nhân viên phải làm vòng ngoài. Mục tiêu: làm trọn việc đó trong một popup Gia hạn và lưu thành một phụ lục.

## Mục tiêu

- Popup Gia hạn hiện danh sách phí đang áp dụng, cho sửa đơn giá và số lượng, bỏ một phí, thêm phí mới.
- Ngày hiệu lực mặc định là ngày liền sau ngày hết hạn cũ (sửa được), vì thường giá mới áp dụng từ kỳ gia hạn.
- Sau khi gia hạn, hoá đơn các kỳ từ ngày hiệu lực dùng đúng danh sách phí và đơn giá mới. Hoá đơn trước đó giữ nguyên.

## Không làm

- Không đổi cách tính tiền, điện nước trả sau (tháng N−1) hay kỳ hoá đơn.
- Không làm lại luồng Chuyển phòng (việc riêng).

## Điều không được xảy ra

Phí điện, nước và phí nhập theo kỳ biến mất khỏi hoá đơn sau gia hạn. Lý do: `invoice-builder.ts` bỏ qua dòng phí không có `leaseFeeId`, còn `resolveFees` hiện tạo `newFees` không có `leaseFeeId`, `quantitySource`.

## Ràng buộc từ code hiện tại

- Phí đang chạy nằm ở `lease_fee_snapshots`; đồng hồ gắn qua `lease_fee_meters`. Mỗi phí tính theo đồng hồ gắn đúng một đồng hồ, đồng hồ đã gắn không dùng cho phí khác.
- `contractTermsAt` thay toàn bộ `fees` khi phụ lục có `newFees`, nên danh sách trong phụ lục phải đủ mọi phí còn hiệu lực.
- `checkDate` trong `createExtension` chỉ cho ngày hiệu lực trong [ngày bắt đầu, ngày kết thúc cũ]. Phải nới cho gia hạn: cho phép đến ngày kết thúc cũ + 1.
- `Khôi phục hợp đồng` đã chụp phiên bản trước khi gia hạn; phải dọn thêm các dòng phí mới tạo bởi phụ lục.

## Luồng thao tác (ví dụ: hợp đồng hết hạn 31/12/2026, tăng giá thuê và giá điện)

1. Nhân viên mở hợp đồng, bấm **Gia hạn**.
2. Popup hiện, ngày hiệu lực điền sẵn 01/01/2027, các phí hiện tại điền sẵn.
3. Nhân viên nhập ngày kết thúc mới, đổi giá thuê, sửa đơn giá điện, bỏ phí cũ hoặc thêm phí mới.
4. Bấm **Xem trước**: hiện tóm tắt thay đổi, chưa lưu.
5. Bấm **Lưu**: tạo một phụ lục gia hạn.
6. Hoá đơn từ kỳ 01/2027 dùng giá và danh sách phí mới; hoá đơn trước đó giữ nguyên.

Phác thảo popup:

```
Gia hạn hợp đồng HD-0123
Ngày hiệu lực        [01/01/2027]   (mặc định: sau ngày hết hạn cũ 31/12/2026)
Ngày kết thúc mới    [31/12/2027]
Giá thuê             [5.500.000]    (đang 5.000.000)
Tiền cọc             [        ]     (để trống nếu không đổi)

Phí áp dụng từ 01/01/2027
 Điện   (đồng hồ Đ-101)   3.500 → [4.000] /kWh      [Bỏ]
 Nước   (đồng hồ N-101)   18.000   [18.000] /m3     [Bỏ]
 Giữ xe                    100.000 [100.000] /xe    [Bỏ]
 Dọn phòng                 200.000                   [Đã bỏ — Hoàn lại]
 [+ Thêm phí]  → chọn phí; nếu tính theo đồng hồ thì chọn đồng hồ và nhập chỉ số đầu

[Huỷ]  [Xem trước]
```

Phần Phí là mới so với popup hiện tại.

## Các cách đã cân nhắc

- **A. Phụ lục lưu danh sách phí đầy đủ, mỗi dòng mang `leaseFeeId`, `quantitySource`, đồng hồ (chọn).** Ít sửa nhất, giữ cách thay toàn bộ danh sách đang có, sửa được lỗi mất phí. Cái giá: sửa cách lưu và popup dài hơn.
- B. Phụ lục chỉ lưu phần thay đổi (đổi giá, bỏ, thêm). Gọn dữ liệu nhưng phải sửa bộ tính điều khoản, hoá đơn, chi tiết phụ lục, Khôi phục; rủi ro lệch cao.
- C. Chỉ đổi giá. An toàn nhưng thiếu bỏ và thêm phí, không đủ yêu cầu.

Lucas mới nêu nhu cầu "thao tác được hết", chưa chọn rõ A, B hay C; A là đề xuất của Claude.

## Thiết kế (theo cách A)

1. **Popup.** Thêm vào `extension-dialog.tsx` phần Phí, dùng lại `LeaseFees` (đã có bộ chọn phí, chọn đồng hồ, chỉ số đầu). Điền sẵn từ phí hiện tại của hợp đồng. Mỗi dòng có nút bỏ.
2. **Ngày hiệu lực.** Mặc định ngày kết thúc cũ + 1. Khi ngày hiệu lực lớn hơn ngày kết thúc cũ, ẩn lựa chọn kỳ áp dụng (kỳ tiếp theo hoặc kỳ hiện tại) vì không có điều chỉnh giữa kỳ.
3. **Server.** Nới `checkDate` cho gia hạn. `newFees` mang `leaseFeeId` (dòng cũ) hoặc tạo dòng `lease_fee_snapshots` mới (phí thêm, có đồng hồ và chỉ số đầu). Phí bỏ thì vắng mặt trong danh sách; dòng cũ giữ lại cho các kỳ trước.
4. **Hoá đơn.** Mỗi kỳ dùng điều khoản tại ngày của kỳ như hiện nay. Đơn giá điện, nước của hoá đơn tháng N theo điều khoản của kỳ hoá đơn N (hành vi hiện có), nghĩa là chỉ số dùng từ tháng N−1 được tính theo giá mới nếu kỳ N đã thuộc kỳ gia hạn. Đây là lựa chọn của Claude, cần Lucas xác nhận.
5. **Khôi phục.** Xoá các dòng phí mới do phụ lục tạo, trả lại phiên bản đã chụp.
6. **Xem lại lịch sử: so sánh Trước/Sau.** Chi tiết phụ lục gia hạn hiện hai cột "Trước" và "Sau" cho giá thuê, cọc và từng phí (đơn giá, số lượng; phí bỏ hoặc thêm có nhãn). "Trước" lấy từ điều khoản hiệu lực ngay trước ngày hiệu lực (`contractTermsAt`). Không đổi cách lưu dữ liệu. Hoá đơn cũ không đổi vì `invoice_lines` đã lưu cứng đơn giá lúc tạo.
7. **Kiểm thử (viết, chưa chạy theo quy trình của repo).** Thêm vào `tests/integration/addenda.test.ts`: gia hạn đổi giá điện giữ đủ dòng điện, nước; bỏ phí; thêm phí đồng hồ; ngày hiệu lực = ngày kết thúc cũ + 1; Khôi phục. Cập nhật `tests/e2e/addenda.spec.ts` và mục Gia hạn trong Test Flow.

## Giá thuê và tiền cọc khi gia hạn (hành vi hiện có, giữ nguyên)

- Giá thuê mới tính từ ngày hiệu lực qua `contractTermsAt`; hoá đơn mỗi kỳ tự lấy điều khoản tại ngày đầu kỳ. Hợp đồng gốc không bị sửa, chỉ ngày kết thúc được cập nhật ngay khi lưu phụ lục.
- Cọc tăng: phụ lục ghi khoản "Thu cọc bổ sung" (chờ) vào sổ cọc; hoá đơn tiền phòng đầu tiên của kỳ gia hạn tự có dòng "Tiền cọc còn thiếu" bằng phần tăng, chỉ một lần.
- Cọc giảm: ghi khoản "Hoàn cọc chênh lệch" (chờ) vào sổ cọc; nhân viên hoàn tiền thủ công.
- Cần kiểm tra khi lập kế hoạch: (a) khoản "Thu cọc bổ sung" chờ trong sổ cọc có bị tính trùng với dòng "Tiền cọc còn thiếu" không; (b) hoá đơn nháp của kỳ gia hạn tạo trước khi lưu phụ lục có được tính lại không.

## Việc để người làm kế hoạch tự quyết

Cách đặt tên trường trong `newFees`, cách hiển thị phí trên chi tiết phụ lục, thông báo lỗi chi tiết.

## Còn mở

- Xác nhận cách A.
- Xác nhận mục 4 (giá điện, nước tháng N theo kỳ hoá đơn).
- Phí điện, nước thêm mới lúc gia hạn: chỉ số đầu lấy ở ngày hiệu lực hay ngày nhập? Đề xuất: bắt nhập tay chỉ số đầu.
