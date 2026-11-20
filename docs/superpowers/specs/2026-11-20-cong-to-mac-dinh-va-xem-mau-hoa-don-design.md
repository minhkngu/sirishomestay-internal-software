# Công tơ mặc định, thay công tơ ước tính, chỉ số theo tháng, xem mẫu hoá đơn

Ngày: 2026-11-20. Trạng thái: chờ duyệt (đã qua bước người đọc thử).

## Ý định và lý do

- Phòng mới hiện không có công tơ nào (`createRoom` không tạo), nên chưa ghi chỉ số được; `replaceMeter` còn báo lỗi "Phòng chưa có đồng hồ để thay". Nhân viên muốn mỗi phòng luôn có sẵn công tơ điện và nước.
- Khi công tơ hỏng và không đọc được chỉ số cuối, hiện không có cách chốt công tơ cũ để xuất hoá đơn.
- Nhân viên cần nhìn chỉ số nhiều tháng của một toà trên một bảng để đối chiếu.
- Xem mẫu hoá đơn hiện phải chờ server dựng PDF mỗi lần bấm "Xem"; muốn xem ngay.

## Mục tiêu

1. Mọi phòng, hiện có và mới, có đủ một công tơ điện và một công tơ nước đang dùng. Hai công tơ này không xoá được; chỉ thay (có lịch sử) hoặc thêm công tơ khác.
2. Thay công tơ hỏng được cả khi không đọc được chỉ số cuối, với chỉ số cuối ước tính và nhãn rõ ràng.
3. Tab "Theo tháng" trong trang Chỉ số, chỉ xem, theo toà.
4. Danh sách mẫu hoá đơn hiện bản xem ngay, không chờ server khi mở; nhiều mẫu thì dạng toggle.

## Không làm (non-goals)

- Không làm bảng theo tháng sửa được (việc sửa vẫn ở bảng "Ghi chỉ số").
- Không hỗ trợ thay chậm có khoảng trống giữa ngày gỡ và ngày lắp (tình huống C đã gác lại).
- Không đổi cách tính tiền điện nước ngoài phần đoạn ước tính.
- Không thêm nút xoá công tơ.

## Điều không được xảy ra (anti-goals)

- Hoá đơn dùng chỉ số ước tính mà không có dấu hiệu nào cho nhân viên biết.
- Chạy backfill tạo công tơ trùng (phòng đã có công tơ điện/nước đang dùng thì không tạo thêm).
- Bản xem mẫu hoá đơn lệch so với PDF xuất thật.

## Ràng buộc

Theo `CLAUDE.md`: N-layer (`server` → `domain`, `db`), service nhận `(db, ctx, input)`, kiểm quyền bằng `can()`, migration sinh bằng `npm run db:generate`, giao diện tiếng Việt, bố cục trang danh sách và bảng theo mục Front-end design, tiền dùng `formatVND`, bộ lọc dùng `Select` của app. Quy tắc tính thuần đặt ở `src/domain/` kèm unit test.

## Các hướng đã cân nhắc và lựa chọn

**Công tơ mặc định**
- Tạo ngay khi tạo phòng, kèm migration bổ sung cho phòng hiện có (được chọn). Dữ liệu luôn nhất quán, hoá đơn không phụ thuộc ai mở trang nào.
- Tạo khi mở trang ghi chỉ số (loại): thao tác đọc lại ghi dữ liệu, hoá đơn có thể chạy trước.

**Thay công tơ ước tính**
- Thêm cột dữ liệu đánh dấu ước tính và ghi chú (được chọn): lọc được, hiện được nhãn.
- Ghi vào ghi chú tự do (loại): không lọc và không hiện nhãn được.

**Bản xem mẫu hoá đơn**
- Dựng PDF một lần lúc lưu mẫu và lưu lại (được chọn): xem ngay, đúng với PDF xuất thật.
- Dựng HTML ở trình duyệt khi mở (loại): hoá đơn dùng `@react-pdf` nên HTML và PDF lệch nhau.

