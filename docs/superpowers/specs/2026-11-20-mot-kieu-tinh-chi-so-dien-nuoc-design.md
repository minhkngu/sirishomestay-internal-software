# Một kiểu tính chỉ số điện nước cho cả web

Ngày: 2026-11-20. Trạng thái: chờ duyệt. Nối tiếp `2026-11-18-chi-so-dong-ho-theo-phi-design.md` và `2026-11-20-cong-to-mac-dinh-va-xem-mau-hoa-don-design.md`.

## Ý định

Hiện có hai cách tính điện nước cùng tồn tại:
- **Kiểu cũ** (`feeModel = 'legacy'`): điện nước tính theo đồng hồ điện, nước của phòng, đơn giá lấy từ `utility_rates` của cơ sở (`rateFor` trong `src/domain/invoice-builder.ts`). Đổi giá trong cài đặt làm đổi hoá đơn của mọi hợp đồng.
- **Kiểu snapshot**: điện nước là một loại phí có đơn giá riêng của hợp đồng, gắn một đồng hồ loại `fee` riêng, tách khỏi đồng hồ điện, nước mặc định của phòng.

Bạn quyết định: chỉ còn **một kiểu**. Phí trong cài đặt chỉ là giá tham khảo; phí quyết định là phí trong hợp đồng. Dữ liệu hiện có là dữ liệu thử nên không cần giữ.

## Mục tiêu

1. Phòng luôn có hai đồng hồ mặc định (điện, nước), không xoá được, chỉ thêm đồng hồ khác. (Đã làm ở nhánh này.)
2. Tạo hợp đồng: chọn một phí tính theo đồng hồ bất kỳ (Điện, Nước hay phí khác), gắn một đồng hồ của đúng phòng đó, điền chỉ số tại thời điểm ghi.
   - Một dòng phí gắn đúng một đồng hồ.
   - Đồng hồ đã gắn dòng phí của hợp đồng đang chạy thì không chọn được cho dòng phí khác.
   - Danh sách đồng hồ chỉ hiện đồng hồ của phòng được chọn.
3. Hoá đơn tháng đầu sau khi ký vẫn có dòng tiền điện, nhưng chỉ số đầu và cuối bằng nhau (dùng 0, tiền 0).
4. Chốt chỉ số theo toà, phòng, tháng; phòng đang có người ở được đánh dấu rõ để điền nhanh.

## Không làm (non-goals)

- Không giữ hoặc chuyển dữ liệu hợp đồng cũ: xoá (xem Dữ liệu).
- Không đổi cách tính chỉ số qua thay đồng hồ, ước tính (đã có).
- Không thêm nút xoá đồng hồ.

## Điều không được xảy ra (anti-goals)

- Một đồng hồ gắn hai dòng phí của hai hợp đồng đang chạy.
- Hoá đơn lấy đơn giá điện nước từ cài đặt.
- Thay đồng hồ làm dòng phí trỏ vào đồng hồ đã gỡ, nên hoá đơn không đọc được chỉ số mới.

## Thiết kế

### 1. Bỏ kiểu cũ
- Xoá nhánh `feeModel !== 'snapshot'` (điện nước theo `utility_rates`) ở `src/domain/invoice-builder.ts` và đường đọc `utilityRates`/`rateFor` ở `src/server/invoices/service.ts` cùng nơi tạo hợp đồng, nhập Excel, phụ lục, thanh lý dùng nó. Mọi hợp đồng dùng `lease_fee_snapshots`; cột `fee_model` bỏ hoặc cố định `snapshot`.
- Bảng `utility_rates` không còn được hoá đơn đọc. Giữ bảng; nếu cài đặt còn màn hình sửa giá thì chuyển thành giá tham khảo của loại phí (`fee_types.default_price`, `fee_type_prices`).

