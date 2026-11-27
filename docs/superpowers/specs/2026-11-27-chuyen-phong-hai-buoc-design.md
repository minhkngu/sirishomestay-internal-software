# Chuyển phòng hai bước và ví khách

Trạng thái: đã duyệt để lập kế hoạch (2026-11-27, viết lại lần 2). Chưa có code.

## 1. Ý định và lý do

Hôm nay "chuyển phòng" là phụ lục `transfer` giữ nguyên một hợp đồng và chỉ đổi `leases.roomId`. Hướng mới: chuyển phòng là **thanh lý hợp đồng phòng cũ rồi tạo hợp đồng mới cho phòng mới**, trong một popup. Lịch sử khách có hai hợp đồng nối nhau, mỗi cái một mã, một giá, một bộ hoá đơn.

Tiền khách trả dư (hoá đơn 10 triệu, khách đưa 15 triệu) hiện bị chặn. Hướng mới: phần dư vào **ví của khách**; thu tiền có lựa chọn dùng ví; thanh lý tự gạch ví; kết quả cuối của thanh lý (nợ hoặc số dư) cộng dồn sang hoá đơn của hợp đồng mới.

Hai phần làm theo thứ tự, phát hành riêng được: (1) ví khách và thu vượt; (2) popup chuyển phòng.

## 2. Mục tiêu, không phải mục tiêu, phản mục tiêu

Mục tiêu:
- Nhân viên chuyển phòng bằng một popup, ra hai hợp đồng đúng, số tiền chuyển hiện rõ trước khi duyệt.
- Mọi số tiền khách trả dư đều không mất và không bị đếm hai lần.
- Sửa hoá đơn thanh lý nháp thì kết quả tự cập nhật.

Không phải mục tiêu:
- Không nạp trước vào ví. Ví chỉ có tiền từ thu vượt.
- Không chuyển dữ liệu của phụ lục `transfer` cũ (vẫn đọc được như lịch sử).
- Không chuyển phòng giữa hai cơ sở.
- Không khôi phục được sau khi hoá đơn đầu tiên của hợp đồng phòng mới đã có thanh toán (xem 5.3, "Khi có lỗi"); lúc đó sửa tay.
- Không đổi tài sản, không đổi cách tính điện nước.

Phản mục tiêu:
- Tiền thật khách đưa không hiện trong sổ quỹ, hoặc hiện hai lần.
- Số dư hoặc nợ ở hợp đồng mới lệch với hoá đơn thanh lý đã duyệt.
- Giao dịch chuyển phòng dừng nửa chừng mà không ai biết.

## 3. Hiện trạng (đã đọc code)

- `createTransfer` (`src/modules/leasing/server/addenda/service.ts`) giữ một hợp đồng, đổi `roomId`, tạo phụ lục `transfer`.
- Thanh lý chạy hai pha: `createTermination` tạo phụ lục `termination` và hoá đơn thanh lý **nháp**, chốt chỉ số cuối, biên bản check-out, phạt. Hợp đồng thành `ended` ngay lúc tạo thanh lý (`applyTerminationClosure`); sổ cọc chỉ ghi `deduct`/`forfeit` khi **duyệt** hoá đơn thanh lý (`finalizeTermination`, `addenda/finalize.ts`).
- `buildTerminationInvoice` (`leasing/domain/liquidation.ts`) dựng hoá đơn thanh lý: hoàn tiền phòng và phí cố định đã trả trước theo ngày, tiền phòng còn thiếu, phí đồng hồ, khoản phát sinh, điều chỉnh chờ, phạt, nợ cũ, dòng `deposit_offset` cho cọc. Tổng âm là hoàn cho khách.
- `LeaseStatus` chỉ có `active | ended`.
- **Thu vượt đang bị chặn**: `recordLeasePayment` (`invoices/service.ts`) ném "Số tiền vượt tổng dư nợ". `payments` luôn gắn một `invoiceId`.
- `pending_adjustments` (điều chỉnh chờ): `leaseId`, `description`, `amount` (âm là giảm), `sourceKey` duy nhất, `invoiceId` (đã dùng ở hoá đơn nào). Hoá đơn kế tiếp và hoá đơn thanh lý đã hút các dòng chưa dùng.
- `cashbook` đọc trực tiếp `payments` và `deposit_entries` để tính thu.
- `unapproveInvoice` chỉ đưa hoá đơn về nháp, không mở lại hợp đồng và không đảo sổ cọc.
- Mỗi phòng luôn có sẵn đồng hồ điện, nước.

## 4. Các phương án đã cân nhắc

