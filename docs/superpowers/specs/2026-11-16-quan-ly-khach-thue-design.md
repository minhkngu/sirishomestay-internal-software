# Siris — Web quản lý khách thuê dài hạn: Thiết kế

Ngày: 2026-11-16 · Trạng thái: bản nháp chờ duyệt

## 1. Mục đích và lý do

Đội vận hành đang quản lý khách thuê dài hạn ở nhiều cơ sở bằng một phần mềm khác **khó sử dụng và không tuỳ biến được**. Siris thay thế phần mềm đó bằng một web nội bộ:

- dễ dùng cho nhân viên hằng ngày;
- tuỳ biến theo cách vận hành riêng: loại phí và đơn vị tự định nghĩa, mẫu hợp đồng/hoá đơn bằng Word tự tải lên, phân quyền dạng tick;
- **chủ động nhắc việc**: khách chưa thanh toán, visa sắp hết, hợp đồng sắp hết hạn, giấy tờ chưa ký.

Thành công = đội chuyển hẳn khỏi phần mềm cũ (nhập được dữ liệu cũ từ Excel), mở web ra là thấy việc cần xử lý hôm nay, và lập hoá đơn tháng / thanh lý không phải tính tay.

## 2. Mục tiêu, phi mục tiêu, phản mục tiêu

**Mục tiêu**
- Quản lý cơ sở → phòng; khách (nước ngoài / Việt Nam / công ty).
- Vòng đời hợp đồng: cọc → thuê → phụ lục (gia hạn, chuyển phòng, thanh lý), có biên bản bàn giao lúc check-in và check-out.
- Tài chính: sổ cọc, hoá đơn tháng (trả trước tiền phòng + trả sau điện nước), phí dịch vụ tuỳ biến, phí phạt, hoá đơn thanh lý.
- Chỉ số điện nước theo phòng, xử lý thay đồng hồ và đổi đơn giá.
- Tài sản trong phòng / toà / kho, chuyển tài sản nhanh, có lịch sử.
- Sự cố và sửa chữa.
- Bảng nhắc việc nội bộ.
- Xuất giấy tờ từ mẫu Word ra Word / PDF; hoá đơn xuất được PDF và ảnh PNG.
- Nhập dữ liệu từ Excel của phần mềm cũ.

**Phi mục tiêu (giai đoạn này)**
- Khách tự đăng nhập bằng số điện thoại (làm sau — nhưng mô hình dữ liệu phải chừa chỗ: khách có `phone` duy nhất, chuẩn hoá E.164).
- Gửi nhắc nhở tự động cho khách qua SMS/Zalo/email — nhắc việc chỉ hiển thị nội bộ.
- Ký số / chữ ký điện tử có giá trị pháp lý — chỉ theo dõi trạng thái ký + tải lên bản scan/PDF đã ký.
- Hoá đơn điện tử theo quy định thuế; thanh toán online; kế toán tổng hợp.
- Khai báo tạm trú tự động với cơ quan chức năng.

**Phản mục tiêu (thất bại dù chạy được)**
- Giao diện kiểu "trang quản trị CRUD" rối, nhiều bước — lặp lại vấn đề của phần mềm cũ.
- Những thứ người dùng cần tuỳ biến (loại phí, đơn vị, mẫu giấy tờ, quyền) lại bị hard-code.
- Hoá đơn đã duyệt bị hệ thống tự thay đổi âm thầm khi đổi giá / sửa hợp đồng (chỉ người dùng chủ động sửa, và có nhật ký).

## 3. Ràng buộc

- Ngôn ngữ giao diện: tiếng Việt. Tiền tệ VND, số nguyên (không có xu).
- Quy mô giả định: vài cơ sở, vài trăm phòng, dưới ~20 người dùng nội bộ (chưa được xác nhận).
- Mẫu giấy tờ do người dùng soạn trong Word (.docx), có chỗ điền dạng `{tên_trường}`.
- Dữ liệu cá nhân nhạy cảm (passport, CCCD, ảnh giấy tờ) — chỉ người có quyền mới xem; file lưu trong storage riêng tư.

## 4. Các cách đã cân nhắc

