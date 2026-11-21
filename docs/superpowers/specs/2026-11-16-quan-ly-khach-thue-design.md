# Siris — Web quản lý khách thuê dài hạn: Thiết kế tổng

Spec duy nhất của dự án. Bản đầu 16/11/2026; đã gộp các spec con (17–20/11/2026) và cập nhật theo hiện trạng. Chuyện đã làm xong ghi lại ở đây như quy tắc hiện hành, không kể lịch sử. Lịch sử từng bước xem trong git.

## 1. Mục đích và lý do

Đội vận hành quản lý khách thuê dài hạn ở nhiều cơ sở bằng một phần mềm khác khó dùng và không tuỳ biến được. Siris thay bằng một web nội bộ:

- dễ dùng cho nhân viên hằng ngày;
- tuỳ biến theo cách vận hành riêng: loại phí và đơn vị tự định nghĩa, mẫu giấy tờ soạn trong app, phân quyền dạng tick;
- chủ động nhắc việc: chưa thanh toán, visa sắp hết, hợp đồng sắp hết hạn, giấy tờ chưa ký.

Thành công = đội chuyển hẳn khỏi phần mềm cũ (nhập được dữ liệu cũ từ Excel), mở web là thấy việc cần xử lý hôm nay, lập hoá đơn tháng và thanh lý không phải tính tay.

## 2. Mục tiêu, phi mục tiêu, phản mục tiêu

**Mục tiêu**
- Cơ sở (toà) → phòng; khách (nước ngoài / Việt Nam / công ty).
- Vòng đời hợp đồng: cọc → thuê → phụ lục (gia hạn, chuyển phòng, chuyển nhượng, thanh lý), biên bản bàn giao check-in/check-out.
- Tài chính: sổ cọc, hoá đơn tháng, phí dịch vụ tuỳ biến, phí phạt, hoá đơn thanh lý, thu tiền.
- Điện nước theo đồng hồ, tài sản trong phòng/toà/kho, sự cố và sửa chữa, bảng nhắc việc.
- Xuất giấy tờ PDF/Word từ mẫu soạn trong app; hoá đơn PDF có QR chuyển khoản, xuất được ảnh PNG.
- Nhập dữ liệu từ Excel.

**Phi mục tiêu**
- Khách tự đăng nhập (mô hình dữ liệu chừa chỗ: `phone` duy nhất, chuẩn E.164).
- Gửi nhắc tự động cho khách (SMS/Zalo/email); nhắc việc chỉ hiện nội bộ.
- Chữ ký số có giá trị pháp lý (chỉ theo dõi trạng thái ký và tải bản scan).
- Hoá đơn điện tử theo quy định thuế, thanh toán online, kế toán tổng hợp, tự đối soát tiền về, khai báo tạm trú.

**Phản mục tiêu (thất bại dù chạy được)**
- Giao diện CRUD rối, nhiều bước.
- Hard-code thứ người dùng cần tuỳ biến (loại phí, đơn vị, mẫu, quyền).
- Hệ thống tự thay đổi âm thầm hoá đơn đã duyệt khi đổi giá hoặc sửa hợp đồng.
- Một luồng đang chạy bị hỏng vì làm đẹp giao diện; hoá đơn PDF lỗi font hoặc QR sai số tiền; thông báo lỗi lộ chi tiết kỹ thuật.

## 3. Ràng buộc

- Giao diện, commit, chú thích bằng tiếng Việt. Tiền VND số nguyên; hiển thị bằng `formatVND`, ô nhập bằng `money-input`. Ngày lưu dạng `date`, múi giờ Asia/Ho_Chi_Minh.
- Quy mô giả định: vài cơ sở, vài trăm phòng, dưới ~20 người dùng.
- Dữ liệu nhạy cảm (passport, CCCD, ảnh giấy tờ) chỉ người có quyền xem; file ở storage riêng tư.
- Kiến trúc N-Layer và quy ước ở `CLAUDE.md`; migration sinh bằng `npm run db:generate`, không sửa tay `drizzle/`.

## 4. Người dùng và phân quyền

