# Hoàn tiền phòng đã trả trước khi thanh lý

Ngày: 2026-11-25. Quy mô: thay đổi nhỏ. Trạng thái: chờ duyệt.

## Vì sao
Khi thanh lý, khách có thể đã đóng trước tiền phòng cho các kỳ sau ngày trả phòng. Hiện `buildTerminationInvoice` (`src/modules/leasing/domain/liquidation.ts`) luôn hoàn phần các ngày không ở, nhân viên không chọn được. Siris cần chọn không hoàn hoặc hoàn một phần, và cách tính hoàn phải rõ ràng.

## Mục tiêu
- Màn thanh lý có ô chọn "Tiền phòng đã trả trước" với ba lựa chọn: *Hoàn theo ngày* (mặc định), *Hoàn một phần*, *Không hoàn*.
- *Hoàn theo ngày* hoàn mọi kỳ đã duyệt kết thúc sau ngày trả, gồm cả tiền phòng và phí cố định hằng tháng đã thu trước (theo phòng, theo đầu người) của các ngày không ở. Mỗi khoản một dòng riêng trên hoá đơn thanh lý.
- *Hoàn một phần*: nhân viên nhập tổng số tiền hoàn, không vượt tổng tính theo ngày.
- *Không hoàn*: tiền hoàn bằng 0; hoá đơn vẫn có dòng hoàn 0 đồng kèm chú thích khoản đã trả trước không hoàn để đối chiếu.
- Không có tiền hoàn thì hoá đơn thanh lý không có dòng hoàn (không để dòng 0 đồng) đồng (Lucas chốt 2026-11-25).

## Không làm
- Không tự áp quy tắc báo trước (spec gốc đã quy định: nhân viên quyết).
- Không hoàn điện nước, phí tính theo đồng hồ (thu sau, đã tính đến ngày trả).
- Không chọn riêng từng kỳ, không tách ô cho phí dịch vụ.
- Không đụng tới "Mất cọc"; hai ô độc lập.

## Phương án đã cân nhắc
1. **Ba lựa chọn, nhân viên quyết (chọn)**: giống ô Mất cọc, nhất quán, không cần biết luật báo trước.
2. Ô tỷ lệ phần trăm: ít tự nhiên hơn số tiền, khó đối chiếu với tiền thực hoàn.
3. Quy tắc cố định theo ngày báo trước: Siris chưa có quy tắc như vậy, để mở rộng sau.

## Thiết kế
- Dữ liệu vào: `rentRefund: { mode: 'by_days' | 'partial' | 'none', amount?: number }`, mặc định `by_days` (hành vi cũ giữ nguyên với client cũ). Thêm vào `terminationSchema` trong `server/addenda/service.ts` và `TerminationInput`.
- `buildTerminationInvoice` tính phần hoàn theo ngày như cũ cho tiền phòng, thêm các dòng hoàn phí cố định = số lượng × đơn giá × hệ số của đoạn không ở, lấy từ các dòng phí của chính hoá đơn đã duyệt. Trả thêm `maxRefund`.
- `partial`: một dòng hoàn gộp; service ném `ValidationError` khi `amount > maxRefund`.
- Không đổi schema DB, không migration: dòng hoá đơn đã được lưu; `finalize.ts` không đọc lựa chọn này.
- UI: thêm `BareSelect` và `MoneyInput` trong `termination-wizard.tsx`, cạnh "Mất cọc".

## Để người xây quyết
- Cách nhận diện dòng phí cố định trong hoá đơn đã duyệt (meta `from`/`to`, không phải phí đồng hồ).
- Ghi chú "không hoàn": dòng 0 đồng hay ghi trong ghi chú hoá đơn, tuỳ PDF/QR/duyệt có chấp nhận dòng 0 đồng.
- Dòng hoàn một phần là một dòng gộp (lựa chọn của mình).

## Kiểm thử và tài liệu
- Cập nhật `tests/unit` cho `liquidation.ts` (ba chế độ, nhiều kỳ trả trước, phí cố định), `tests/integration` cho service, e2e màn thanh lý.
- Sửa mục "Hoá đơn thanh lý" trong `2026-11-16-quan-ly-khach-thue-design.md`.