| Cách | Ưu | Nhược | Kết luận |
|---|---|---|---|
| **A. Next.js + Supabase (Postgres, Auth, Storage) trên Vercel**, thêm dịch vụ chuyển đổi Word→PDF (Gotenberg/LibreOffice) chạy container | Tuỳ biến hoàn toàn, UI làm theo ý, không quản lý server cho app chính, dễ mở rộng cổng khách sau | Cần thêm một dịch vụ container cho PDF; LibreOffice render Word ~95% giống | **Đã chọn** (người dùng không phản đối; đây là lựa chọn kỹ thuật của Claude) |
| B. Django/Laravel trên VPS | PDF dễ (LibreOffice cùng server) | Tự lo server/backup/bảo mật; admin có sẵn dễ thành khó dùng | Loại |
| C. Nền tảng kéo-thả (Lark Base, Appsmith…) | Nhanh nhất | Giới hạn với tính tiền phức tạp, điền mẫu Word, phân quyền theo cơ sở — lặp lại vấn đề "không customize được" | Loại |

## 5. Người dùng và phân quyền (người dùng đã quyết định)

- Mỗi người dùng có: danh sách **cơ sở được truy cập** (tick) và danh sách **nhóm quyền** (tick, nhiều nhóm cùng lúc).
- Quyền **giống nhau ở mọi cơ sở** người đó được giao.
- Nhóm quyền (đề xuất, có thể tinh chỉnh khi lập kế hoạch):
  - Khách & hợp đồng
  - Hoá đơn & thu tiền
  - Ghi điện nước
  - Tài sản & kho
  - Sự cố & sửa chữa
  - Cài đặt (người dùng, giá, loại phí, đơn vị, mẫu giấy tờ) — kiêm "admin", thấy mọi cơ sở
- *(Claude quyết)* Nhóm quyền **cố định** trong code (không cho admin tự tạo nhóm); mỗi nhóm gồm cả xem và sửa trong phạm vi của nó. Số passport/CCCD và ảnh giấy tờ chỉ người có nhóm "Khách & hợp đồng" xem được. Người chỉ có "Ghi điện nước" thấy phòng và đồng hồ, không thấy thông tin khách hay tiền. Thêm nhóm quyền chi tiết hơn để sau nếu cần.
- Phân quyền thực thi ở server (RLS Postgres hoặc kiểm tra trong server actions — builder chọn), không chỉ ẩn nút trên UI.
- Mọi thao tác ghi quan trọng (hoá đơn, thu tiền, hợp đồng, tài sản) ghi nhật ký: ai, lúc nào, thay đổi gì.

## 6. Mô hình nghiệp vụ

### 6.1 Cơ sở, phòng
- Cơ sở (toà): tên, địa chỉ, ghi chú.
- Phòng: thuộc cơ sở; mã phòng, tầng, loại phòng, diện tích, giá thuê niêm yết, sức chứa, trạng thái suy ra (trống / đã cọc / đang ở / sắp trả).
- Mỗi phòng có đồng hồ điện, đồng hồ nước (xem 6.6).
- **Ràng buộc (người dùng đã quyết định):** tại một thời điểm, mỗi phòng có tối đa **1 hợp đồng thuê đang hiệu lực** và **1 hợp đồng cọc đang chờ** (giữ phòng cho khách kế tiếp, vào ở sau khi khách hiện tại trả phòng). Không cho thuê theo giường / nhiều hợp đồng chung phòng. Ngày vào ở dự kiến của hợp đồng cọc chờ không được trước ngày kết thúc của hợp đồng thuê hiện tại (cảnh báo nếu chồng lấn).

### 6.2 Khách thuê
- Loại: **nước ngoài** (họ tên, quốc tịch, số passport, ngày hết hạn passport, loại visa, **ngày hết hạn visa**), **Việt Nam** (họ tên, số CCCD, ngày cấp, nơi cấp, ngày sinh, địa chỉ thường trú), **công ty** (tên công ty, mã số thuế/mã số công ty, địa chỉ, người đại diện, người liên hệ).
- Chung: số điện thoại (duy nhất, sẽ dùng để khách đăng nhập sau này), email, ghi chú, ảnh giấy tờ đính kèm.
- Hợp đồng có **một bên thuê** (khách cá nhân hoặc công ty) và **danh sách người ở** (các khách cá nhân thực tế ở trong phòng). Số người ở dùng để tính phí theo người. Visa nhắc theo từng người ở.