- Mỗi người dùng có danh sách cơ sở được truy cập (tick) và nhóm quyền (tick, nhiều nhóm). Quyền giống nhau ở mọi cơ sở được giao.
- Nhóm quyền cố định trong code: Khách & hợp đồng; Hoá đơn & thu tiền; Ghi điện nước (`meters`); Tài sản & kho (`assets`); Sự cố & sửa chữa; Cài đặt (`settings`, kiêm admin, thấy mọi cơ sở); và quyền riêng **Xoá hợp đồng** (`delete_contracts`). Admin tự có mọi quyền.
- Passport/CCCD/ảnh giấy tờ chỉ nhóm "Khách & hợp đồng" xem. Người chỉ có "Ghi điện nước" thấy phòng và đồng hồ, không thấy khách hay tiền.
- Quyền kiểm ở server (`can()`/`assertCan`), không chỉ ẩn nút. Mọi thao tác ghi quan trọng ghi nhật ký (ai, lúc nào, thay đổi gì).

## 5. Mô hình nghiệp vụ

### 5.1 Cơ sở, phòng
- Cơ sở: tên, địa chỉ, ghi chú, tài khoản nhận tiền riêng tuỳ chọn.
- Phòng: mã, tầng, loại, diện tích (`area_m2`), số giường (`beds`, số lượng), tiện ích (bảng `amenities` + nối `room_amenities`, quản lý ở Cài đặt, không xoá cứng tiện ích đã gắn), giá niêm yết, sức chứa, trạng thái suy ra (trống / đã cọc / đang ở / sắp trả / có hợp đồng kế).
- Mỗi phòng: tối đa 1 hợp đồng thuê đang hiệu lực và 1 hợp đồng cọc chờ. Không cho thuê theo giường. Ngày vào dự kiến của cọc chờ không trước ngày kết thúc hợp đồng hiện tại (cảnh báo nếu chồng).
- Menu có hai mục: **Cơ sở** (`/facilities`: danh sách toà, chi tiết toà) và **Phòng** (`/rooms`).
- Trang Phòng: lưới ô gom theo toà rồi tầng, lọc cơ sở, đếm "N phòng trống / M phòng". Có khách = xanh (`occupied`, `ending_soon` có viền cảnh báo, `occupied_with_next`); không có khách = xám (`vacant`, `deposited` kèm nhãn "Đã cọc"). Hover ô có khách: tên khách, giá thuê, cọc đã nhận, ngày hết hạn (tên/ngày cần `tenants_contracts`; giá/cọc cần `tenants_contracts` hoặc `billing`); ô trống không có hover. Dữ liệu tính theo lô. Tạo phòng, tạo nhanh nhiều phòng (diện tích, giường, tiện ích chung cho cả dải) và sửa phòng đều làm được từ đây và từ chi tiết phòng. Màu `RoomMap` ở chi tiết toà đồng bộ với lưới này.

### 5.2 Khách thuê
- Nước ngoài (họ tên, quốc tịch, passport + ngày hết hạn, loại visa, ngày hết hạn visa), Việt Nam (CCCD, ngày cấp, nơi cấp, ngày sinh, địa chỉ), công ty (tên, mã số thuế, địa chỉ, người đại diện, liên hệ). Chung: điện thoại duy nhất, email, ghi chú, ảnh giấy tờ.
- Hợp đồng có một bên thuê (cá nhân hoặc công ty) và danh sách người ở. Mặc định bên thuê là một người ở, kể cả công ty (mã số thuế thay CCCD); người ở thêm không trùng; đổi bên thuê cập nhật người ở mặc định, giữ người thêm chủ động. Visa nhắc theo từng người ở.

