# Menu lọc đóng khi bấm ra ngoài

## Vì sao
Menu lọc "Tất cả toà" ở các trang danh sách (Phòng, Khách thuê, Hợp đồng, Hoá đơn, Tài sản, Tài sản) dựng bằng thẻ `<details>`. Khi mở, bấm ra ngoài hoặc nhấn `Esc` đều không đóng; menu còn nằm đè lên nội dung bên dưới và chặn thao tác cho tới khi bấm lại vào chính nó.

## Mục tiêu
- Bấm bất kỳ đâu ngoài menu thì menu đóng.
- Nhấn `Esc` thì menu đóng, con trỏ quay về nút mở menu.
- Bấm vào nút "Tất cả toà" vẫn mở/đóng như cũ.
- Chọn nhiều toà liên tiếp vẫn được: menu chỉ đóng khi bấm ra ngoài, không đóng sau mỗi lần tick.

## Không làm
- Không đổi các menu `⋯`, popup, hộp thoại còn lại: chúng dùng Base UI và đã tự đóng khi bấm ra nền.
- Không đổi các mục sổ xuống nội tuyến (Đã lưu trữ ở Cài đặt, Chỉ số gần nhất, cây vị trí tài sản): đây là accordion trong trang, không phải menu nổi.
- Không đổi giao diện, vị trí hay nội dung bộ lọc.

## Cách đã cân nhắc
- **A. Thay `<details>` bằng `Popover` của app.** Đồng bộ với phần còn lại, có sẵn xử lý bấm ngoài/`Esc`. Nhưng phải viết lại trigger và nội dung, đụng nhiều DOM hơn.
- **B. Giữ `<details>`, thêm xử lý đóng (đã chọn).** Ít thay đổi nhất, giữ nguyên checkbox và cách lọc hiện tại. Người dùng chọn B.

## Thiết kế
1. Trong `src/components/list/facility-filter.tsx`, gắn `ref` vào phần tử `<details>`.
2. Một `useEffect` đăng ký listener `pointerdown` trên `document`: nếu menu đang mở và điểm bấm nằm ngoài `<details>` thì đặt `open = false`.
3. Cùng `useEffect` đăng ký listener `keydown`: nếu menu đang mở và phím là `Esc` thì đóng menu và trả focus về `<summary>`.
4. Gỡ listener khi component unmount.
5. Giữ nguyên toàn bộ hành vi còn lại của `<details>` và bộ lọc.

## Kiểm thử
- E2E Playwright: mở bộ lọc ở trang Hoá đơn, bấm ra ngoài → `details` đóng; mở lại, nhấn `Esc` → `details` đóng.
- Chạy `npm run lint` và `npx tsc --noEmit`.
