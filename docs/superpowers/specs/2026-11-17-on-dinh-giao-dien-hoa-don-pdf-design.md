# Ổn định app, tăng tốc, hoá đơn PDF có QR, giao diện mới — thiết kế

Ngày: 17/11/2026 · Nhánh gốc: `my-plan-3`

## Vì sao

Nhân viên Siris đang gặp bốn vấn đề khi dùng web nội bộ:

1. Web hay sập, hiện trang "Application error".
2. Trang tải chậm.
3. Một số tính năng làm dở, ví dụ xuất ảnh hoá đơn. Hoá đơn hiện xuất ra Word trước, rồi mới chuyển sang PDF hoặc ảnh qua dịch vụ Gotenberg. Khi Gotenberg chưa được cấu hình, cả PDF lẫn ảnh đều lỗi.
4. Giao diện đang là theme xám mặc định của shadcn, trông xấu.

Mục tiêu là app chạy ổn định, tải nhanh, hoá đơn ra PDF ngay (khách quét QR là chuyển khoản được), và giao diện hiện đại, đơn giản, trẻ trung.

## Thứ tự làm

Các phần dưới đây độc lập với nhau và làm lần lượt: **sập → chậm → hoá đơn PDF → giá phí theo toà → giao diện (kèm lọc theo toà)**. Hai phần đầu có thể chung nguyên nhân (DB, layout). Phần giao diện để cuối, khi các trang đã ổn định.

## Mục tiêu / không làm / thất bại nếu

- **Mục tiêu:**
  - Không còn trang "Application error". Khi có lỗi, người dùng thấy câu báo dễ hiểu kèm nút thử lại, menu vẫn dùng được.
  - Trang lên nhanh hơn rõ rệt.
  - Hoá đơn mặc định xuất PDF, kèm QR chuyển khoản; xuất ảnh từ chính file PDF đó.
  - Giao diện mới theo hướng "Bạc hà".
- **Không làm:**
  - Hợp đồng, phụ lục, biên bản vẫn dùng mẫu Word như hiện nay. PDF của các loại này vẫn đi qua Gotenberg.
  - Không đổi logic nghiệp vụ hay quyền truy cập.
  - Không tự động đối soát tiền về tài khoản.
- **Thất bại nếu:**
  - Giao diện mới đẹp nhưng làm hỏng một luồng đang chạy.
  - Hoá đơn PDF lỗi font tiếng Việt.
  - QR quét ra sai số tiền hoặc sai nội dung.
  - Thông báo lỗi để lộ chi tiết kỹ thuật.

## Phần 1 — Hết "Application error"

Hiện cả `src/app` không có `error.tsx` nào, nên chỉ một lỗi ở server hay client là cả trang chết.

- Thêm `src/app/(app)/error.tsx`: báo lỗi trong vùng nội dung, giữ nguyên thanh menu, có nút "Thử lại" (gọi `reset`). Thêm `src/app/global-error.tsx` cho lỗi ở layout gốc, và `not-found.tsx` cho đường dẫn sai.
- Câu báo lỗi viết tiếng Việt, nói rõ người dùng nên làm gì. Không hiện stack trace; `digest` chỉ ghi vào log.
- **Tìm và sửa nguyên nhân gốc** (dùng `superpowers:systematic-debugging`):
  - Chạy bản production trên máy (`npm run build && npm start`), mở lần lượt mọi route, chú ý những route nhận `[id]`.
  - Nếu người dùng cấp quyền Vercel MCP, đọc thêm `get_runtime_errors` của bản đã deploy.
  - Mỗi lỗi tìm được phải có test tái hiện trước khi sửa.
- Thêm một bài e2e "mở mọi trang không gặp Application error".

## Phần 2 — Tải nhanh hơn

Đo trước, sửa sau. Những chỗ nghi ngờ:

- `(app)/layout.tsx` gọi `getAccessContext` (3 truy vấn) và `listFacilities` ở mọi trang.
- Mỗi instance chỉ có 3 kết nối DB (`DATABASE_POOL_MAX`).
- Các trang danh sách có thể truy vấn N+1, hoặc truy vấn tuần tự thay vì song song.

Cách làm:

- Ghi thời gian từng truy vấn và từng trang trên bản production, lập bảng trước/sau.
- Sửa những chỗ chậm nhất: chạy song song, gộp truy vấn, thêm index nếu cần, chỉnh số kết nối pool cho hợp với pooler của Supabase.
- Thêm `loading.tsx` dạng khung chờ (skeleton) cho từng nhóm trang chính để trang hiện ra ngay.
- **Việc của người làm:** mức đích cụ thể, đặt sau khi đo. Gợi ý: các trang danh sách phản hồi dưới khoảng 1 giây với dữ liệu mẫu.

## Phần 3 — Hoá đơn PDF có QR chuyển khoản

### Cách làm đã chọn