### 5.3 Hợp đồng và phụ lục
- **Hợp đồng cọc**: giữ phòng; tiền cọc giữ chỗ, ngày vào dự kiến, giá thoả thuận. Kết thúc bằng chuyển thành hợp đồng thuê hoặc huỷ (mất/hoàn cọc ghi vào sổ cọc).
- **Hợp đồng thuê**: tạo trực tiếp hoặc từ cọc (kế thừa số đã thực nhận, chỉ ghi khoản mới nếu có thêm). Gồm phòng, bên thuê, người ở, ngày bắt đầu/kết thúc, giá tháng, tiền cọc, kỳ thanh toán, phí dịch vụ, quy tắc tính lẻ ngày, ghi chú, tài sản bàn giao, ảnh đính kèm. Thời hạn = ngày bắt đầu + số tháng (không trừ 1 ngày); **ngày kết thúc là sáng khách dọn đi** (khách ở hết ngày liền trước).
- **Tạo trên một trang**, không nhiều bước (cả tạo mới lẫn chuyển từ cọc). Các mục: phòng và người ở; thời hạn, giá; cọc và đã cọc (đã cọc là khoản thực nhận ghi vào sổ cọc, phần thiếu là khoản chờ thu); phí dịch vụ; thanh toán; ghi chú; biên bản bàn giao (thu gọn/mở, tài sản là thẻ gọn tên + model, menu thao tác dưới thẻ); ảnh đính kèm chung hợp đồng; tóm tắt và nút tạo. Thay đổi tài sản, đồng hồ chỉ có hiệu lực khi tạo thành công. Giữ dữ liệu khi lỗi, chặn gửi trùng, lỗi hiện cạnh trường; ảnh tải lỗi sau khi tạo thì báo rõ ảnh nào và cho tải lại mà không tạo trùng hợp đồng. Không tự tạo hoá đơn khi tạo hoặc ký hợp đồng.
- **Xử lý tài sản khi lập hợp đồng**: chỉ hai lựa chọn: *Di chuyển* (đích là kho hoặc phòng của bất kỳ cơ sở nào user có quyền `assets`; chuyển liên cơ sở đổi `facilityId`, ghi `assetMoves` và nhật ký, cần quyền ở cả hai cơ sở, khoá theo thứ tự cố định) và *Thanh lý*. Không chuyển vào chính phòng đang lập; tài sản đã thanh lý không chuyển được. Màn Tài sản vẫn chuyển trong một cơ sở.
- **Phụ lục**: *gia hạn* (ngày kết thúc mới, có thể đổi giá và phí; đổi cọc sinh dòng thu bổ sung hoặc hoàn chênh trong sổ cọc); *chuyển phòng* (chốt đồng hồ phòng cũ, bàn giao hai phòng, hoá đơn tách theo ngày; điện/nước chuyển liên kết sang đồng hồ cùng loại của phòng mới); *chuyển nhượng* (chuyển hợp đồng cho người khác: người nhận đứng tên và kế thừa, người cũ rời danh sách người ở, giữ PDF cũ đã ký, phụ lục là tài liệu riêng); *thanh lý* (ngày trả phòng, biên bản check-out, hoá đơn thanh lý).
- **Trạng thái ký**: chỉ hiển thị "Chưa ký" / "Đã ký" (DB giữ `draft`/`exported`/`signed`; `draft` và `exported` đều là "Chưa ký"). Xuất Word/PDF không đổi trạng thái; chỉ tải lên bản đã ký mới chuyển "Đã ký". Dùng chung cho hợp đồng cọc.
- **Sửa**: sửa được cả khi đã ký, đã có hoá đơn hoặc cọc; hoá đơn, cọc, thanh toán giữ nguyên để nhân viên tự chỉnh; hợp đồng đã ký cảnh báo và xác nhận. Ghi chú sửa trong hộp thoại "Sửa hợp đồng".
- **Khôi phục một bước**: trước mỗi lần sửa, thanh lý, chuyển nhượng, gia hạn thành công, lưu bản chụp trạng thái trước; khôi phục chỉ quay lại thay đổi gần nhất, có thể khôi phục liên tiếp từng bước, mỗi lần cảnh báo riêng. Người có quyền sửa được khôi phục. Trước khi khôi phục, liệt kê hoá đơn, khoản cọc, thanh toán, phụ lục phát sinh sau thay đổi sẽ bị xoá vĩnh viễn và yêu cầu xác nhận; phụ lục do chính thao tác bị hoàn tác cũng xoá; hoàn tác thanh lý xoá biên bản trả phòng và chỉ số do lần đó tạo; phòng đã có hợp đồng mới thì chặn khôi phục. PDF đã ký giữ nguyên. Nếu dữ liệu đổi giữa lúc xem cảnh báo và xác nhận, kiểm tra lại và xin xác nhận trên danh sách mới. Tệp của bản ghi bị xoá dọn theo cơ chế dọn tệp có sẵn.
- **Xoá**: xoá hẳn, vĩnh viễn, không khôi phục. Chỉ admin hoặc người có quyền `delete_contracts` và quyền cơ sở. Cảnh báo nêu rõ xoá luôn hoá đơn, cọc, thanh toán, phụ lục, biên bản, tệp liên quan; hợp đồng đã ký cảnh báo thêm; làm nhất quán trong một giao dịch, không xoá khách, phòng, tài sản gốc. Dùng hộp xác nhận trong app (không `window.confirm`), bấm một lần là xoá, luôn hiện kết quả hoặc lỗi.
- **Danh sách và chi tiết**: mỗi hợp đồng một hàng; thao tác (sửa, xoá, thanh lý, chuyển nhượng, gia hạn, khôi phục, chuyển phòng) là hàng icon có tooltip tức thì (component tooltip dùng chung), ẩn khi thiếu quyền hoặc không áp dụng. Bấm mã hợp đồng mở popup gần toàn màn hình (thông tin, người ở, phụ lục, bàn giao, hoá đơn, cọc, tài liệu, lịch sử) hoặc trang chi tiết, cùng hàng icon ở góc phải khung đầu. Mỗi thao tác mở popup riêng với cảnh báo hệ quả. Dùng được bằng bàn phím và màn hình hẹp.