### 2. Phí theo đồng hồ và đồng hồ của phòng
- Đồng hồ điện và nước mặc định là đồng hồ thường của phòng (không còn loại riêng cho phí). `meters.utility` chỉ là nhãn hiển thị (điện, nước, khác).
- Dòng phí tính theo đồng hồ (`quantity_source = 'meter'`) có `lease_fee_meters` trỏ đúng một đồng hồ của phòng hợp đồng. Giữ ràng buộc một đồng hồ chỉ gắn một dòng phí của hợp đồng `active`.
- Form tạo hợp đồng: mỗi dòng phí theo đồng hồ chọn một đồng hồ trong danh sách đồng hồ của phòng (đang dùng, chưa gắn), và nhập chỉ số tại ngày bắt đầu hợp đồng (ghi dạng `handover`, không nhỏ hơn chỉ số gần nhất). Điện và Nước được điền sẵn đồng hồ điện, nước tương ứng nếu còn trống. Giá lấy từ cài đặt làm giá điền sẵn, sửa được, chụp vào hợp đồng.
- Thay đồng hồ (`replaceMeter`): dòng phí đang gắn đồng hồ cũ chuyển sang gắn đồng hồ mới trong cùng giao dịch. Mức dùng của dòng phí tính qua cả hai đồng hồ như `meterUsage` hiện có. **Đây là quyết định của tôi**, spec 2026-11-18 chưa bàn thay đồng hồ.
- Thêm đồng hồ cho phòng: nút "Thêm đồng hồ" ở tab Đồng hồ (nhãn, chỉ số đầu). Không có nút xoá.

### 3. Hoá đơn
- Dòng điện nước của kỳ lấy mức dùng từ đồng hồ gắn với dòng phí, đơn giá từ dòng phí.
- Hoá đơn tháng đầu sau ký: nếu hợp đồng bắt đầu trong kỳ, dòng phí theo đồng hồ vẫn xuất hiện với chỉ số đầu = chỉ số cuối = chỉ số ghi lúc ký, mức dùng 0, tiền 0. Chưa nhập chỉ số lúc ký thì không ký được hợp đồng (đã bắt buộc).
- Nhãn "(ước tính)" ở cuối dòng giữ nguyên.

### 4. Chốt chỉ số theo toà, phòng, tháng
- Tab "Ghi chỉ số" (`/meters`) đã chọn theo cơ sở và kỳ. Thêm: mỗi phòng có dấu "Có người ở" (hợp đồng `active` trong kỳ) hoặc "Trống"; sắp xếp và bộ lọc "chỉ phòng có người ở", đếm "đã ghi n/m phòng có người ở".
- Lưu chỉ số nhiều phòng một lần như hiện nay; ô theo từng đồng hồ của phòng (không còn cột Điện/Nước cố định, vì phòng có thể có đồng hồ khác).

## Dữ liệu

Xoá dữ liệu cũ (không chuyển), theo yêu cầu của bạn: **mọi chỉ số và mọi đồng hồ**, cùng hợp đồng, hợp đồng cọc, phụ lục, hoá đơn và dòng hoá đơn, thanh toán, phí theo lần, bàn giao, người ở. Sau khi xoá, tạo lại hai đồng hồ mặc định (điện, nước) cho mọi phòng, chỉ số đầu 0 (cùng hàm `createDefaultMeters`). Giữ cơ sở, phòng, khách thuê, tài sản, cài đặt, loại phí, mẫu giấy tờ, người dùng. Xoá chạy sau khi code mới đã xong và sau khi bạn xác nhận lúc đó, vì code cũ không đọc được dữ liệu mới. Việc xoá ghi vào CSDL dùng chung nên chỉ chạy sau khi bạn xác nhận ở thời điểm đó. Nếu bạn muốn xoá toàn bộ CSDL rồi nạp lại dữ liệu mẫu (`db:seed -- --reset`) thì cũng được.

## Kiểm thử

- Unit (`invoice-builder`): hợp đồng bắt đầu trong kỳ → dòng phí đồng hồ có mức dùng 0, đơn giá từ dòng phí; đổi `utility_rates` không đổi hoá đơn.
- Integration (PGlite): chọn đồng hồ của phòng khác bị từ chối; đồng hồ đã gắn dòng phí của hợp đồng đang chạy bị từ chối; thay đồng hồ chuyển liên kết sang đồng hồ mới; tạo hợp đồng ghi chỉ số `handover`; hoá đơn tháng đầu có dòng điện bằng 0.
- Trình duyệt: tạo hợp đồng chọn phí điện gắn đồng hồ, xem hoá đơn tháng đầu, ghi chỉ số theo toà có dấu phòng có người ở.

## Để người xây quyết

Tên migration; cách bỏ cột `fee_model`; bố cục dấu "Có người ở" trong lưới ghi chỉ số; cách dọn nhập Excel và phụ lục đang dùng kiểu cũ.