## Thiết kế

### 1. Công tơ mặc định
- `createRoom` và `createRoomsBulk` tạo thêm hai dòng `meters` (`electric`, `water`) trong cùng giao dịch: `startReading` 0, `installedOn` là ngày tạo phòng, không có số seri.
- Migration một lần: với mọi phòng (kể cả `is_active = false`) thiếu công tơ điện hoặc nước đang dùng (`removed_on IS NULL`), chèn công tơ còn thiếu với chỉ số đầu 0 và ngày lắp là ngày tạo phòng. Chạy lặp lại không tạo trùng.
- Giữ nguyên việc không có hàm xoá công tơ. Công tơ thêm là công tơ phí (`utility = 'fee'`) tạo qua hợp đồng như hiện nay.
- Nhập từ Excel: nếu luồng nhập tạo phòng thì đi qua cùng đường tạo công tơ; nếu nhập chỉ số cho công tơ đã có thì không tạo trùng.

### 2. Thay công tơ không đọc được chỉ số cuối
- Thêm vào `meters`: `final_reading_estimated boolean not null default false` và `estimate_note text`.
- `replaceMeter` nhận thêm `estimated?: boolean` và `note?: string`. Khi `estimated = true` thì `note` bắt buộc (lý do). Các kiểm tra cũ giữ nguyên (ngày gỡ sau ngày lắp, chỉ số cuối không nhỏ hơn chỉ số lớn nhất đã ghi).
- Hộp thoại "Thay đồng hồ" có ô chọn "Không đọc được, ước tính". Khi chọn, chỉ số cuối được gợi ý = chỉ số ghi gần nhất + mức dùng trung bình 3 tháng gần nhất của công tơ đó; nhân viên sửa được. Quy tắc gợi ý là hàm thuần ở `src/domain/` kèm unit test. Nếu chưa đủ dữ liệu để tính trung bình thì gợi ý bằng chỉ số gần nhất và nói rõ.
- Nhãn "ước tính" hiện ở bảng "Đồng hồ", ở bảng "Theo tháng", và trong dòng chi tiết hoá đơn của đoạn dùng chỉ số ước tính.
- Mọi lần thay vẫn ghi `recordAudit`, nay kèm cờ ước tính và lý do.

### 3. Tab "Theo tháng"
- Thêm mục thứ ba vào thanh mục của `src/app/(app)/meters/page.tsx` (`tab=monthly`), có chọn toà; mặc định 6 tháng gần nhất.
- Mỗi phòng một dòng; cột là các tháng; hai nhóm cột điện và nước (hoặc chuyển bằng bộ lọc loại đồng hồ). Mỗi ô hiện chỉ số ghi và mức dùng so với tháng trước. Tháng phòng đổi công tơ hiện hai chỉ số (cũ và mới) trong cùng ô. Ô ước tính có nhãn. Ô chưa ghi hiện "—".
- Dữ liệu từ một hàm service mới trong `src/server/meters/service.ts`, kiểm quyền `meters` theo toà, truy vấn gộp, không truy vấn từng phòng. Số liệu luôn tính từ dữ liệu, không viết cứng.
- Bảng theo quy tắc Front-end design: card `rounded-2xl border`, header chữ thường 13px, số căn phải `tabular-nums`; dưới `lg` chuyển thành dòng hai dòng, không tràn ngang.