### 5.4 Biên bản bàn giao
- Check-in: lấy tài sản đang ở phòng, ghi tình trạng và ảnh, chốt chỉ số đầu, xuất từ mẫu để ký.
- Check-out: đối chiếu với check-in; hư/mất kèm tiền phạt, chốt chỉ số cuối; phạt thành dòng phí phạt trên hoá đơn thanh lý.

### 5.5 Tài chính

**Loại phí, đơn vị, phí của hợp đồng**
- Admin tự tạo đơn vị (người, phòng, xe, kg, lần…) và loại phí (tên, đơn vị, đơn giá mặc định, kiểu: cố định hằng tháng — trả trước; hoặc theo lần/tiêu thụ — trả sau; cách lấy số lượng: nhập tay, theo số người, theo phòng, theo đồng hồ, nhập lượng mỗi kỳ). Cách tính do cấu hình, không suy từ tên.
- **Phí trong Cài đặt chỉ là giá tham khảo.** Phí quyết định là phí trong hợp đồng: mỗi dòng phí chụp tên, đơn vị, cách tính, số lượng, đơn giá vào hợp đồng (`lease_fee_snapshots`); đổi hay lưu trữ loại phí không ảnh hưởng hợp đồng đã tạo. Mọi hợp đồng dùng một mô hình này, không có kiểu tính theo bảng giá cơ sở.
- Phí mặc định đánh dấu theo cơ sở; giá riêng theo toà (`fee_type_prices`, hàm thuần chọn giá toà nếu có, không thì giá chung). Khi lập hợp đồng/phụ lục, giá điền sẵn theo toà của phòng, sửa được. Hợp đồng không chọn dịch vụ nào thì không phát sinh khoản đó (ví dụ không chọn nước thì không tính nước).
- Phí theo người: số lượng = số người ở. Phí theo lần: nhân viên thêm khi phát sinh, gom vào hoá đơn kỳ kế.
- Trong form hợp đồng: chọn phí bằng popup có tìm kiếm không dấu và lọc theo cách tính, kèm nút "+" tạo loại phí mới giống Cài đặt (tạo thật, Cài đặt cập nhật theo); có thể xoá phí mặc định chỉ cho hợp đồng này mà không sửa Cài đặt.

