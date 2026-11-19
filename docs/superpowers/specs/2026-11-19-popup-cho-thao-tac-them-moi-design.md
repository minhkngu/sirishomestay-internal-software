# Thao tác "thêm mới" hiện popup, không tải trang mới

## Ý định
Nhân viên bấm "thêm" (khách, người dùng, sự cố, hợp đồng, phòng, tài sản, cơ sở, loại phí...) thì thấy một popup ngay trên trang đang xem, điền xong thì quay lại đúng chỗ cũ, không mất ngữ cảnh (bộ lọc, trang đang đứng, vị trí cuộn). Cùng một kiểu cho mọi thao tác thêm, và là quy tắc cho các tính năng sau này.

Người dùng đã nói: "áp dụng cho tất cả các việc thêm, hiện popup chứ không tải trang mới", kể cả các form đang mở ngay trong trang; và "viết lại quy tắc cho dự án".

## Mục tiêu
- Mọi nút/liên kết "thêm" mở popup, từ bất kỳ trang nào (ví dụ `+ Tạo hợp đồng thuê` ở trang khách và trang phòng).
- Tạo xong: đóng popup, danh sách phía sau làm mới tại chỗ.
- Mở thẳng đường dẫn (`/tenants/new`), tải lại trang (F5) hoặc mở liên kết trong tab mới vẫn ra trang đầy đủ, nội dung giống hệt.
- Quy tắc ghi vào `CLAUDE.md` để tính năng mới tự theo.

## Không phải mục tiêu
- Không đổi nội dung form, kiểm tra dữ liệu, quyền, server action.
- Không đổi thao tác sửa/xoá đã là popup, và popup chi tiết hợp đồng giữ nguyên hành vi.
- Không làm popup cho thao tác không phải "thêm" (chi tiết, báo cáo, nhập Excel).

## Điều làm thất bại dù chạy được
- Popup mở được nhưng F5 hoặc mở thẳng đường dẫn ra trang lỗi.
- Mất bộ lọc/trang hiện tại của danh sách sau khi tạo xong.
- Hai bản form riêng cho popup và trang (dễ lệch nhau).

## Ràng buộc
- Next.js 16 App Router; đọc `node_modules/next/dist/docs/` (intercepting-routes, parallel-routes) trước khi viết.
- Kiến trúc N-Layer của `CLAUDE.md`: route mỏng trong `src/app`, giao diện ở `src/features/<tên>/components`, `features` không import feature khác.
- Quy ước `(.)`, `(..)` của route chặn tính theo segment, không tính thư mục `@slot`.

## Các hướng đã cân nhắc
Nhóm A, thao tác đang là trang riêng (`/tenants/new`, `/users/new`, `/incidents/new`, `/contracts/new`):
1. **Một slot popup dùng chung ở khung `(app)`** — chọn. Mọi liên kết `/xxx/new` từ mọi trang đều hiện popup; một form dùng cho cả popup và trang. Đổi lại: phải dời popup hợp đồng đang đặt ở `contracts/@modal` lên tầng này; mỗi tính năng mới thêm một file nhỏ.
2. Mỗi mục tự chặn riêng (như hợp đồng hiện nay) — loại. Chỉ hiện popup khi bấm từ trong chính mục đó; nút ở trang khác vẫn sang trang mới.

Nhóm B, form đang mở ngay trong trang (`Thêm phòng`, `Tạo nhanh nhiều phòng`, `Thêm tài sản`, `Thêm cơ sở`, `+ Thêm loại phí`, `+ Thêm đơn vị`):
- **Bọc form sẵn có vào `Dialog`** của dự án — chọn. Không đổi đường dẫn, không cần route chặn.