- **A. Ví theo khách + một popup chuyển phòng (ĐÃ CHỌN).** Số dư ở khách nên đổi hợp đồng không cần chuyển gì; kết quả thanh lý cộng dồn sang hợp đồng mới bằng cơ chế điều chỉnh chờ sẵn có.
- B. Số dư gắn với hợp đồng, kèm thao tác "Chuyển số dư", khoá tài chính hợp đồng mới, khôi phục cuốn theo. Đã thiết kế ở bản trước, loại vì phức tạp hơn nhiều mà không thêm giá trị.
- C. Giữ phụ lục chuyển phòng cũ. Trái với hướng đã chọn.

## 5. Thiết kế

### 5.0 Quy ước ngày trả phòng (sửa toàn bộ thanh lý)

- Kỳ hạn hợp đồng và kỳ hoá đơn: khoảng ngày tính **cả hai đầu**, ngày kết thúc là ngày ở cuối cùng (hợp đồng đến 31/12 thì khách đi trưa 1/1). **Giữ nguyên.**
- Ngày thanh lý là **ngày khách đi** (trưa). Đêm cuối là hôm trước, nên **tiền tính tới `ngày thanh lý − 1`** và phần hoàn trả trước bắt đầu từ chính ngày thanh lý. Hiện code tính cả ngày thanh lý và hoàn từ hôm sau, lệch một ngày; sửa ở **mọi** hoá đơn thanh lý, không chỉ chuyển phòng.
- Phạm vi sửa: `buildTerminationInvoice` (`leasing/domain/liquidation.ts`: tiền phòng còn thiếu, hoàn tiền phòng và phí cố định, phí đồng hồ tới ngày trả, tiền thuê lẻ), chỗ ghi `endDate`/`dayAfterEnd` liên quan trong `addenda/service.ts` và `finalize.ts`, và nhãn trên hoá đơn ("trả phòng ngày …"). Không đổi `prorateFraction`.
- Test cần cập nhật: `tests/unit/domain/billing.test.ts`, `tests/integration/addenda.test.ts`, `contract-restore.test.ts`, `contract-history.test.ts`.
- Hoá đơn thanh lý đã duyệt trước đây không tính lại.

### 5.1 Ví khách

- Ví gắn với người thuê chính của hợp đồng (`leases.tenantId`) và **tách theo cơ sở**. Người ở cùng không có ví. Công ty thuê thì ví của công ty.
- Ví là sổ biến động có dấu, bảng mới (ví dụ `tenant_wallet_entries`): người thuê, cơ sở, số tiền (dương là cộng, âm là dùng hoặc hoàn), loại (`overpay`, `use_invoice`, `use_termination`, `carry_surplus`), tham chiếu hoá đơn hoặc khoản thu, ngày, ghi chú, `sourceKey` duy nhất để chống ghi trùng. Số dư là tổng.
- Chi tiết khách và hợp đồng hiện số dư ví và lịch sử biến động. Mọi biến động có nhật ký kiểm toán.

### 5.2 Thu tiền và thu vượt

- Thu theo hợp đồng bỏ lệnh chặn vượt nợ. **Không hỏi lại**: phần vượt tự vào ví. Ví dụ hoá đơn 10 triệu, khách đưa 15 triệu: khoản thu 10 triệu cho hoá đơn, 5 triệu vào ví (`overpay`).
- Form thu hiện "Dùng số dư ví: X" khi khách có ví. Nhân viên tự chọn số tiền dùng, không vượt số dư ví và không vượt nợ. Phần dùng ghi như khoản thu của hoá đơn, `method = 'wallet'`, kèm biến động ví âm cùng một giao dịch.
- **Sổ quỹ chỉ tính tiền thật.** Tiền dư tính vào thu đúng một lần, vào ngày khách đưa (biến động `overpay`). Khoản thu `method = 'wallet'` và biến động dùng ví không tính. `cashbook` phải được sửa để đọc đúng.
- Không còn cơ chế tự trừ số dư vào hoá đơn kế tiếp: nhân viên chọn dùng ví khi thu.

### 5.3 Popup "Chuyển phòng"

**Điểm vào.** Nút "Chuyển phòng" ở hợp đồng đang hiệu lực.

**Form.** Phòng mới (cùng cơ sở), ngày chuyển, điều khoản hợp đồng mới, chỉ số cuối phòng cũ và chỉ số đầu phòng mới, biên bản check-out, tuỳ chọn hoàn tiền phòng như thanh lý (mặc định hoàn theo ngày), phạt hoặc mất cọc nếu có. Cạnh đó là bảng xem trước kết quả thanh lý.