**Hoá đơn tháng**
- Hoá đơn tháng N: tiền phòng + phí cố định kỳ N (trả trước); điện, nước, phí theo lần của tháng N−1 (trả sau). Kỳ mặc định trọn tháng dương lịch; vào/ra giữa tháng tính lẻ ngày (cài đặt chia 30 hoặc chia số ngày thực của tháng, ghi đè được từng hoá đơn) trừ khi chọn "tính full tháng".
- Trả nhiều tháng: sửa tay ngày đầu/cuối kỳ; hệ số = số tháng (có lẻ ngày) × giá tháng, sửa tay được.
- Tạo hàng loạt: chọn cơ sở + kỳ → nháp cho mọi hợp đồng hiệu lực; nhân viên xem, chỉnh, duyệt. Hoá đơn đầu của hợp đồng mới tạo lúc nhân viên chọn, gồm cọc còn thiếu + tiền phòng lẻ ngày. Ngày tạo hoá đơn dự kiến theo cơ sở chỉ dùng cho nhắc việc (không còn ô sửa trên giao diện).
- Trạng thái: nháp → đã duyệt → đã thu một phần / đủ. Duyệt, xoá, điều chỉnh được; thay đổi sau duyệt ghi nhật ký; hoá đơn có khoản thu phải gỡ khoản thu trước khi xoá. Hệ thống không tự sửa hoá đơn đã duyệt khi giá/hợp đồng đổi.
- Thay đổi giữa kỳ sau khi hoá đơn kỳ đã duyệt: phần chênh sinh thành dòng điều chỉnh ở hoá đơn kỳ kế, ghi lý do và khoảng ngày (hoặc sửa thẳng hoá đơn hiện tại). Đã trả trước nhiều tháng thì giữ giá cũ cho phần đã trả.
- Hạn thanh toán: *ngày X tháng sau* hoặc *N ngày sau ngày duyệt*; mặc định ở cài đặt, ghi đè theo hợp đồng, sửa tay theo hoá đơn. Quá hạn → nhắc việc.
- Thu tiền: ngày, số tiền, hình thức, người thu; trả một phần được; công nợ = phát hành − đã thu.

**Sổ cọc**: thu cọc, thu bổ sung, khấu trừ, hoàn cọc, mất cọc; số dư = tổng.

**Hoá đơn thanh lý**: tiền phòng lẻ đến ngày trả (hoặc phần hoàn nếu trả dư), điện nước đến ngày trả (tính trên mọi phòng của hợp đồng, đồng hồ gắn với dòng phí), phí theo lần chưa tính, phạt từ check-out, nợ cũ, trừ số dư cọc → hoàn khách hoặc thu thêm. Trả phòng trước hạn: nhân viên chọn mất cọc toàn bộ / một phần / không; hệ thống không tự áp quy tắc báo trước.

**Tiền phòng và ngày kết thúc**: hiện tiền phòng còn tính đến hết ngày kết thúc hợp đồng; chưa đổi theo "ngày kết thúc là sáng khách dọn đi" (chờ quyết định).

### 5.6 Điện nước (một kiểu cho cả web)
- Mỗi phòng luôn có hai đồng hồ mặc định **Điện** và **Nước**, tạo cùng phòng (chỉ số đầu 0, ngày lắp là ngày tạo phòng), không xoá được; chỉ thay (có lịch sử) hoặc thêm đồng hồ khác. Migration bổ sung cho phòng cũ không tạo trùng. Không có nút xoá đồng hồ.
- Mỗi đồng hồ có tên (bắt buộc với đồng hồ thêm, không trùng trong phòng không phân biệt hoa thường) và mã tự sinh duy nhất `DH-<cơ sở>-<phòng>-<nn>` (đếm cả đồng hồ đã gỡ). Thay đồng hồ giữ tên, nhận mã kế tiếp.
- Điện, nước là phí của hợp đồng tính theo đồng hồ (`quantity_source = 'meter'`): mỗi dòng phí gắn **đúng một** đồng hồ của đúng phòng, qua `lease_fee_meters`; đồng hồ đã gắn dòng phí của hợp đồng đang chạy không dùng cho phí khác; danh sách chọn chỉ hiện đồng hồ của phòng đó; Điện/Nước tự điền đồng hồ tương ứng còn trống. Nhập chỉ số tại ngày bắt đầu (`handover`, không nhỏ hơn chỉ số gần nhất). Đơn giá lấy từ hợp đồng.
- Mức dùng tính bằng hàm thuần `meterFeeUsage` (`src/domain/meter-fee-usage.ts`) theo chuỗi đồng hồ của phòng, cắt theo ngày bắt đầu hợp đồng, bỏ đoạn rỗng; dùng chung cho hoá đơn tháng, kỳ ký, thanh lý. Thay đồng hồ giữa kỳ: mức dùng = (cuối đồng hồ cũ − đầu kỳ) + (chỉ số mới − đầu đồng hồ mới); dòng phí chuyển sang đồng hồ mới trong cùng giao dịch.
- Thay đồng hồ không đọc được chỉ số cuối: chốt bằng chỉ số ước tính + ghi chú bắt buộc (`final_reading_estimated`, `estimate_note`). Gợi ý = chỉ số gần nhất + trung bình 3 tháng (hàm thuần). Mức dùng đoạn cũ = cuối ước tính − chỉ số gần nhất, tính tiền như thường; nhãn "(ước tính)" ở bảng đồng hồ, bảng theo tháng và dòng hoá đơn.
- Hoá đơn kỳ ký vẫn có dòng điện với chỉ số đầu = cuối, tiền 0 (`Điện (chỉ số v → v)`).
- Trang `/meters` (menu "Điện nước", quyền `meters`) có ba tab: **Ghi chỉ số** (theo toà, phòng, tháng; lưới theo từng đồng hồ của phòng; dấu "Có người ở"/"Trống"; tiến độ đếm theo phòng có người ở; lỗi cảnh báo khi chỉ số giảm hoặc tiêu thụ bất thường), **Theo tháng** (chỉ xem theo toà, mặc định 6 tháng, mỗi phòng một dòng, ô hiện chỉ số + mức dùng, đổi đồng hồ giữa tháng hiện hai chỉ số, ô trống "—"), **Đồng hồ** (danh sách, lịch sử, thêm đồng hồ).
- Không bao giờ để: một đồng hồ gắn hai dòng phí của hai hợp đồng đang chạy; hoá đơn lấy đơn giá điện nước từ cài đặt; dòng phí trỏ vào đồng hồ đã gỡ.
- Dữ liệu hợp đồng/đồng hồ cũ (dữ liệu thử) đã dọn bằng `scripts/reset-contract-data.ts`; không giữ hay chuyển.