### 6.3 Hợp đồng và phụ lục
- **Hợp đồng cọc**: giữ phòng; số tiền cọc giữ chỗ, ngày dự kiến vào ở, giá thuê thoả thuận. Kết thúc bằng chuyển thành hợp đồng thuê hoặc huỷ (mất cọc / hoàn cọc — ghi vào sổ cọc).
- **Hợp đồng thuê**: tạo từ hợp đồng cọc (kế thừa dữ liệu, cọc giữ chỗ chuyển sang/thành một phần cọc thuê) hoặc tạo trực tiếp. Gồm: phòng, bên thuê, người ở, ngày bắt đầu/kết thúc, giá thuê tháng, tiền cọc, kỳ thanh toán mặc định, danh sách phí dịch vụ áp dụng (loại phí + số lượng + đơn giá chốt), quy tắc tính lẻ ngày (kế thừa mặc định hệ thống).
- **Phụ lục**:
  - *Gia hạn*: ngày kết thúc mới; có thể đổi giá thuê và phí dịch vụ từ ngày hiệu lực. Nếu tiền cọc theo hợp đồng thay đổi → tự tạo dòng **thu cọc bổ sung** hoặc **hoàn cọc chênh lệch** trong sổ cọc (chờ thu/chi).
  - *Chuyển phòng*: phòng mới, ngày hiệu lực, có thể đổi giá; kéo theo chốt chỉ số điện nước phòng cũ, biên bản bàn giao trả phòng cũ + nhận phòng mới; hoá đơn kỳ đó tách theo ngày ở mỗi phòng.
  - *Thanh lý*: ngày trả phòng; kéo theo biên bản bàn giao check-out và hoá đơn thanh lý (6.5).
- Mỗi hợp đồng/phụ lục có **trạng thái ký**: nháp → đã xuất → đã ký (tải lên bản scan/PDF đã ký). Dữ liệu hiệu lực của hợp đồng tại một ngày = hợp đồng gốc + các phụ lục đã có hiệu lực tới ngày đó.

### 6.4 Biên bản bàn giao
- **Check-in**: tự lấy danh sách tài sản đang ở phòng; mỗi món ghi tình trạng + ảnh; chốt chỉ số điện nước đầu; xuất từ mẫu Word để ký.
- **Check-out**: dùng lại danh sách check-in để đối chiếu; đánh dấu hư / mất + số tiền phạt; chốt chỉ số cuối. Phạt chuyển thành dòng phí phạt trên hoá đơn thanh lý.

### 6.5 Tài chính

**Loại phí và đơn vị (tuỳ biến)**
- Admin tự tạo **đơn vị** (người, phòng, xe, kg, lần, …) và **loại phí** (tên, đơn vị, đơn giá mặc định, kiểu: *cố định hằng tháng* — trả trước, hoặc *theo lần / theo tiêu thụ* — trả sau).
- Phí theo người: số lượng mặc định = số người ở. Phí theo lần: nhân viên thêm khi phát sinh (ngày, số lượng), được gom vào hoá đơn kỳ kế tiếp.

**Hoá đơn tháng** (người dùng đã quyết định)
- Hoá đơn phát hành đầu tháng N gồm:
  - tiền phòng + phí cố định của **kỳ N** (trả trước);
  - điện, nước, phí theo lần của **tháng N−1** (trả sau).