**Ngày.** Hợp đồng cũ kết thúc đúng **ngày chuyển** và hợp đồng mới bắt đầu cũng **ngày chuyển**. Vì hệ thống đếm ngày tính cả hai đầu, **ngày chuyển thuộc phòng mới**: hoá đơn thanh lý ở chế độ chuyển phòng tính tiền phòng và phí cố định của phòng cũ đến hết `ngày chuyển − 1` và hoàn theo ngày từ ngày chuyển; hợp đồng mới tính từ ngày chuyển. Ví dụ chuyển ngày 16: phòng cũ tính đến 15, phòng mới tính từ 16. Chỉ số điện nước chốt vào ngày chuyển. Cho phép ngày quá khứ và tương lai như thanh lý hiện nay (chỉ kiểm là ngày hợp lệ và sau ngày bắt đầu hợp đồng cũ).

**Sao chép sang hợp đồng mới.** Người thuê chính, người ở cùng, các dòng phí, mẫu hợp đồng. Giá phòng theo phòng mới. Phí tính theo đồng hồ gắn lại vào đồng hồ của phòng mới, đơn giá giữ theo hợp đồng cũ. Mã hợp đồng cấp mới.

**Khi bấm (một giao dịch):**
1. Tạo hợp đồng mới (`active`), có liên kết `transferFromLeaseId`. **Không tự tạo hoá đơn đầu** cho hợp đồng mới khi chuyển phòng; nhân viên tạo hoá đơn sau như thường (tính lẻ từ ngày chuyển).
2. Chạy luồng thanh lý hiện có cho hợp đồng cũ (`createTermination`): ra hoá đơn thanh lý **nháp**, ở chế độ chuyển phòng.
3. Lỗi ở bất kỳ bước nào thì huỷ cả giao dịch, không có gì thay đổi.
4. Việc ngoài cơ sở dữ liệu (sinh PDF biên bản, lưu file) chạy sau khi giao dịch xong; lỗi ở đây không hoàn tác chuyển phòng.

**Hoá đơn thanh lý ở chế độ chuyển phòng.**
- Có đủ các dòng thanh lý hiện có, cọc cũ đã nằm trong đó (`deposit_offset`).
- Thêm dòng giảm "Số dư ví" bằng **toàn bộ** số dư ví của khách (ví vào hoá đơn thanh lý như cọc; thanh lý thường thì thành tiền hoàn). Sửa hoá đơn nháp thì số tự đổi; ví chỉ bị trừ thật khi duyệt, và sau đó bằng 0.
- Gọi tổng cuối cùng là `T`. `T > 0`: khách còn nợ. `T < 0`: còn số dư cho khách.
- Hoá đơn hiện dòng cuối "Chuyển sang hợp đồng <mã mới>" bằng `−T`, để số phải trả của hoá đơn về 0 và **không phát sinh khoản hoàn tiền mặt** ở chế độ chuyển phòng.

**Khi duyệt hoá đơn thanh lý (cùng một giao dịch).**
1. `finalizeTermination` chạy như hiện nay: ghi sổ cọc cũ (hợp đồng cũ đã `ended` từ lúc tạo thanh lý).
2. Trừ ví thật bằng biến động `use_termination` (nếu có dòng giảm ví).
3. Ghi một điều chỉnh chờ cho hợp đồng **mới**: `amount = T` (dương là nợ, âm là số dư), `sourceKey = transfer:<mã chuyển>`, mô tả "Chuyển từ hợp đồng <mã cũ>". Hoá đơn kế tiếp của hợp đồng mới hút dòng này bằng cơ chế sẵn có. Không cần khoá tài chính: dòng này chờ ở hợp đồng mới và vào hoá đơn đầu khi nhân viên tạo.
4. Ghi khoản "chuyển sang hợp đồng mới" để hoá đơn thanh lý đóng, không ghi tiền thu. Mọi bút toán có `sourceKey` theo mã chuyển nên chạy lại không ghi trùng.

**Hoá đơn đầu của hợp đồng mới.** Hút dòng chuyển `T` như điều chỉnh chờ.
- Hợp đồng mới bắt đầu với ví khách bằng 0 (thanh lý đã hút hết ví).
- `T > 0`: hoá đơn có dòng "Nợ chuyển từ <mã cũ>".
- `T < 0`: hoá đơn có dòng giảm "Số dư chuyển từ <mã cũ>". Nếu số dư lớn hơn tổng hoá đơn thì hoá đơn về 0 và **phần dư vào ví** khách (biến động `carry_surplus`, `sourceKey` theo hoá đơn), không ra tổng âm và không hoàn tiền mặt. Biến động này gắn với hoá đơn; khôi phục chuyển phòng xoá nó cùng hoá đơn.