### 5.7 Tài sản và kho
- Tài sản: mã, tên, loại, giá trị (gợi ý tiền phạt), tình trạng, vị trí = phòng, khu chung của toà, hoặc kho; có tài sản theo món và vật tư theo số lượng. Chuyển nhanh nhiều món, mỗi lần ghi lịch sử (từ, đến, ai, lúc nào, lý do). Thanh lý/báo hỏng.
- "Chưa xếp" = thuộc toà nhưng chưa gán phòng/kho. Mọi tài sản thuộc một toà.

### 5.8 Sự cố và sửa chữa
- Phiếu: vị trí (phòng / khu chung / tài sản), mô tả, ảnh, ưu tiên, người báo/xử lý, trạng thái (mới → đang xử lý → xong/huỷ), chi phí. Lỗi do khách → phí phạt trên hoá đơn kỳ tới. Gắn tài sản: lịch sử sửa chữa hiện ở trang tài sản.

### 5.9 Nhắc việc (trang chủ)
Lọc theo cơ sở và quyền của người dùng: hoá đơn quá hạn; visa sắp hết (30 ngày, cấu hình); hợp đồng sắp hết hạn (30 ngày, cấu hình) theo ngày khách dọn đi ("dọn đi sáng dd/mm/yyyy", "dọn đi sáng nay", nghiêm trọng khi `endDate <= hôm nay`, "quá hạn N ngày"); hợp đồng/phụ lục chưa ký; kỳ chưa ghi chỉ số, hoá đơn chưa tạo; sự cố đang mở; cọc bổ sung/hoàn đang chờ; ảnh sắp bị xoá (7 ngày trước).

## 6. Giấy tờ và mẫu