### 4. Xem mẫu hoá đơn
- Khi lưu mẫu (tạo, sửa, đổi kiểu trình bày, khôi phục mặc định), server dựng PDF một lần bằng đường dựng hiện có (`previewInvoiceTemplateHtml`) và lưu lại bản xem gắn với mẫu. Cách lưu (cột trong bảng hoặc qua lớp lưu file hiện có) do người xây chọn; chỉ cần đọc lại không phải dựng lại.
- Danh sách mẫu (`invoice-templates-manager.tsx`) đưa bản xem vào ngay trong từng mẫu, không gọi server khi mở. Từ 4 mẫu trở lên, mỗi mẫu là một mục bấm để mở (toggle) với mẫu mặc định mở sẵn; ít hơn thì hiện hết.
- Mẫu cũ chưa có bản xem: dựng một lần khi lần đầu cần và lưu lại. Mẫu cũ dựng theo khối (không có `body`) vẫn hiện nhãn "Mẫu cũ, nên soạn lại" như hiện nay.
- Nút "Xem" bằng popup hiện tại được thay bằng bản xem tại chỗ.

## Kiểm thử và xác minh

- Unit: quy tắc gợi ý chỉ số cuối ước tính; ghép dữ liệu ô "Theo tháng" (đổi công tơ giữa tháng, thiếu chỉ số).
- Integration (PGlite): tạo phòng sinh đủ hai công tơ; migration bổ sung không tạo trùng; thay công tơ ước tính bắt buộc ghi chú; lưu mẫu sinh bản xem.
- Kiểm tra bằng trình duyệt: tạo phòng rồi ghi chỉ số ngay; thay công tơ ước tính rồi xem nhãn ở bảng và hoá đơn; tab "Theo tháng" trên màn hẹp; mở danh sách mẫu hoá đơn với 1 mẫu và với 4 mẫu trở lên.

## Việc để người xây quyết định

- Cách lưu bản xem PDF và cách trả ra trang (iframe, `object` hoặc ảnh).
- Cách trình bày hai nhóm điện và nước trong bảng theo tháng.
- Cách hiện nhãn ước tính trong dòng hoá đơn, miễn là nhìn thấy rõ.
- Tên cột và migration cụ thể, sinh bằng `npm run db:generate`.

## Các điều đã làm rõ sau khi người đọc thử xem (quyết định của tôi, cần bạn kiểm)

1. **Ước tính và hoá đơn.** Mức dùng của công tơ cũ = chỉ số cuối ước tính − chỉ số ghi gần nhất, tính tiền như công tơ thường; ước tính chỉ thêm nhãn. Chỉ số đầu công tơ mới do nhân viên nhập như hiện nay (mặc định 0), không bị ép bằng chỉ số cuối cũ. Dòng hoá đơn của đoạn cũ có nhãn "(ước tính)".
2. **Migration với phòng đã có lịch sử.** Phòng không có công tơ loại đó nào: chỉ số đầu 0, ngày lắp là ngày tạo phòng. Phòng chỉ có công tơ đã gỡ (không có công tơ đang dùng): công tơ bổ sung lấy chỉ số đầu bằng chỉ số cuối của công tơ gỡ gần nhất, ngày lắp bằng ngày gỡ đó, để không tạo bước nhảy từ 0. Phòng đã có công tơ đang dùng thì bỏ qua.
3. **Bản xem lỗi thời.** Bản xem dựng bằng dữ liệu mẫu cố định, không dùng dữ liệu thật. Lưu kèm một hằng số phiên bản bộ dựng; khi hằng số này đổi thì bản xem được dựng lại khi cần (lần mở đầu tiên) thay vì chỉ khi lưu mẫu.
4. **Phạm vi và quyền.** Migration chỉ chạy trên phòng còn tồn tại trong bảng `rooms` (kể cả ngừng sử dụng). Thay công tơ, kể cả ước tính, dùng quyền `meters` theo toà như `replaceMeter` hiện có; không thêm quyền mới.
5. **Cột tháng.** Một chỉ số thuộc tháng theo trường `period` của `meter_readings` (loại `monthly`); chỉ số `handover` hiện thành ô phụ trong tháng đó. Mức dùng = chỉ số tháng này trừ chỉ số có sẵn gần nhất trước đó (bỏ qua tháng trống), ghi rõ nếu có tháng trống ở giữa.
