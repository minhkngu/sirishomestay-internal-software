# Kỳ hoá đơn theo dòng tiền phòng — thiết kế ngắn

## Vấn đề
Hợp đồng bắt đầu giữa tháng (ví dụ 15/11) nên hoá đơn đầu sinh kỳ 15/11 – 14/12. Người dùng sửa thời gian dòng tiền phòng thành 15/11 – 30/11. Hoá đơn kế tiếp vẫn bắt đầu 15/12 thay vì 01/12, vì app nối từ `invoices.period_end` (còn là 14/12), còn việc sửa dòng chỉ đổi `meta.from/to` của dòng.

## Mục tiêu
- Kỳ lưu của hoá đơn luôn khớp với thời gian của dòng tiền phòng sau khi lưu.
- Hoá đơn kế tiếp nối đúng từ ngày cuối đã chỉnh.

## Không làm
- Không thêm ô nhập "kỳ hoá đơn" riêng. Không đổi giao diện sửa hoá đơn.
- Không tự sửa hàng loạt hoá đơn cũ; hoá đơn cũ được đồng bộ khi mở và bấm Lưu một lần.

## Cách làm (người dùng đã đồng ý)
Trong `updateLines` (`src/server/invoices/service.ts`), sau khi ghi các dòng của hoá đơn `monthly` có dòng tiền phòng: đặt `periodStart` = ngày đầu sớm nhất, `periodEnd` = ngày cuối muộn nhất trong `meta.from/to` của các dòng `rent`. Hoá đơn không có dòng tiền phòng (hoá đơn thêm cho kỳ đã có hoá đơn) giữ nguyên kỳ. Áp cả cho hoá đơn đã duyệt. Có ghi audit như hiện nay.

## Phương án đã cân nhắc
- (Chọn) Suy kỳ từ dòng tiền phòng: một nguồn sự thật, không thêm ô nhập.
- Tính kỳ kế tiếp từ dòng tiền phòng mới nhất: kỳ lưu vẫn sai ở danh sách, PDF, khoá chỉ số; loại.
- Bắt sửa kỳ qua `setPeriod`: đổi giao diện, người dùng đã quen sửa ở dòng; loại.

## Để người làm tự quyết
Cách đọc ngày từ `meta` (bỏ qua dòng thiếu `from/to`), thông điệp audit.