- **Hoá đơn tháng, hoá đơn thanh lý, phiếu thu** dựng PDF trong app bằng `@react-pdf/renderer` (font Be Vietnam Pro TTF trong repo); PNG vẽ từ chính PDF (pdf.js + `@napi-rs/canvas`). Mặc định xuất PDF; trang chi tiết có **Tải PDF** và **Tải ảnh** (phiếu thu chỉ PDF).
- Bố cục (phong cách Bạc hà): đầu trang logo, cơ sở, "Hoá đơn tháng MM/YYYY", mã, ngày lập, vạch xanh ngọc; ô thông tin khách/phòng/kỳ/SĐT; bảng Khoản / Số lượng / Đơn giá / Thành tiền (điện nước ghi chỉ số cũ → mới); tổng in to + số tiền bằng chữ; khối thanh toán (QR trái; ngân hàng, số tài khoản, chủ tài khoản, nội dung, hạn); chân trang.
- **QR VietQR** (EMVCo/NAPAS 247) do hàm thuần `src/domain/vietqr.ts` dựng, có test CRC16-CCITT, không gọi dịch vụ ngoài. Số tiền = còn phải trả; nội dung = mã hoá đơn. Đã trả đủ: không QR, hiện "Đã thanh toán". Thanh lý tổng âm: thay QR bằng "Số tiền hoàn cho khách: X ₫". Chưa cấu hình tài khoản: vẫn xuất PDF, không khối QR. Phiếu thu không QR.
- **Tài khoản nhận tiền**: một tài khoản chung (`app_settings.bank_account`: BIN + tên ngân hàng, số tài khoản, chủ tài khoản); mỗi cơ sở có thể đặt riêng (`facilities.bank_account`), thay cho chung. Chọn ngân hàng từ danh sách BIN lưu tĩnh ở `src/domain`. Quyền `settings`.
- **Hợp đồng, phụ lục, biên bản**: mẫu HTML soạn bằng TipTap ngay trong app (mỗi loại nhiều mẫu, có mặc định, kiểu trình bày), chỗ điền `[tên_trường]`, có trang tra cứu trường, định dạng sẵn tiền, ngày, số tiền bằng chữ. Xuất PDF dựng trong app, Word bằng `docx`. Mẫu Word cũ đã bỏ. Bản xuất lưu kèm hợp đồng.
- **Bản xem mẫu**: mẫu hoá đơn, hợp đồng, biên bản lưu sẵn PDF xem (`preview_pdf`, `preview_version`), dựng khi lưu mẫu và dựng lại khi hằng số phiên bản bộ dựng đổi, bằng dữ liệu mẫu cố định. Danh sách chỉ gửi bản xem của mẫu mặc định hoặc mẫu duy nhất; mẫu khác tải khi bấm mở (`getTemplatePreviewAction`, `getInvoiceTemplatePreviewAction`). Từ 2 mẫu trở lên là toggle (`TOGGLE_FROM = 2`) với mẫu mặc định mở sẵn. Mẫu cũ dựng theo khối vẫn có nhãn "Mẫu cũ, nên soạn lại".

## 7. Nhập dữ liệu từ Excel

- Nhập: cơ sở/phòng, khách, hợp đồng đang hiệu lực, số dư cọc, công nợ đầu kỳ, chỉ số gần nhất, tài sản. Luồng: tải file → ghép cột ↔ trường → xem trước, báo lỗi từng dòng → xác nhận. Chạy lại không tạo trùng (khoá theo mã phòng, SĐT/giấy tờ, mã hợp đồng). Phòng nhập vào đi qua cùng đường tạo đồng hồ mặc định, không tạo trùng.

## 8. Giao diện

- Hướng "Bạc hà": token màu trong `globals.css` (nền `#F6F8F7`, xanh ngọc chủ đạo `#0E9F6E`, có bản tối), Be Vietnam Pro, menu trắng có icon lucide và thu gọn trên điện thoại. Chi tiết quy tắc danh sách, bộ lọc, bảng, hộp thoại, ô tiền ở mục Front-end design của `CLAUDE.md`.
- Mọi trang danh sách hiện dữ liệu của mọi toà user được xem, lọc theo Toà ngay trên bảng (nhiều toà, lưu trong URL `?toa=`, cột Toà khi xem nhiều toà). Không còn ô chọn cơ sở ở thanh trên.
- Lỗi: `error.tsx`, `global-error.tsx`, `not-found.tsx` viết tiếng Việt, có nút thử lại, không lộ stack trace (`digest` chỉ vào log); khung chờ `loading.tsx` cho nhóm trang chính. Có e2e mở mọi trang không gặp lỗi.
- Hiệu năng: `experimental.staleTimes` (3600 giây) giữ trang đã xem; menu trái `Link prefetch`; bảng dùng chung `src/components/list/` lọc, tìm, phân trang tại trình duyệt, mặc định 15 dòng (15/30/50/100, nhớ theo bảng trong `localStorage`, bọc try/catch); bộ lọc đổi URL bằng `history.replaceState`; sửa dữ liệu thì `revalidatePath`/`router.refresh()` làm mới. Không tự đồng bộ thay đổi của người khác (F5). Trang Nhật ký vẫn lọc qua server. Không có nút "Làm mới".
- **Cài đặt**: tab Chung, Phí dịch vụ, Tiện ích, Tài khoản nhận tiền (không còn tab Cơ sở và tab Đơn giá điện nước). Phí dịch vụ: mỗi loại phí một thẻ (đơn vị, đơn giá, kiểu, cách lấy số lượng; dòng tóm tắt "Áp dụng N toà · M giá riêng" và nút "Áp dụng theo toà" mở popup tick + giá riêng, ô tìm toà từ 8 toà), "+ Thêm loại phí" dùng chung form với sửa, tạo đơn vị ngay trong form (`newUnitName` dùng lại đơn vị trùng tên), loại phí lưu trữ xem và khôi phục được (`restoreFeeType`) không mất mặc định hay giá riêng, dải "Đơn vị tính" cuối trang. Điện và Nước là hai loại phí `meter` có sẵn, giá mặc định tham khảo.
- "Thêm mới" luôn hiện popup (xem quy ước route chặn `@modal` ở `CLAUDE.md`).