## Thiết kế
**Nhóm A**
- Thân trang "thêm" tách thành component dùng chung (mẫu đã có: `contracts/new-contract.tsx`); `new/page.tsx` và bản popup đều render nó.
- Slot `@modal` ở `src/app/(app)/` có file `(.)<mục>/new/page.tsx` cho từng mục, bọc nội dung bằng một khung popup chung (tiêu đề, đóng bằng Esc/nút đóng gọi `router.back()`), kèm `default.tsx` trả `null`; `(app)/layout.tsx` nhận `modal` và render cạnh `children`.
- Trang đích hiện tại: `tenants/new`, `incidents/new` (có `?room=`, `?asset=`), `contracts/new` (có `?kind=`, `?room=`, `?tenant=`, `?deposit=`). Nút `Thêm người dùng` đang trỏ `/users/new` nhưng `users/new` không có thư mục riêng, đang chạy qua `users/[id]`; cần tạo `users/new/page.tsx` thật.
- Dời `contracts/@modal` (chặn `/contracts/[id]` và `/contracts/new`) lên slot chung, gỡ `contracts/layout.tsx` nếu không còn cần. Giữ nguyên hành vi popup chi tiết hợp đồng, kể cả khi hợp đồng xoá xong về `/contracts`.
- Sau khi tạo: form gọi `router.back()` hoặc `router.push` về nơi hợp lý, rồi `router.refresh()` để danh sách phía sau cập nhật. Riêng hợp đồng giữ hành vi hiện tại (đi tới `/contracts/<id>`, hiện popup chi tiết).
- Phần kéo dài dữ liệu nặng (hợp đồng nạp nhiều bảng): popup có thể hiện chậm vài giây ở dev lần đầu; thêm trạng thái chờ (skeleton) trong popup.

**Nhóm B**
- Mỗi form bọc `Dialog` ở file `*-form.tsx` / `room-panels.tsx` tương ứng; nút kích hoạt giữ nguyên chữ. Tạo xong đóng `Dialog` và `router.refresh()`.

**Quy tắc ghi vào `CLAUDE.md` (mục Conventions)**
- Thao tác thêm mới luôn hiện popup, không điều hướng sang trang mới.
- Nếu form cần dữ liệu từ server: làm trang `/<mục>/new` + route chặn trong slot `@modal` của `(app)`; thân trang đặt ở component dùng chung. Nếu form tự chứa: bọc `Dialog`.
- Liên kết "thêm" dùng `Link` thường; không dùng `<a>` trừ khi cố ý tải trang đầy đủ.
- Kiểm tra bắt buộc: bấm từ danh sách → popup; F5/mở thẳng → trang đầy đủ; đóng bằng Esc quay về đúng trang cũ.

## Để người xây quyết
- Tên và dáng khung popup chung, độ rộng theo từng form (form ngắn như khách, sự cố dùng `sm:max-w-xl`; hợp đồng giữ rộng).
- Trạng thái chờ trong popup.
- Thứ tự làm: dời hạ tầng chung + hợp đồng trước, rồi tới khách/người dùng/sự cố, cuối cùng nhóm B.

## Rủi ro cần kiểm khi làm
- Một slot ở `(app)` chặn được liên kết từ trang ngoài `/contracts` hay không; nếu không, quay lại hướng 2 và báo người dùng.
- Route chặn `(.)contracts/[id]` và `(.)contracts/new` cùng cấp: segment tĩnh `new` phải thắng `[id]`.
- Dev server không nhận thư mục route mới: cần khởi động lại khi thử.
- Test: unit/integration không bao phủ route; e2e (Playwright) thêm một kịch bản mở popup từ trang khác và F5.

## Kết quả kiểm tra rủi ro (khi làm)
- Một slot ở `(app)` chặn được liên kết từ trang ngoài `/contracts`: đạt (bấm từ trang khách ra popup hợp đồng).
- Segment tĩnh `new` thắng `[id]`: đạt.
- Next 16 cảnh báo "page files do not match any complete route" cho `/login` khi `(app)` có slot catch-all: đã xử lý bằng `src/app/(app)/default.tsx` (`notFound()`); build sạch.
- Dev server cần khởi động lại (và đôi khi xoá `.next`) sau khi đổi thư mục route; popup chi tiết/tạo hợp đồng mất ~10 giây lần đầu ở dev.