- Kỳ mặc định = trọn tháng dương lịch (1/10–31/10). Vào/ra giữa tháng → tính lẻ theo ngày, **trừ khi** chọn "tính full tháng".
- Tính lẻ ngày: cài đặt hệ thống chọn **chia 30** hoặc **chia số ngày thực của tháng**; được ghi đè trên từng hoá đơn.
- **Trả nhiều tháng**: được sửa tay ngày bắt đầu/kết thúc kỳ; hệ thống tính **hệ số** (số tháng, có lẻ theo ngày) × giá tháng; hệ số được sửa tay.
- Tạo hàng loạt: chọn cơ sở + tháng → sinh nháp hoá đơn cho mọi hợp đồng đang hiệu lực; nhân viên xem, chỉnh, rồi duyệt.
- **Trạng thái hoá đơn (người dùng đã quyết định):** nháp → đã duyệt → đã thu một phần / đã thu đủ. Hoá đơn **duyệt được, xoá được, điều chỉnh được** (thêm/sửa/xoá dòng) — mọi thay đổi sau khi duyệt ghi nhật ký; hoá đơn đã có khoản thu thì phải gỡ khoản thu trước khi xoá.
- Hệ thống **không tự sửa** hoá đơn đã duyệt khi giá / hợp đồng thay đổi.
- **Thay đổi giữa kỳ (người dùng đã quyết định):** khi chuyển phòng, gia hạn đổi giá, đổi số người ở… có hiệu lực sau khi hoá đơn kỳ đó đã duyệt, phần chênh lệch (dương hoặc âm) tự sinh thành **dòng điều chỉnh trên hoá đơn kỳ kế tiếp**, ghi rõ lý do và khoảng ngày. Nhân viên vẫn có thể chọn sửa thẳng hoá đơn hiện tại thay vào đó.
- Khách đã trả trước nhiều tháng mà giá đổi trong khoảng đó: **giữ giá cũ cho phần đã trả**; giá mới áp từ kỳ chưa trả.
- **Ngày tạo hoá đơn (người dùng đã quyết định):** không cố định ngày 1 — nhân viên tạo hoá đơn vào ngày họ chọn (đợt hàng loạt chạy khi nhân viên bấm, chọn cơ sở + kỳ). Hoá đơn đầu tiên của hợp đồng mới cũng tạo vào lúc nhân viên chọn (thường khi ký / check-in), gồm cọc còn thiếu + tiền phòng lẻ ngày tới hết tháng; các kỳ sau vào đợt hàng loạt. Cài đặt có "ngày tạo hoá đơn dự kiến" theo cơ sở để bảng nhắc việc báo khi tới ngày mà chưa tạo.
- **Hạn thanh toán (người dùng đã quyết định):** quy tắc chọn một trong hai — *ngày X của tháng sau* hoặc *N ngày sau ngày duyệt*. Có quy tắc mặc định trong cài đặt, ghi đè được theo từng hợp đồng, và sửa tay được trên từng hoá đơn (chọn quy tắc hoặc nhập ngày cụ thể). Quá hạn mà chưa thu đủ → bảng nhắc việc.
- Thu tiền: ghi nhận thanh toán (ngày, số tiền, hình thức, người thu), cho phép trả một phần; công nợ = tổng phát hành − tổng đã thu.

**Sổ cọc** (theo từng hợp đồng)
- Các dòng: thu cọc, thu bổ sung, khấu trừ (phạt, nợ), hoàn cọc, mất cọc. Số dư cọc = tổng.

**Hoá đơn thanh lý**
- Tiền phòng lẻ ngày đến ngày trả (hoặc phần hoàn nếu đã trả trước dư), điện nước đến ngày trả, phí theo lần chưa tính, phí phạt từ biên bản check-out, nợ cũ, **trừ số dư cọc** → kết quả: hoàn cho khách hoặc khách phải trả thêm.
- Trả phòng trước hạn *(Claude quyết)*: nhân viên chọn tay **mất cọc: toàn bộ / một phần (nhập số) / không**; hệ thống không tự áp quy tắc báo trước. Phần mất cọc ghi vào sổ cọc.

### 6.6 Điện nước
- Mỗi phòng có lịch sử **đồng hồ** (điện/nước): ngày lắp, chỉ số đầu, ngày gỡ, chỉ số cuối.
- Ghi chỉ số theo kỳ: màn hình nhập nhanh cho cả cơ sở (danh sách phòng, ô chỉ số mới, hiện chỉ số cũ và cảnh báo tiêu thụ bất thường / chỉ số giảm).
- **Thay đồng hồ giữa tháng**: tiêu thụ kỳ = (cuối đồng hồ cũ − đầu kỳ) + (chỉ số mới − đầu đồng hồ mới).
- Tiền điện = kWh × đơn giá. Nước: m³ × đơn giá (mặc định); cho phép cấu hình nước theo người qua loại phí.
- **Đơn giá có ngày hiệu lực**, theo cơ sở. Giá mới áp cho kỳ bắt đầu từ ngày hiệu lực; hoá đơn cũ giữ nguyên.

### 6.7 Tài sản và kho
- Tài sản: mã, tên, loại, giá trị (dùng gợi ý tiền phạt), tình trạng, vị trí hiện tại = một **phòng**, **khu vực chung của toà**, hoặc **kho** (kho có thể theo cơ sở).
- Hỗ trợ cả tài sản theo từng món (có mã) và vật tư theo số lượng (ví dụ 20 bóng đèn trong kho) — builder chọn cách mô hình.
- **Chuyển tài sản nhanh**: chọn một/nhiều món → chọn vị trí đích → xong; mỗi lần chuyển ghi lịch sử (từ, đến, ai, lúc nào, lý do).
- Thanh lý / báo hỏng tài sản.

