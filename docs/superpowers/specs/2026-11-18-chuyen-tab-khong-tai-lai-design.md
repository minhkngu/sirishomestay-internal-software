# Chuyển tab, lọc, phân trang không tải lại trang

## Vì sao
Mỗi lần bấm mục ở menu trái hoặc đổi bộ lọc, app chạy lại toàn bộ trang trên server: kiểm tra đăng nhập hai lần, 3 truy vấn quyền, đọc lại danh sách cơ sở và cài đặt, rồi mới tới truy vấn danh sách; trong lúc chờ hiện khung xám. Người dùng thấy chậm và tốn tài nguyên. Mong muốn: bấm tab không phải chờ trang tải lại; lọc/tìm/đổi trang không gọi DB.

## Mục tiêu
- Quay lại một tab đã mở: hiện ngay bản đã có, không gọi server, không khung xám.
- Lọc, tìm, đổi trang, đổi số dòng: xử lý trong trình duyệt, không gọi server.
- Bảng danh sách mặc định 15 dòng, chọn được 15 / 30 / 50 / 100; nhớ lựa chọn theo từng bảng trên máy người dùng.
- Mình sửa dữ liệu thì trang cập nhật ngay.
- Người khác sửa: thấy khi bấm F5 hoặc nút "Làm mới" trên trang.

## Không làm
- Không tự đồng bộ thay đổi của người khác (không realtime, không tự lấy lại theo giờ).
- Không đổi trang Nhật ký: vẫn lọc/phân trang qua server vì dữ liệu dài không giới hạn.
- Không đổi trang chi tiết (`/tenants/[id]`, `/contracts/[id]`…) ngoài việc hưởng cache chung.

## Không được xảy ra
- Mình vừa lưu mà trang vẫn hiện số cũ.
- Lộ dữ liệu ngoài quyền/cơ sở của người dùng (lọc tại chỗ chỉ trên dữ liệu server đã giới hạn theo quyền).

## Cách đã cân nhắc
- **A. Cache của Next.js + lọc tại chỗ (đã chọn).** Bật `experimental.staleTimes.dynamic` để giữ trang đã xem trong trình duyệt; các `revalidatePath`/`router.refresh()` sẵn có xoá cache khi mình lưu. Giữ nguyên server component và 57 chỗ làm mới. Đổi lại: tính năng còn experimental; một lần lưu xoá cache mọi tab.
- **B. TanStack Query cho từng danh sách.** Kiểm soát từng bảng, nhưng phải viết lại cách lấy dữ liệu ~8 trang và tự gắn làm mới vào 57 chỗ sửa; sót một chỗ là vi phạm "không được xảy ra" ở trên. Loại.

Người dùng chọn A, giao phần cách làm chi tiết cho Claude ("làm sao để khi bấm các tab không phải để page load lại").

## Thiết kế
1. **Giữ trang đã xem:** `next.config.ts` thêm `experimental.staleTimes` (`dynamic` và `static` = 3600 giây, tức coi như giữ tới khi F5/lưu/làm mới).
2. **Tải nền trước khi bấm** *(quyết định của Claude)*: các mục menu trái dùng `Link` tải sẵn đủ trang (`prefetch={true}`), nên lần đầu bấm vào một tab cũng gần như tức thì. Sau khi lưu, cache bị xoá; trang được tải nền lại khi rê chuột vào mục menu. Cần kiểm chứng trên Next 16 rằng tải sẵn lấy đủ dữ liệu trang chứ không chỉ khung xám; nếu không, dùng `router.prefetch` khi rê chuột.
   - Đánh đổi chấp nhận: mỗi phiên làm việc gọi DB một lần cho mỗi tab nhìn thấy trên menu, kể cả tab chưa mở.
3. **Nút "Làm mới"** ở đầu mỗi trang danh sách (trong `PageHeader`): gọi `router.refresh()`, hiện trạng thái đang tải trên nút, bảng cũ vẫn hiển thị.
4. **Bảng dùng chung có lọc + phân trang tại chỗ** trong `src/components/list/`: nhận toàn bộ dòng từ server, áp bộ lọc/tìm kiếm, cắt trang, hiện "1–15 trên 240", chọn số dòng, nút trang. Đổi bộ lọc → về trang 1.
5. **Bộ lọc không gọi server:** `FacilityFilter`, `TenantSearch` và bộ lọc các trang khác đổi URL bằng `window.history.replaceState` (vẫn chia sẻ link được) thay vì `router.replace`; trang server bỏ đọc `searchParams` để lọc, trả về toàn bộ danh sách trong quyền.
6. **Khách thuê:** bỏ giới hạn 50 dòng ở trang danh sách để nạp đủ một lần.
7. **Áp dụng cho:** Cơ sở & phòng, Khách thuê, Hợp đồng, Điện nước, Hoá đơn, Tài sản, Sự cố (các trang danh sách đang lọc qua `searchParams`).
8. **Đo trước/sau:** số truy vấn và thời gian khi chuyển tab và khi lọc, ghi vào PR.

## Để người lập kế hoạch quyết
- Cấu trúc component bảng dùng chung và cách từng trang khai báo hàm lọc.
- Tên khoá lưu số dòng trong `localStorage` (bọc try/catch).
- Trang nào có bộ lọc đặc thù (ví dụ chọn kỳ ở Hoá đơn, ngày ở Điện nước) mà buộc phải gọi server vì dữ liệu phụ thuộc tham số — giữ qua server và ghi rõ trong kế hoạch.
- Test: unit cho hàm lọc/phân trang thuần; e2e chuyển tab không gọi lại server.