## 9. Kiến trúc

- Next.js 16 App Router + React 19 + TypeScript, Tailwind v4 + shadcn/ui (`@base-ui/react`), react-hook-form + zod, TanStack Query. Supabase (Postgres, Auth email + mật khẩu; số điện thoại cho khách về sau). Drizzle ORM. Vercel cho app. PDF/Word dựng trong app, không dùng dịch vụ ngoài (Gotenberg đã bỏ).
- Logic tính tiền (lẻ ngày, hệ số, thay đồng hồ, đổi giá, thanh lý, VietQR) ở `src/domain` thuần, có test đầy đủ.
- **Ảnh** (bàn giao, sự cố, giấy tờ): nén ở trình duyệt (cạnh dài ≤ ~1600px, WebP/JPEG ~75%, thumbnail ~300px), ~150–300KB/ảnh.
- **Hạ tầng ban đầu: gói miễn phí, cần thì nâng.** Supabase Free cho Postgres + Auth; file (ảnh, bản xuất, bản scan đã ký) ở Cloudflare R2 (10GB miễn phí), URL ký có thời hạn, qua lớp lưu trữ chung (adapter, `STORAGE_DRIVER`) để đổi nhà cung cấp không sửa nghiệp vụ.
- **Thời hạn lưu:** ảnh bàn giao của hợp đồng chỉ giữ 30 ngày sau ngày thanh lý rồi tự xoá bằng tác vụ chạy hằng ngày; ảnh giấy tờ tuỳ thân xoá cùng lúc; ảnh sự cố giữ lại; biên bản đã xuất và dữ liệu văn bản giữ. Nút "Giữ lại" trên hợp đồng để hoãn khi tranh chấp; trước 7 ngày bảng nhắc việc liệt kê hợp đồng sắp bị xoá ảnh.
- **Sao lưu:** GitHub Actions mỗi đêm `pg_dump` toàn bộ CSDL → nén → tải lên thư mục Google Drive (rclone, tài khoản dịch vụ), giữ 30 bản; chỉ sao lưu CSDL, không sao lưu file R2; báo lỗi qua email GitHub Actions; có hướng dẫn khôi phục và chạy thử một lần trước khi dùng thật.

## 10. Lộ trình

Supabase từ đầu, dữ liệu giả nạp bằng `db:seed`. Năm đợt, mỗi đợt kết thúc bằng bản thử + checklist để người dùng duyệt:

1. Nền tảng: đăng nhập, phân quyền, người dùng, cơ sở/phòng, cài đặt, loại phí, lưu file, khách thuê, nhắc visa.
2. Mẫu giấy tờ, hợp đồng cọc/thuê, tài sản & kho, điện nước, bàn giao.
3. Tài chính: tính tiền, phí phát sinh, sổ cọc, hoá đơn, thu tiền, phụ lục.
4. Sự cố, nhắc việc đầy đủ, nhập Excel, test toàn hệ thống.
5. Chạy thật: chuyển file sang R2 + tự xoá ảnh, sao lưu Drive, xoá dữ liệu giả, nhập dữ liệu thật.

Kế hoạch chi tiết: `docs/superpowers/plans/README.md`.

## 11. Còn mở

- Tiền phòng có dừng ở ngày trước ngày kết thúc hay không.
- Phí thêm giữa hợp đồng bill cả tháng trước; `replaceMeter` cũng chuyển liên kết hợp đồng đã kết thúc; phụ lục thiếu `leaseFeeId`.
- Đánh số hợp đồng/hoá đơn đang theo tiền tố cơ sở + loại + năm + số thứ tự (ví dụ `1-HĐ-2026-0001`).
