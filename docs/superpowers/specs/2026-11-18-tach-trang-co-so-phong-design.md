# Tách trang Cơ sở và trang Phòng

Ngày: 2026-11-18. Nhánh: `tach-trang-co-so-phong`.

## Mục đích

Nhân viên không tạo được phòng vì trang danh sách `/facilities` không có lối vào tạo phòng. Form chỉ nằm ở `/facilities/[id]` (chi tiết từng toà). Đồng thời họ muốn theo dõi phòng nhanh: phòng nào có khách, phòng nào trống. Ý của người yêu cầu: tách Cơ sở và Phòng thành hai trang riêng, trang Phòng dạng lưới ô trực quan.

## Mục tiêu

- Hai mục menu riêng: "Cơ sở" (`/facilities`) và "Phòng" (`/rooms`).
- Tạo phòng được ngay từ trang Phòng, chọn cơ sở trên form.
- Trang Phòng xem nhanh trạng thái, đếm phòng trống.
- Phòng có thêm diện tích, số giường, tiện ích; danh mục tiện ích quản lý ở Cài đặt.
- Bỏ nút "Làm mới" ở mọi trang.

## Không làm (non-goals)

- Không đổi quyền (giao diện dùng `ctx.isAdmin`, server dùng quyền `settings`; giữ nguyên, chỉ ghi nhận sự lệch).
- Không tính tổng phí dịch vụ cố định hàng tháng của phòng.
- Không lọc/tìm phòng theo tiện ích (làm sau nếu cần).

## Cách làm đã cân nhắc

- **A. Hai tab trong `/facilities`**: ít file, nhưng người yêu cầu muốn tab Phòng có nhiều thông tin hơn nên tách trang cho gọn.
- **B. Hai route `/facilities` và `/rooms` (người yêu cầu chọn)**: thêm mục menu "Phòng" và trang `/rooms` mới. `/rooms/[id]` vẫn là chi tiết phòng.
- **C. Chỉ thêm nút "Thêm phòng"**: không đúng yêu cầu tách.

## Thiết kế

### Menu và trang Cơ sở
- `src/components/app-shell/nav.ts`: đổi "Cơ sở & phòng" thành "Cơ sở" (`/facilities`), thêm "Phòng" (`/rooms`), cùng quyền xem như mục cơ sở hiện tại (không `requires`).
- `/facilities`: bỏ `RoomList`, giữ danh sách cơ sở, `NewFacilityButton` và đường dẫn tới từng toà. Trang chi tiết toà `/facilities/[id]` giữ nguyên, kể cả `RoomPanels`.

### Trang Phòng `/rooms`
- Nạp phòng như `listRoomsWithStatus`, hiển thị lưới ô gom theo toà rồi tầng, có bộ lọc cơ sở (dùng lại `useFacilitySelection`/`FacilityFilter`).
- Màu ô: **có khách = xanh** (các trạng thái `occupied`, `ending_soon`, `occupied_with_next`), **không có khách = xám** (`vacant`, `deposited`). Phòng `deposited` xám có nhãn nhỏ "Đã cọc". Phòng `ending_soon` thêm dấu hiệu cảnh báo nhỏ (ví dụ viền vàng) nhưng vẫn xanh. Đây là chọn của mình.
- Đảo màu so với `RoomMap` hiện có (đang vacant xanh, occupied xám). `RoomMap` ở trang chi tiết toà: mình đề xuất dùng chung component mới và đồng bộ màu để hai nơi không ngược nhau.
- Phía trên: "N phòng trống / M phòng", tính theo bộ lọc cơ sở đang chọn. Phòng trống = `vacant`.
- Hover vào ô có khách: tên khách, giá thuê tháng, tiền cọc đã nhận, ngày hết hạn hợp đồng. **Ô không có khách không hiện khung hover.** Bấm ô để vào `/rooms/[id]`.
- Phân quyền hover: tên khách và ngày hết hạn cần quyền `tenants_contracts` của toà; giá thuê và tiền cọc cần `tenants_contracts` hoặc `billing`. Thiếu quyền thì phần đó không hiện.
- Dữ liệu: mở rộng `listRoomsWithStatus` (hoặc hàm mới) trả thêm `monthlyRent` từ hợp đồng đang hiệu lực và `depositBalance` (số dư cọc đã thu, cách tính giống `getRoomDetail`). Tính theo lô, không gọi từng phòng một.
- Tạo phòng: nút "Thêm phòng" và "Tạo nhanh nhiều phòng" trên trang Phòng, form có ô chọn cơ sở (tự điền nếu bộ lọc đang chọn đúng một toà). `RoomPanels` nhận `facilityId` cố định hoặc danh sách cơ sở để chọn, dùng chung hai nơi.