Dựng PDF ngay trong app, không đi qua Word hay Gotenberg. Ảnh PNG vẽ từ chính file PDF đó bằng `convertPdfToPng` sẵn có (pdf.js + @napi-rs/canvas).

### Các cách đã cân nhắc

| Cách | Được | Mất |
|---|---|---|
| **A. Dựng PDF trong app** (đã chọn) | Không phụ thuộc dịch vụ ngoài, ít chỗ hỏng, nhanh | Mẫu hoá đơn nằm trong code; nhân viên không tự sửa bằng Word được |
| B. Giữ mẫu Word → Gotenberg | Tự sửa mẫu được | Phải dựng và trả tiền duy trì Gotenberg; dịch vụ đó trục trặc là lỗi |
| C. Chrome headless trên Vercel (HTML → PDF) | Mẫu viết bằng HTML/CSS | Gói nặng, khởi động lạnh chậm, dễ vượt giới hạn function |

Người dùng chọn A.

### Áp dụng cho

- **Hoá đơn tháng** (`invoice_monthly`).
- **Phiếu thu** (`receipt`): không có QR, vì tiền đã thu rồi.
- **Hoá đơn thanh lý** (`invoice_termination`): hiện chưa có bộ nạp dữ liệu nào. Nếu trong code đã có dữ liệu hoá đơn thanh lý thì dùng chung bố cục PDF này; nếu chưa, ghi lại thành việc làm sau, không tự dựng tính năng mới.

### Thư viện (cần người dùng đồng ý vì là phụ thuộc mới)

- `@react-pdf/renderer`: dựng PDF bằng JSX ở server, nhúng được font TTF.
- Font Be Vietnam Pro dạng TTF (Regular, Medium, SemiBold, Bold), đặt trong repo, để dấu tiếng Việt hiển thị đúng.
- `qrcode`: vẽ mã QR thành ảnh để chèn vào PDF.

### Bố cục

Theo mockup đã duyệt, phong cách Bạc hà:

- Phần đầu: logo Siris, tên và địa chỉ cơ sở, "Hoá đơn tháng MM/YYYY", mã hoá đơn, ngày lập. Dưới cùng phần đầu là một vạch xanh ngọc.
- Ô thông tin: khách thuê, phòng, kỳ, số điện thoại.
- Bảng: Khoản / Số lượng / Đơn giá / Thành tiền. Dòng điện, nước ghi chỉ số cũ → mới nếu có.
- Ô tổng cộng in to, bên dưới là số tiền bằng chữ (`numberToVietnameseWords` sẵn có).
- Khối thanh toán: QR bên trái; bên phải là ngân hàng, số tài khoản, chủ tài khoản, nội dung chuyển khoản, hạn thanh toán.
- Chân trang: tên cơ sở, số trang.

### QR chuyển khoản

- Theo chuẩn **VietQR** (EMVCo, NAPAS 247). Chuỗi dữ liệu do app tự dựng bằng một hàm thuần trong `src/domain/vietqr.ts`, có unit test, kể cả kiểm tra CRC16-CCITT. Không gọi dịch vụ ngoài.
- **Số tiền** trong QR là số còn phải trả (tổng − đã thu). **Nội dung** là mã hoá đơn.
- Khi đã trả đủ: không có QR, thay bằng dòng "Đã thanh toán".
- Khi chưa cấu hình tài khoản ngân hàng: PDF vẫn xuất, không có khối QR.

### Tài khoản nhận tiền

- Có **một tài khoản chung** cho tất cả cơ sở, lưu trong `app_settings` (khoá `bank_account`). Gồm: ngân hàng (mã BIN và tên), số tài khoản, tên chủ tài khoản.
- Mỗi cơ sở có thể đặt **tài khoản riêng**. Nếu có, tài khoản riêng thay cho tài khoản chung. Hiện tại mọi cơ sở dùng tài khoản chung.
- Lưu: thêm cột `bank_account` (jsonb, có thể để trống) vào `facilities`. Tạo migration bằng `npm run db:generate`.
- Giao diện:
  - Trang **Cài đặt** có mục "Tài khoản nhận tiền".
  - Form **Cơ sở** có mục tuỳ chọn "Dùng tài khoản riêng".
  - Chọn ngân hàng từ danh sách mã BIN các ngân hàng Việt Nam, lưu tĩnh trong `src/domain`.
- Quyền sửa: giống quyền sửa cài đặt (`settings`) và quyền sửa cơ sở hiện có.

### Thay đổi trong app

- `exportDocument`: với ba loại trên, bỏ bước điền mẫu Word, gọi bộ dựng PDF mới. Định dạng cho phép chỉ còn `pdf` và `png`; mặc định là `pdf`.
- Trang chi tiết hoá đơn có hai nút: **Tải PDF** (nút chính) và **Tải ảnh**. Phiếu thu tải PDF.
- Trang **Mẫu giấy tờ** ẩn ba loại này, vì chúng không còn dùng mẫu Word.
- Sửa `docs/operations/gotenberg.md` cho đúng: Gotenberg giờ chỉ còn dùng cho hợp đồng, phụ lục, biên bản.

