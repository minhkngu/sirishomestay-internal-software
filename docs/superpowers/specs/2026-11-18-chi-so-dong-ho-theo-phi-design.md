# Thiết kế: phí, chỉ số và đồng hồ khi tạo hợp đồng

## Mục đích

Điện và nước hiện đi đường riêng (bảng `utility_rates` theo cơ sở, nhánh `feeModel !== 'snapshot'` ở `src/domain/invoice-builder.ts`), khác các phí dịch vụ. Thực tế điện hay nước chỉ là tên của một loại phí tính theo đồng hồ. Mục tiêu: mọi loại phí cấu hình ở một chỗ (Cài đặt), mọi đồng hồ được theo dõi và ghi chỉ số ở một chỗ (trang Chỉ số), và hợp đồng mới gán phí kèm đồng hồ đúng cách.

## Làm

### 1. Cài đặt: mọi phí nằm trong "Phí dịch vụ"
- **Điện** (kWh) và **Nước** (m³) là hai loại phí tính theo đồng hồ (`quantityFrom = 'meter'`), có sẵn; giá mặc định lấy từ `utility_rates` mới nhất (giá riêng theo tòa nếu cơ sở khác nhau).
- Bỏ tab "Đơn giá điện nước". Thứ tự tab: Chung, Cơ sở, Phí dịch vụ, Tài khoản nhận tiền.

### 2. Trang Chỉ số (đổi tên menu "Điện nước")
- Giữ đường dẫn `/meters` và vị trí menu giữa Hợp đồng và Hoá đơn; quyền `meters`.
- Hai tab: **Ghi chỉ số** (lưới hiện có, gồm cả đồng hồ của dòng phí) và **Đồng hồ** (danh sách theo cơ sở và phòng: dòng phí, hợp đồng, số seri, chỉ số đầu, trạng thái; xem lịch sử chỉ số; chỉ xem, không thêm sửa).

### 3. Tạo hợp đồng và gán phí
- Hợp đồng thuê (kể cả chuyển từ hợp đồng cọc) có thể thêm **nhiều dòng cùng một loại phí**; mỗi dòng phí tính theo đồng hồ gắn với **đúng một đồng hồ riêng**.
- Mỗi dòng đồng hồ: chọn đồng hồ có sẵn của phòng (đang dùng, chưa gắn dòng phí của hợp đồng `active` nào) hoặc tạo đồng hồ mới. Không còn tự dùng lại đồng hồ theo (phòng, loại phí).
- **Bắt buộc nhập chỉ số ban đầu** cho mọi dòng phí có đồng hồ. Đồng hồ mới: chỉ số đầu. Đồng hồ có sẵn: ghi chỉ số `handover` tại ngày bắt đầu hợp đồng, không nhỏ hơn chỉ số gần nhất.
- Giá dòng phí chụp lúc ký như hiện nay.

## Không làm

Thanh lý hợp đồng, chuyển phòng (phụ lục), đổi hoặc thay đồng hồ, thay đổi phí của hợp đồng đang có (gồm điều chỉnh giá và thời gian áp dụng).

**Rủi ro đã biết:** hóa đơn thanh lý chưa gồm tiền điện nước của các dòng phí đồng hồ cho đến khi làm phần thanh lý (`src/domain/liquidation.ts` chưa đọc dòng phí đồng hồ).

## Ràng buộc

- Không đổi số tiền hợp đồng đang chạy và hóa đơn đã phát hành; liên kết `lease_fee_meters` đã có giữ nguyên.
- Không để một đồng hồ gắn hai dòng phí của hợp đồng `active` (`leases.status`: `active` | `ended`).
- N-Layer theo `CLAUDE.md`; sửa `src/db/schema/` rồi `npm run db:generate`; UI tiếng Việt.
- Phiên khác đang làm lại tab Phí dịch vụ (`docs/superpowers/specs/2026-11-18-cai-dat-phi-dich-vu-design.md`): phần 1 phải làm sau khi phiên đó xong, dùng chung thẻ loại phí của họ.

## Cách làm (tóm tắt)

- Bỏ chỉ mục `meters_active_room_fee_unique` (`src/db/schema/meters.ts`); `lease_fee_meters.leaseFeeId` vốn là khóa chính nên một dòng phí chỉ có một đồng hồ.
- `ensureFeeMeter` (`src/server/meters/service.ts`): chỉ dùng đồng hồ được chọn rõ hoặc tạo mới; luôn đòi `initialReading`.
- `insertLease` (`src/server/contracts/service.ts`): cho phép trùng loại phí giữa các dòng, vẫn chặn trùng đồng hồ.
- Hàm idempotent nạp Điện và Nước (không trùng khi chạy lại, không ghi đè giá đã sửa).
- Form hợp đồng (`lease-fees.tsx`, `lease-wizard.tsx`, trang `contracts/new`): chọn đồng hồ cho từng dòng, chỉ số ban đầu luôn bắt buộc.

## Để người xây quyết

Tên migration và cách nạp Điện/Nước; bố cục tab Đồng hồ và cách lọc; cập nhật các test đang dựa vào việc tự dùng lại đồng hồ (`tests/integration/contracts.test.ts` ~dòng 293); thứ tự triển khai (phần 3 trước, phần 2 và 1 sau).