### Diện tích, giường, tiện ích
- Diện tích: cột `rooms.area_m2` và schema zod đã có, chỉ chưa có trên form. Thêm vào form tạo/sửa.
- Giường: thêm cột `rooms.beds` (số nguyên, không âm, có thể trống). Đây là chọn của mình: số lượng giường, chưa phân loại giường đơn/đôi.
- Tiện ích: bảng mới `amenities` (id, tên, đang dùng hay không) và bảng nối `room_amenities` (room_id, amenity_id). Chọn của mình: bảng nối thay cho mảng JSON để đổi tên tiện ích không làm hỏng dữ liệu phòng và sau này lọc được.
- Cài đặt: thêm tab "Tiện ích" trong `settings-tabs.tsx` để thêm, đổi tên, ngừng dùng tiện ích. Không xoá cứng tiện ích đã gắn phòng.
- Chưa có UI sửa phòng (`updateRoomAction` chưa được gọi ở đâu). Thêm form sửa phòng trên trang chi tiết phòng `/rooms/[id]` để phòng cũ cập nhật được diện tích, giường, tiện ích. Hiển thị ba thông tin này trên trang chi tiết phòng.
- Tạo nhanh nhiều phòng: cho nhập diện tích, giường, tiện ích áp dụng chung cho cả dải phòng (tuỳ chọn).
- Ba thông tin này **không** nằm trong hover (vì phòng trống không hiện gì).
- Migration: sửa `src/db/schema/` rồi `npm run db:generate`.

### Bỏ nút "Làm mới"
- Gỡ `RefreshButton` khỏi 7 trang: invoices, contracts, tenants, meters, facilities, assets, incidents. Xoá `src/components/list/refresh-button.tsx` nếu không còn chỗ nào dùng.

## Phần để người làm quyết định

- Dạng ô trên lưới (kích thước, cách bố trí), chi tiết nhãn "Đã cọc", viền cảnh báo.
- Cách đặt form sửa phòng trên trang chi tiết.
- Tên và vị trí file mới theo kiến trúc N-Layer của dự án (`src/server/amenities/`, `src/features/rooms/`, `src/app/(app)/rooms/page.tsx`).
- Test: unit cho phần tính phòng trống/màu nếu tách thành hàm thuần ở `src/domain/`; integration (PGlite) cho tạo phòng với tiện ích và thông tin hover theo quyền; e2e tạo phòng từ trang Phòng.

## Các điểm mình tự quyết (người yêu cầu chưa xác nhận)

1. Số giường là số lượng, không phân loại.
2. Tiện ích dùng bảng nối.
3. `deposited` thuộc nhóm "không có khách" (xám, nhãn "Đã cọc"); `ending_soon` vẫn xanh.
4. Đồng bộ màu `RoomMap` ở trang chi tiết toà.
5. Thêm form sửa phòng trên chi tiết phòng.
6. Diện tích, giường, tiện ích không hiện trong hover.
7. Tạo nhanh nhiều phòng cho nhập chung ba thông tin này.