## Phần 3b — Giá phí dịch vụ chung, toà nào cần thì đặt riêng

Hiện trạng:

- Giá điện nước đã đặt được riêng cho từng toà (`utility_rates`).
- Phí dịch vụ (`fee_types`) chỉ có một `default_price` chung. Giá này được dùng để điền sẵn khi tạo hợp đồng (`lease-wizard`) và khi lập phụ lục (`addenda/service.ts`). Giá đã chốt thì lưu trong hợp đồng.

Thay đổi:

- Thêm bảng `fee_type_prices (fee_type_id, facility_id, price)`, mỗi cặp (loại phí, toà) là duy nhất. Tạo migration bằng `npm run db:generate`.
- Thêm hàm thuần trong `src/domain`: chọn giá của toà nếu có, không có thì lấy giá chung. Có unit test.
- Khi tạo hợp đồng hoặc phụ lục: giá điền sẵn lấy theo toà của phòng đang chọn. Nhân viên vẫn sửa được như hiện nay.
- Hợp đồng đã có và hoá đơn đã lập giữ nguyên giá cũ, không tính lại.
- Trang Cài đặt → Loại phí: mỗi loại phí có giá chung, và một danh sách "Giá riêng theo toà" để thêm, sửa, xoá. Quyền sửa giống quyền `settings` hiện có.

## Phần 4 — Giao diện "Bạc hà"

Người dùng đã chọn hướng A trong mockup.

- **Màu:**
  - Nền `#F3F7F5`, bề mặt `#FFFFFF`, chữ `#1C2B27`, chữ phụ `#4B5E58` và `#7A8B85`, viền `#E1EAE6`.
  - Màu chính xanh ngọc `#0E9F6E`, màu cảnh báo vàng `#F2A900`, màu lỗi theo `destructive`.
  - Có bản tối (dark) tương ứng.
- **Font:** Be Vietnam Pro, đang dùng sẵn. Số tiền dùng `tabular-nums`, căn phải.
- **Chuyển màu sang token shadcn trong `globals.css`:** `--primary`, `--background`, `--sidebar*`, `--radius`, … để mọi component ăn theo, không phải sửa từng chỗ.
- **Khung app:**
  - Menu bên nền trắng; mục đang chọn là khối xanh ngọc, chữ trắng.
  - Có biểu tượng cho từng mục (lucide).
  - Trên điện thoại, menu thu vào một nút bấm.
- **Trang danh sách:**
  - Tiêu đề trang và nút hành động chính cùng một hàng.
  - Bộ lọc dạng chip có kèm số đếm.
  - Bảng đặt trên nền trắng bo góc; trạng thái hiển thị bằng chấm màu kèm chữ; mã phòng in đậm.
  - Có trạng thái trống, nói rõ cần làm gì tiếp.
- **Các toà hiện chung, lọc theo toà:**
  - Bỏ ô chọn cơ sở ở thanh trên. Hiện ô này chỉ lưu giá trị chọn chứ không lọc gì cả, tức là một tính năng làm dở.
  - Mọi trang danh sách (khách thuê, hợp đồng, điện nước, hoá đơn, tài sản, sự cố, phòng) hiện dữ liệu của tất cả toà mà người dùng có quyền xem, và có bộ lọc "Toà" ngay trên bảng (chọn được nhiều toà).
  - Bộ lọc lưu trên URL (`?toa=`) để tải lại trang hay gửi link vẫn giữ nguyên lựa chọn.
  - Hiện hợp đồng và hoá đơn chưa có bộ lọc theo toà, nên phải thêm.
  - Bảng có cột "Toà" khi đang xem nhiều toà cùng lúc.
- **Áp dụng cho:** khung app, trang tổng quan, mọi trang danh sách và chi tiết, form và hộp thoại, trang đăng nhập. Chỉ đổi phần trình bày, không đổi logic.
- Dùng `frontend-design` khi làm. Kiểm tra bằng ảnh chụp màn hình ở cỡ desktop và điện thoại.

## Ràng buộc

- Theo kiến trúc N-Layer trong `CLAUDE.md`:
  - Hàm VietQR và danh sách ngân hàng nằm ở `domain`.
  - Bộ dựng PDF nằm ở `server` (ví dụ `src/server/invoices/pdf/`).
  - Nút xuất nằm ở `features/invoices`.
- Commit, chú thích, chữ trên giao diện viết tiếng Việt.
- Không sửa tay file trong `drizzle/`.
- Mỗi phần chạy `npm test`, `npm run lint`, `npm run build` trước khi xong. E2E chạy preflight trước.

## Để người làm tự quyết

- Mức đích tốc độ cụ thể, sau khi đo.
- Cách tách component PDF.
- Kích thước QR; mục tiêu là in ra vẫn quét được.
- Chi tiết skeleton của từng trang.
- Thứ tự sửa giao diện giữa các trang.