**Cọc.** Cọc cũ đã nằm trong `T`. Cọc của hợp đồng mới thu theo cách thường, không tự lấp. Số dư mang sang chỉ trừ vào hoá đơn.

**Đồng hồ, tài sản.** Phòng luôn có đồng hồ nên không có kiểm tra chặn thiếu đồng hồ. Chốt chỉ số cuối phòng cũ vào ngày kết thúc, ghi chỉ số đầu phòng mới vào ngày bắt đầu. Tài sản không đổi: hợp đồng cũ làm biên bản check-out, hợp đồng mới tạo biên bản check-in từ tài sản phòng mới.

**Khi có lỗi.**
- Trước khi duyệt: sửa hoá đơn thanh lý nháp, số tự cập nhật; hoặc "Huỷ chuyển phòng": khôi phục thanh lý và xoá hợp đồng mới bằng `deleteContract` (có xác nhận), chỉ khi hợp đồng mới chưa có hoá đơn duyệt hay thu tiền.
- Sau khi duyệt: dùng **khôi phục** (`restore.ts`) của hợp đồng cũ, mở rộng để cuốn theo hợp đồng mới. Khôi phục đưa hợp đồng cũ về `active`, đảo sổ cọc cũ, đảo biến động ví `use_termination`, xoá điều chỉnh chờ `transfer:<mã>`, **xoá hoá đơn thanh lý** cùng phụ lục thanh lý (làm lại thì tạo thanh lý mới), và xoá hợp đồng mới cùng các hoá đơn của nó.
- **Chặn khôi phục** chỉ khi **hoá đơn đầu tiên được tạo sau chuyển phòng** (hoá đơn hút số dư hoặc nợ `T`) **đã có thanh toán**, kể cả phần trả bằng ví; báo rõ lý do. Chưa có hoá đơn, hoặc hoá đơn đó chưa thanh toán (nháp hay đã duyệt) thì không chặn: khôi phục xoá các hoá đơn của hợp đồng mới cùng hợp đồng mới.
- Nút "Bỏ duyệt" bị **chặn** với hoá đơn thanh lý thuộc chuyển phòng, báo "dùng Khôi phục". Lý do: `unapproveInvoice` chỉ đưa hoá đơn về nháp, không mở lại hợp đồng hay đảo sổ cọc.

**Bỏ phụ lục chuyển phòng.** Bỏ giao diện tạo phụ lục `transfer`; phụ lục đã tạo vẫn đọc được. Xoá `createTransfer` nếu không còn nơi gọi khác.

### 5.4 Quyền, nhật ký, ranh giới module

- Tất cả trong module `leasing` (tầng 4); sổ quỹ đọc ví qua cổng công khai của leasing.
- Dùng quyền hiện có (`tenants_contracts`, `billing`); chuyển phòng yêu cầu đủ quyền thanh lý và tạo hợp đồng.
- Mọi biến động ví, điều chỉnh chờ, huỷ có nhật ký kiểm toán với trạng thái trước và sau.
- Cập nhật `docs/architecture.md` (ví khách, thu vượt, chuyển phòng).

### 5.5 Kiểm thử cần có

Cập nhật trong `tests/`, chạy khi chuẩn bị PR:
- Unit: tính `T` (có ví, có cọc, mất cọc, hoàn tiền phòng, nợ, số dư).
- Integration (PGlite): thu vượt tạo đúng một biến động ví và tiền thật hiện một lần ở sổ quỹ; dùng ví ghi `method = wallet`, không vào sổ quỹ; chuyển phòng trọn vẹn (tạo, sửa nháp, duyệt, kiểm hai hợp đồng); `T` dương và `T` âm; lỗi giữa giao dịch không để lại gì; chặn bỏ duyệt; huỷ trước khi duyệt.

## 6. Việc để người dựng quyết

- Tên bảng và cột (ví, mã chuyển, `transferFromLeaseId`), thứ tự migration.
- Cách `cashbook` đọc `overpay` và loại `wallet`.
- Bố cục form, bảng xem trước, khối ví ở chi tiết khách theo `docs/front-end-design.md`.
- Các điều kiện chặn thanh lý hiện tại hiện ngay trong form chuyển phòng ở bản xem trước.

## 7. Quyết định do tôi tự đặt, bạn chưa xác nhận hết

- Ví tách theo cơ sở; chỉ chuyển phòng trong cùng một cơ sở.
- Ví gắn với người thuê chính, không có ví cho người ở cùng.
- Duyệt thanh lý không đòi khách đã trả đủ; nợ `T` đi sang hợp đồng mới.
- Khôi phục sau duyệt chỉ chặn khi hoá đơn đầu tiên của hợp đồng mới đã có thanh toán.