### 6.8 Sự cố và sửa chữa
- Phiếu sự cố: vị trí (phòng / khu vực chung / tài sản cụ thể), mô tả, ảnh, mức ưu tiên, người báo, người xử lý, trạng thái (mới → đang xử lý → xong / huỷ), chi phí.
- Nếu lỗi do khách: chi phí chuyển thành phí phạt trên hoá đơn kỳ tới của hợp đồng tương ứng.
- Gắn với tài sản: lịch sử sửa chữa hiện trên trang tài sản; thay thiết bị → cập nhật tài sản.

### 6.9 Bảng nhắc việc (trang chủ)
Lọc theo cơ sở người dùng được thấy, chỉ hiện mục người dùng có quyền:
- Hoá đơn quá hạn chưa thanh toán (số tiền, số ngày quá hạn).
- Visa sắp hết hạn (mặc định trước 30 ngày; ngưỡng cấu hình được).
- Hợp đồng sắp hết hạn (mặc định trước 30 ngày; cấu hình được).
- Hợp đồng / phụ lục chưa ký.
- Kỳ chưa ghi chỉ số điện nước; hoá đơn tháng chưa tạo.
- Sự cố đang mở; khoản cọc bổ sung / hoàn cọc đang chờ.

## 7. Mẫu giấy tờ Word

- Loại giấy tờ: hợp đồng cọc, hợp đồng thuê, phụ lục gia hạn, phụ lục chuyển phòng, phụ lục thanh lý, biên bản bàn giao check-in, check-out, hoá đơn tháng, hoá đơn thanh lý, phiếu thu.
- Admin tải lên **nhiều mẫu cho mỗi loại** (ví dụ bản tiếng Việt, bản song ngữ); khi xuất thì chọn mẫu, có mẫu mặc định.
- Chỗ điền dạng `{tên_trường}`; hỗ trợ **vòng lặp** cho bảng (dòng hoá đơn, danh sách tài sản, người ở). Dùng docxtemplater.
- Trong web có **trang tra cứu chỗ điền**: liệt kê mọi trường dùng được cho từng loại giấy tờ, kèm ví dụ.
- Định dạng sẵn: tiền (1.500.000), ngày (dd/mm/yyyy), số tiền bằng chữ tiếng Việt.
- Xuất: **.docx** (mọi loại); **PDF** qua dịch vụ Gotenberg (LibreOffice) chạy dạng container; **PNG** cho hoá đơn (render từ PDF). Container phải cài các font phổ biến trong mẫu (Times New Roman, Arial…).
- Bản xuất được lưu lại kèm hợp đồng/hoá đơn.

## 8. Nhập dữ liệu từ Excel

- Nhập: cơ sở/phòng, khách, hợp đồng đang hiệu lực, số dư cọc, công nợ đầu kỳ, chỉ số điện nước gần nhất, tài sản.
- Luồng: tải file → ghép cột ↔ trường → xem trước, báo lỗi từng dòng → xác nhận nhập. Chạy lại được mà không tạo trùng (khoá theo mã phòng, số điện thoại/giấy tờ, mã hợp đồng).
- Chưa có file mẫu từ phần mềm cũ — builder thiết kế bước ghép cột đủ linh hoạt.

## 9. Kiến trúc (lựa chọn của Claude)

- **Next.js (App Router, TypeScript)** + Tailwind + shadcn/ui; giao diện tiếng Việt, dùng tốt trên điện thoại cho việc ghi chỉ số / sự cố / bàn giao.
- **Supabase**: Postgres, Auth (email + mật khẩu cho nhân viên; số điện thoại cho khách về sau), Storage riêng tư cho ảnh và file.
- **Vercel** cho app; **Gotenberg** chạy container (Vercel container function hoặc dịch vụ nhỏ riêng — builder chọn).
- **Ảnh (bàn giao, sự cố, giấy tờ)** *(Claude quyết, theo lo ngại dung lượng của người dùng)*:
  - Nén ngay trên trình duyệt trước khi tải lên: cạnh dài tối đa ~1600px, WebP/JPEG chất lượng ~75% → ~150–300KB/ảnh (ảnh điện thoại gốc 3–8MB). Tạo thêm thumbnail ~300px để hiển thị danh sách.
  - Ước tính: 300 phòng × 2 lần bàn giao/năm × 30 ảnh × 250KB ≈ 4,5GB/năm (cộng ảnh sự cố, giấy tờ → ~5–8GB/năm).
  - **Hạ tầng ban đầu (người dùng đã quyết định): dùng gói miễn phí, cần thì nâng cấp.** Supabase Free cho Postgres + Auth; file (ảnh, mẫu Word, bản xuất, bản scan đã ký) lưu ở **Cloudflare R2** (gói miễn phí 10GB) vì Supabase Free chỉ có 1GB storage. Truy cập qua URL ký có thời hạn. Nâng lên Supabase Pro sau này không cần sửa code.
  - **Thời hạn lưu (người dùng đã quyết định):** ảnh bàn giao (check-in, check-out) của một hợp đồng chỉ giữ **30 ngày sau ngày thanh lý**, sau đó tự xoá bằng một tác vụ chạy hằng ngày (Vercel Cron hoặc pg_cron). Biên bản đã xuất (Word/PDF) và dữ liệu văn bản (tình trạng, tiền phạt) vẫn giữ. *(Claude đề xuất)* Ảnh giấy tờ tuỳ thân (passport, CCCD) xoá cùng lúc để giảm lưu trữ dữ liệu cá nhân; ảnh sự cố giữ lại vì gắn với lịch sử tài sản. Có nút **"Giữ lại"** trên hợp đồng để hoãn xoá khi đang tranh chấp. Trước khi xoá 7 ngày, bảng nhắc việc liệt kê các hợp đồng sắp bị xoá ảnh.
  - Với chính sách này, dung lượng ảnh gần như không tăng theo năm — chỉ bằng ảnh của các hợp đồng đang ở (~vài GB).
  - Code truy cập file đi qua một lớp lưu trữ chung (adapter) để có thể chuyển sang **Cloudflare R2** (rẻ, không phí tải xuống) mà không sửa nghiệp vụ, nếu dung lượng tăng vượt dự tính.
- **Sao lưu ra Google Drive (người dùng yêu cầu)** — vì Supabase Free không có sao lưu tự động:
  - GitHub Actions chạy theo lịch mỗi đêm: `pg_dump` toàn bộ cơ sở dữ liệu → nén → tải lên một thư mục Google Drive (qua rclone, dùng tài khoản dịch vụ được chia sẻ quyền vào thư mục đó). Giữ 30 bản gần nhất, xoá bản cũ hơn.
  - Chỉ sao lưu cơ sở dữ liệu Supabase (người dùng đã quyết định); file trong R2 không sao lưu ra Drive.
  - Báo lỗi nếu bản sao lưu thất bại (email của GitHub Actions). Có tài liệu hướng dẫn khôi phục và chạy thử khôi phục một lần trước khi dùng thật.
- Tiền lưu dạng số nguyên VND. Ngày lưu dạng `date` (không giờ) cho nghiệp vụ; múi giờ Asia/Ho_Chi_Minh.
- Logic tính tiền (lẻ ngày, hệ số, thay đồng hồ, đổi giá, thanh lý) gom trong một module thuần, có test đầy đủ.

## 10. Lộ trình theo đợt

1. Nền tảng: đăng nhập, người dùng + phân quyền, cơ sở/phòng, khách, nhập Excel (phần tương ứng), khung bảng nhắc việc (visa).
2. Hợp đồng cọc/thuê/phụ lục, mẫu Word + xuất docx/PDF, biên bản bàn giao, nhắc hợp đồng hết hạn / chưa ký.
3. Điện nước, loại phí/đơn vị, hoá đơn tháng, thu tiền, sổ cọc, hoá đơn thanh lý, xuất PDF/PNG, nhắc công nợ.
4. Tài sản & kho, sự cố & sửa chữa (gắn với biên bản và phí phạt).

Mỗi đợt dùng được độc lập; kế hoạch triển khai lập riêng cho từng đợt.

## 11. Để builder quyết định

- Lược đồ bảng cụ thể, cách mô hình tài sản theo món vs theo số lượng.
- RLS hay kiểm tra quyền ở tầng server actions (miễn là thực thi ở server).
- Nơi chạy Gotenberg; cách render PDF→PNG.
- Thiết kế UI chi tiết (theo nguyên tắc: ít bước, thao tác hàng loạt, tìm kiếm nhanh).
- Đánh số hợp đồng / hoá đơn (đề xuất: tiền tố theo cơ sở + năm + số thứ tự).
