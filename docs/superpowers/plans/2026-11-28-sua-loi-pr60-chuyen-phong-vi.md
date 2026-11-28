# Sửa lỗi PR #60: chuyển phòng hai bước và ví khách

Nguồn: review PR #60 (nhánh `claude/superpowers-brainstorming-eb33f4`), 2026-11-28. Viết lại lần 2, theo các quyết định của chủ dự án.
Spec gốc: `docs/superpowers/specs/2026-11-27-chuyen-phong-hai-buoc-design.md` (phải sửa theo file này; xem mục "Sửa spec, tài liệu").
Test vòng đời khách: `tests/integration/customer-lifecycle.test.ts` (chưa chạy; số liệu phải đổi theo mục "Số liệu vòng đời khách mới").

Mức ưu tiên:
- **A**: làm sai tiền của khách hoặc sổ quỹ, sửa trước khi merge.
- **B**: lệch thiết kế hoặc dữ liệu.
- **C**: dọn code, không đổi kết quả.
- **D**: quyết định mới về ví.

---

## Bảng duyệt

Ở cột **Quyết định**, `Đề xuất` là chờ chủ dự án chốt; ghi `OK`, `Bỏ`, `Hoãn` hoặc phương án khác. **Trạng thái**: `Chờ` → `Đang sửa` → `Xong`.

| # | Vấn đề (lời thường) | Hướng giải quyết | Quyết định | Trạng thái |
|---|---|---|---|---|
| A1 | Chuyển phòng lúc còn nợ thì nợ cũ có thể bị đòi hai lần | Chặn chuyển phòng khi hợp đồng cũ còn hoá đơn nháp hoặc còn nợ; popup báo ngay khi mở | Đã chọn | Xong |
| A2 | Thanh lý thường không đóng hoá đơn cũ, nên thu nợ được hai lần | Lúc duyệt thanh lý, tính lại dòng "Nợ cũ" theo nợ thật rồi đóng các hoá đơn cũ (khoản "Gộp vào thanh lý"); bỏ duyệt thì mở lại | Đề xuất | Xong |
| A3 | Huỷ chuyển phòng làm mất tiền khách đã trả ở hợp đồng mới | Tiền thật đã thu ở hợp đồng mới chuyển vào ví khách (giữ ngày thu gốc); là một trường hợp của B2 | Đã chọn (PA 3) | Xong |
| A4 | Số dư mang sang lớn hơn hoá đơn đầu thì hoá đơn ra số âm | Duyệt hoá đơn đó thì đưa về 0, phần dư vào ví (`carry_surplus`) | Đề xuất | Xong |
| A5 | Thanh lý tính dư ngày trả phòng | Mọi thanh lý tính tiền đến hết hôm trước, hoàn từ chính ngày trả; bỏ tham số `billedUntil` | Đã chọn (PA 1) | Xong |
| B1 | Vừa trả bằng ví vừa đưa tiền mặt thì tiền vào ví mà không có phiếu thu | Từ chối trường hợp này; mọi khoản thu dư gắn với một phiếu thu | Đề xuất | Xong |
| B2 | Gỡ phiếu thu làm mất tiền hoặc rút hết tiền dư | Gỡ phiếu hỏi: **chuyển vào ví** / **trả lại khách** / **nhập nhầm** | Đã chọn | Xong |
| B3 | Chuyển phòng có thể gắn hai phí vào một đồng hồ, hoặc vào đồng hồ đã tháo | Dùng đồng hồ người dùng chọn trong popup; bỏ đồng hồ đã tháo; cấm trùng | Đề xuất | Xong |
| B4 | Huỷ chuyển phòng kiểm quyền trước khi khoá dữ liệu | Đưa phần kiểm vào trong giao dịch, khoá hai hợp đồng | Đề xuất | Xong |
| B5 | Dòng "Nợ cũ" trên hoá đơn thanh lý sửa được số lượng | Khoá dòng này ở mọi hoá đơn thanh lý (đi cùng A2) | Đề xuất | Xong |
| B6 | Plan và spec nói khác nhau về số ví trừ khi thanh lý | Trừ toàn bộ ví như code; sửa plan | Đề xuất | Xong |
| B7 | Phiếu trả bằng ví, gộp vào thanh lý chưa có tên tiếng Việt | Thêm nhãn hiển thị | Đề xuất | Xong |
| C1 | Dòng "Chuyển sang hợp đồng mới" cân bằng ở hai nơi | Gom về một hàm | Đề xuất | Xong |
| C2 | Ghi ví kiểm trùng hai lần, có thể báo sai | Một lệnh ghi có chống trùng | Đề xuất | Xong |
| C3 | Sổ quỹ tải hết dòng ví rồi mới lọc | Lọc ngay khi truy vấn | Đề xuất | Xong |
| C4 | Mở popup hợp đồng là tải đồng hồ mọi cơ sở | Chỉ tải khi mở popup chuyển phòng | Đề xuất | Xong |
| C5 | Kiểm "đã có hoá đơn thanh lý chưa" đặt sai chỗ | Chuyển lên ngay sau bước thanh lý | Đề xuất | Xong |
| D1 | Ví đang tách theo cơ sở | Một ví cho mỗi khách, dùng ở mọi cơ sở | Đã chọn | Xong |
| D2 | Chưa có giao diện xem ví | Khối "Ví khách" ở chi tiết khách; số dư ở chi tiết hợp đồng | Đã chọn | Xong |

---

## Quy ước chung về ví (áp cho mọi mục)

**Các loại biến động ví** (`WalletEntryKind`, `src/domain/statuses.ts`; cột `kind` là chữ nên thêm loại không cần migration). Nhãn hiển thị đặt một chỗ ở `leasing/domain/labels.ts`.

| Loại | Nhãn | Ví | Sổ quỹ | Sinh ra khi |
|---|---|---|---|---|
| `overpay` | Thu dư vào ví | + | **Thu**, ngày khách đưa | Thu vượt nợ (đã có) |
| `reallocate` | Chuyển phiếu thu vào ví | + | **Thu**, ngày thu gốc | Gỡ phiếu chọn "chuyển vào ví" hoặc "trả lại khách", huỷ chuyển phòng (B2, A3) |
| `refund_out` | Trả lại khách | − | **Chi**, ngày trả | Gỡ phiếu chọn "trả lại khách" (B2) |
| `carry_surplus` | Dư chuyển phòng | + | Không tính (không phải tiền mới) | Hoá đơn đầu hợp đồng mới về 0 (A4) |
| `use_invoice` | Dùng ví trả hoá đơn | − | Không tính | Thu tiền có dùng ví (đã có) |
| `use_termination` | Ví gạch vào thanh lý | − | Không tính | Duyệt hoá đơn thanh lý (đã có) |

Kiểm tra nhanh: sổ quỹ = tiền thật vào − tiền thật ra. Các loại "không tính" chỉ là chuyển chỗ của tiền đã tính một lần.

**Phương thức khoản thu** (`payments.method`): `cash`, `transfer`, `other` là tiền thật, sổ quỹ tính; `wallet` (trả bằng ví) và `carry` (gộp vào thanh lý) không tính.

**Ranh giới module.** Mọi ghi ví nằm trong `leasing` (tầng 4). Sổ quỹ (`cashbook`, tầng 5) chỉ **đọc** ví qua cổng `@/modules/leasing`. `leasing` không ghi bảng `expenses` của `cashbook`; vì vậy "trả lại khách" dùng `refund_out` chứ không thêm dòng chi vào `expenses`.

---

## A. Lỗi làm sai tiền

### A1. Chặn chuyển phòng khi hợp đồng cũ còn nợ (đã chọn)

**Vấn đề.** Dòng "Nợ cũ chưa thanh toán" được tính lúc lập hoá đơn thanh lý nháp (`createTermination`, biến `unpaidTotal`). Lúc duyệt, `settleWalletAndTransfer` (`addenda/finalize.ts`) đóng nợ cũ theo số nợ **lúc duyệt**. Nếu khoản thu tháng 11 được nhập trễ, sau khi đã lập nháp, thì T vẫn có +9.000.000 mà khoản đóng nợ bằng 0. Kết quả: hợp đồng mới đòi khách 9.000.000 lần nữa.

**Hướng giải quyết.**
- `createRoomChange` (`addenda/room-change.ts`), trước bước thanh lý, kiểm hợp đồng cũ:
  - còn hoá đơn **nháp**: báo "Hoá đơn tháng 11/2026 còn nháp: duyệt và thu, hoặc xoá, rồi chuyển phòng";
  - còn hoá đơn đã duyệt **chưa thu đủ**: báo "Còn nợ 9.000.000 ở hoá đơn tháng 11/2026: thu xong rồi chuyển phòng". Nhiều hoá đơn thì liệt kê từng tháng và tổng nợ.
  - Báo bằng `ValidationError`, không tạo gì.
- Lưới an toàn khi **duyệt** hoá đơn thanh lý chuyển phòng: nếu hợp đồng cũ lại có hoá đơn tháng còn nợ (ví dụ ai đó lập thêm), từ chối duyệt với cùng thông báo.
- Popup chuyển phòng (`ui/contracts/room-change-dialog.tsx`) gọi action mới `roomChangeBlockerAction(leaseId)` khi mở. Nếu có cản trở thì hiện cảnh báo ở đầu popup và khoá nút xác nhận (đưa vào `extraError`).
- Khách có ví thì trả nợ cũ bằng ví trước rồi chuyển.
- Nợ phát sinh **trong** hoá đơn thanh lý (tiền phòng còn thiếu, điện nước, phạt, phát sinh) vẫn đi vào T và sang hợp đồng mới như cũ.

**Hệ quả.**
- Hoá đơn thanh lý chuyển phòng không còn dòng "Nợ cũ".
- Đoạn đóng nợ cũ trong `settleWalletAndTransfer` chuyển sang hàm chung của A2.
- T gần như luôn âm (hoàn tiền phòng + cọc + ví), nên A4 trở thành trường hợp hay gặp.

**Test.**
- `room-change.test.ts`: dữ liệu đầu có hoá đơn tháng 11 chưa thu, nên thu đủ 9.000.000 trước khi gọi `createRoomChange`.
- Thêm: còn nợ thì từ chối (hợp đồng cũ vẫn hiệu lực, không có hợp đồng mới); còn hoá đơn nháp thì từ chối.

### A2. Đóng nợ cũ ở mọi hoá đơn thanh lý (đề xuất)

**Vấn đề.**
- Hoá đơn thanh lý thường cộng "Nợ cũ", nhưng các hoá đơn tháng cũ vẫn mở, nên thu được hai lần. Lỗi có từ trước PR.
- Ngay cả khi đóng nợ lúc duyệt, nếu khoản thu nhập trễ giữa lúc lập nháp và lúc duyệt thì vẫn lệch như A1. Thanh lý thường không chặn trước được như chuyển phòng, vì khách trả phòng hẳn thường còn nợ.

**Hướng giải quyết.**
- `buildTerminationInvoice`: dòng "Nợ cũ chưa thanh toán" gắn `meta: { unpaid: true }`.
- Tách hàm `settleOldInvoices(tx, ctx, terminationInvoiceId)` trong `finalize.ts`, gọi trong `finalizeTermination` cho **mọi** hoá đơn thanh lý:
  1. tính nợ thật hiện tại của các hoá đơn tháng đã duyệt của hợp đồng;
  2. sửa dòng `unpaid` về đúng số đó (bằng 0 thì xoá dòng);
  3. ghi khoản `carry` cho từng hoá đơn còn nợ để đóng lại.
- Với chuyển phòng, sau bước 2 mới tính lại dòng chuyển (C1). Theo A1 thì bước này thường không có gì.
- **Bỏ duyệt** hoá đơn thanh lý thường: hiện `unapproveInvoice` chỉ kiểm khoản thu của chính hoá đơn đó, không thấy các khoản `carry` ở hoá đơn cũ. Phải xoá các khoản `carry` mà lần duyệt này đã ghi (đánh dấu bằng ghi chú hoặc `note` chứa mã hoá đơn thanh lý), để nợ cũ mở lại.
- Nhãn hiển thị của `carry`: "Gộp vào thanh lý".

**Test.**
- Thanh lý thường khi còn nợ 9.000.000: duyệt xong `leaseDebt` = tổng hoá đơn thanh lý; hoá đơn tháng cũ có khoản `carry` 9.000.000.
- Lập nháp, thu 9.000.000 cho hoá đơn tháng, rồi duyệt: dòng "Nợ cũ" bị xoá, không có `carry`, tổng thanh lý giảm 9.000.000.
- Bỏ duyệt: khoản `carry` mất, nợ cũ hiện lại.

### A3. Huỷ chuyển phòng: tiền đã thu ở hợp đồng mới vào ví (đã chọn, phương án 3)

**Vấn đề.** `cancelRoomChange` gọi `deleteContract`, làm xoá luôn các khoản thu của hợp đồng mới. Tiền thật mất khỏi sổ quỹ.

**Hướng giải quyết.** Dùng chung cơ chế B2, lựa chọn "chuyển vào ví":
- Mỗi khoản thu tiền thật (`cash`, `transfer`, `other`) của hợp đồng mới: ghi `reallocate` +số tiền, ngày = ngày thu gốc, ghi chú "Huỷ chuyển phòng <mã hợp đồng mới>", rồi xoá khoản thu.
- Khoản thu trả bằng ví (`wallet`): trả lại ví như hiện nay.
- Biến động `carry_surplus` của hợp đồng mới (A4) bị xoá.
- `undoApprovedTransfer`: trả lại `use_termination`, gỡ khoản `carry` (A2).
- Sau đó khôi phục hợp đồng cũ và xoá hợp đồng mới, như hiện nay. Cọc cũ về sổ cọc hợp đồng cũ (bước khôi phục đã đảo `deduct`).
- Quyền: hoá đơn thanh lý còn nháp và hợp đồng mới chưa thu tiền thì ai có `tenants_contracts` + `delete_contracts` cũng làm được. Ngược lại chỉ admin, như hiện nay.
- `previewContractRestore`: liệt kê "Chuyển vào ví khách: X" để người bấm thấy trước.
- Đổi spec mục 2 ("Không khôi phục được sau khi hoá đơn đầu đã có thanh toán") và mục 5.3 "Khi có lỗi".

**Test** (dùng số vòng đời mới): hợp đồng mới đã thu 3.100.000, huỷ chuyển phòng. Mong đợi:
- ví = 3.100.000 (`reallocate`) + 1.000.000 (`use_termination` được trả) = 4.100.000;
- cọc hợp đồng cũ = 9.000.000;
- hợp đồng cũ không còn nợ;
- tổng thu sổ quỹ không đổi.

### A4. Số dư mang sang lớn hơn hoá đơn đầu (đề xuất)

**Vấn đề.** Spec yêu cầu hoá đơn đầu về 0 và phần dư vào ví (`carry_surplus`). Code chưa có, nên hoá đơn ra tổng âm.

**Hướng giải quyết.**
- Thêm loại `carry_surplus`.
- Khi **duyệt** hoá đơn có dòng điều chỉnh `transfer:*` mà tổng < 0:
  1. thêm dòng "Số dư chuyển vào ví" +X (X = −tổng), `meta: { surplus: true }`;
  2. ghi `carry_surplus` +X, `sourceKey = carry_surplus:<invoiceId>`.
- Bỏ duyệt hoặc xoá hoá đơn đó thì xoá dòng và biến động. Nếu ví đã dùng tới thì từ chối.
- Hoá đơn nháp vẫn hiện tổng âm, kèm ghi chú "Khi duyệt, X vào ví khách".

**Test.** Như vòng đời mới nhưng cọc phòng mới 3.000.000. Hoá đơn đầu = 3.000.000 + 4.400.000 − 13.300.000 = −5.900.000. Duyệt thì tổng 0, ví +5.900.000. Huỷ chuyển phòng thì biến động này mất.

### A5. Mọi thanh lý tính đến hết hôm trước ngày trả (đã chọn, phương án 1)

**Hướng giải quyết.**
- `buildTerminationInvoice` luôn tính tiền phòng, phí cố định, tiền phòng còn thiếu đến `endDate − 1`, và hoàn từ chính `endDate`. Chỉ số đồng hồ vẫn chốt ngày `endDate`.
- **Bỏ tham số `billedUntil`** và bỏ nhánh `opts.transfer ? ... : undefined` trong `createTermination`, vì thanh lý thường và chuyển phòng giờ tính giống nhau.
- Hoá đơn thanh lý đã duyệt trước đây không tính lại.
- Cập nhật test: `tests/unit/domain/billing.test.ts`, `tests/integration/addenda.test.ts`, `contract-restore.test.ts`, `contract-history.test.ts`, `room-change.test.ts` (các test thanh lý thường ngày 20/11: hoàn 20–30/11 = 3.300.000, không còn 19 ngày), `customer-lifecycle.test.ts`.

---

## B. Lệch thiết kế, dữ liệu

### B1. Mọi khoản thu dư gắn với một phiếu thu (đề xuất)

**Vấn đề.** Trong `recordLeasePayment`, ví đã đủ trả hết nợ mà khách vẫn đưa tiền mặt thì không có phiếu tiền mặt nào. Dòng `overpay` có `paymentId` rỗng và `sourceKey` ngẫu nhiên, không gỡ được.

**Hướng giải quyết.**
- Nếu `walletUse >= debt` và `amount > 0`: báo "Ví đã đủ trả nợ: bỏ phần tiền mặt hoặc giảm số dùng ví".
- Bỏ nhánh `crypto.randomUUID()`.
- `overpay` gắn với phiếu tiền mặt **cuối cùng** của lần thu, vì đó là phiếu chạm trần nợ.

### B2. Gỡ phiếu thu: chuyển vào ví, trả lại khách, hoặc nhập nhầm (đã chọn)

**Vấn đề.**
- Gỡ phiếu hiện là xoá hẳn tiền khỏi sổ quỹ, kể cả khi tiền thật vẫn ở trong két.
- `overpay` gắn vào phiếu đầu, nên gỡ phiếu đầu là rút hết tiền dư.

**Hướng giải quyết.** `removePayment(db, ctx, paymentId, outcome)`:

| Lựa chọn | Phiếu | Ví | Sổ quỹ | Khi nào dùng |
|---|---|---|---|---|
| `to_wallet` (mặc định) | Xoá | `reallocate` +số tiền, ngày thu gốc | Tổng không đổi: dòng phiếu đổi thành dòng "Chuyển phiếu thu vào ví" cùng ngày | Lập lại hoặc sửa hoá đơn, gạch nhầm hoá đơn |
| `refund` | Xoá | `reallocate` + rồi `refund_out` −, ví không đổi | Thu vẫn ở ngày gốc; thêm **chi** "Trả lại khách" ngày trả | Khách lấy lại tiền |
| `mistake` | Xoá | Rút `overpay` gắn với phiếu này (chặn nếu ví sẽ âm) | Dòng thu biến mất | Phiếu không có thật; chỉ admin, hoặc người lập phiếu trong cùng ngày (giờ VN) |

Quy tắc đi kèm:
- Phiếu `wallet` không hỏi: gỡ là trả lại ví.
- Phiếu `carry` không gỡ tay được; chỉ mất khi bỏ duyệt hoặc khôi phục thanh lý (A2).
- `to_wallet` và `refund` **không** rút `overpay`; tiền dư cũ giữ nguyên.
- Phiếu từng gạch cọc ("Tiền cọc còn thiếu"): gỡ phiếu thì dòng cọc về "chờ thu" (`syncDepositWithInvoice`), tiền chuyển thành tiền ví. Sổ quỹ tổng không đổi, dòng "Thu cọc" đổi thành "Chuyển phiếu thu vào ví". Popup ghi rõ điều này.
- Ngày của `refund_out`: nhân viên chọn, mặc định hôm nay.
- Popup gỡ phiếu (`ui/invoices/...`): ba lựa chọn kèm mặc định, hiện số dư ví sau khi gỡ.

**Các đường xoá phiếu hàng loạt:**

| Đường | Mặc định | Ghi chú |
|---|---|---|
| `cancelRoomChange` | `to_wallet` | Chính là A3 |
| `deleteContract` | `mistake` | Xoá hợp đồng thường vì nhập nhầm; nếu hợp đồng có khoản thu tiền thật, popup xoá hỏi "chuyển vào ví" hay "nhập nhầm" |
| `restoreContract` (khôi phục sau sửa hoặc thanh lý thường) | `to_wallet` | Khôi phục không có nghĩa là tiền không có thật |

**Sổ quỹ.** Thay `listOverpayEntries` bằng `listWalletCashEntries(db, { facilityIds, month })`, trả các dòng `overpay`, `reallocate` (thu) và `refund_out` (chi), lọc ngay trong truy vấn (C3). Cơ sở của dòng là cơ sở của phiếu gốc.

**Test** (dữ liệu `lease-payment.test.ts`: hoá đơn 7 và 8 mỗi tháng 9.000.000; thu 20.000.000, dư 2.000.000 vào ví, gắn phiếu tháng 8):
- `to_wallet` phiếu tháng 7: ví 11.000.000; sổ quỹ thu 20.000.000; tháng 7 nợ lại 9.000.000. Thu lại bằng ví 9.000.000 thì ví còn 2.000.000, sổ quỹ vẫn 20.000.000.
- `refund` phiếu tháng 7: ví 2.000.000; sổ quỹ thu 20.000.000, chi 9.000.000.
- `mistake` phiếu tháng 7: ví 2.000.000; sổ quỹ thu 11.000.000.
- `mistake` phiếu tháng 8: ví 0, sổ quỹ thu 9.000.000. Nếu 2.000.000 đã dùng thì bị chặn.
- Người không phải admin, không phải người lập phiếu, chọn `mistake`: bị từ chối.

### B3. Đồng hồ phòng mới khi chuyển phòng (đề xuất)

**Vấn đề.** `copyFees` tìm đồng hồ theo `utility` bằng `find`. Hai phí cùng loại có thể gắn chung một đồng hồ, và có thể chọn cả đồng hồ đã tháo.

**Hướng giải quyết.**
- Lọc `isNull(meters.removedOn)`.
- Ánh xạ từng phí cũ sang đúng `meterId` người dùng chọn trong popup (form đã có `facilityMeters`). Input đổi thành `newRoomReadings: { leaseFeeId, meterId, value }[]`.
- Từ chối nếu một `meterId` dùng cho hai phí, hoặc đồng hồ không thuộc phòng mới.

**Test.** Hai phí điện mà phòng mới chỉ có một đồng hồ điện: báo lỗi theo tên phí.

### B4. Kiểm quyền huỷ chuyển phòng trong giao dịch (đề xuất)

Chuyển việc đọc hợp đồng mới, kiểm quyền và `roomChangeNeedsAdmin` vào trong `db.transaction`, sau khi khoá hai hàng `leases` (`for update`, theo thứ tự id tăng dần).

### B5. Khoá dòng "Nợ cũ" trên mọi hoá đơn thanh lý (đề xuất)

- Dòng `meta.unpaid` (A2) do hệ thống tính lại khi duyệt, nên người dùng không sửa số lượng, đơn giá, và không xoá được.
- Hiện `updateLines` chỉ khoá dòng hệ thống ở hoá đơn chuyển phòng. Mở rộng điều kiện khoá dòng `unpaid` cho mọi hoá đơn thanh lý; các dòng khác của thanh lý thường giữ như cũ.

### B6. Dòng ví trong hoá đơn thanh lý (đề xuất)

Giữ như code: trừ **toàn bộ** ví, phần thừa thành tiền hoàn, để khách đi không còn ví treo. Sửa câu trong plan (`docs/superpowers/plans/2026-11-27-chuyen-phong-hai-buoc.md`, task hoá đơn thanh lý) cho khớp.

### B7. Nhãn hiển thị (đề xuất)

- Thêm `PAYMENT_METHOD_DISPLAY_LABELS` gồm thêm `wallet: 'Trừ ví'` và `carry: 'Gộp vào thanh lý'`. Dùng ở danh sách phiếu thu, sổ quỹ, PDF phiếu thu.
- Giữ `PAYMENT_METHOD_OPTIONS` chỉ ba lựa chọn cho ô chọn khi thu tiền.
- Nhãn loại ví: xem "Quy ước chung".

---

## C. Dọn code (không đổi kết quả)

| # | Chỗ | Vấn đề | Hướng giải quyết |
|---|---|---|---|
| C1 | `updateLines`, `settleWalletAndTransfer` | Dòng chuyển cân bằng về 0 ở hai nơi | Hàm `rebalanceTransferLine(lines)` dùng chung; gọi sau `settleOldInvoices` (A2) |
| C2 | `addWalletEntry` | `select` kiểm trùng rồi `onConflictDoNothing`; chạy song song vẫn trả `true` | Chỉ `insert ... onConflictDoNothing().returning()`, trả `rows.length > 0` |
| C3 | `listOverpayEntries` | Lấy mọi dòng rồi lọc trong JS | Thay bằng `listWalletCashEntries` (B2), lọc trong `where` |
| C4 | `quickContractDataAction` | `await import('@/db')` giữa hàm; luôn tải đồng hồ bận của mọi cơ sở | Import tĩnh; tách action riêng cho popup chuyển phòng, lọc theo cơ sở |
| C5 | `createRoomChange` | Kiểm `if (!term.invoice)` đặt sau `insertLease` | Chuyển lên ngay sau `createTermination` |

---

## D. Quyết định mới về ví

### D1. Một ví cho mỗi khách, dùng ở mọi cơ sở (đã chọn)

**Việc cần làm.**
- `walletBalance(db, tenantId)`: bỏ tham số cơ sở. Sửa mọi chỗ gọi: thu tiền, thanh lý, duyệt thanh lý, `reverseWalletForPayments`, popup thu tiền.
- Cột `facility_id` giữ lại, nghĩa mới là "cơ sở phát sinh". Sổ quỹ dùng cột này để đặt dòng thu hoặc chi vào đúng cơ sở.
- Đổi index thành `(tenant_id)`: sửa `src/db/schema/wallet.ts`, rồi `npm run db:generate`.
- Khoá theo khách (`select ... from tenants for update`) giữ như hiện nay, vì đã đúng với ví chung.
- Quyền xem ví (`listWalletEntries`): có `billing` ở cơ sở chính của khách (`homeFacilityId`) **hoặc** ở bất kỳ cơ sở nào khách có hợp đồng. Dùng ví khi thu tiền: quyền `billing` ở cơ sở của hợp đồng, như hiện nay.
- Sổ quỹ: xem tổng toàn công ty thì khớp. Xem theo từng cơ sở (bộ lọc và phạm vi quyền vẫn còn) thì không khớp từng nơi: tiền dư ghi thu ở cơ sở A, dùng trả nợ ở cơ sở B thì sổ B có nợ được đóng mà không có dòng thu. Đây là hệ quả đã chấp nhận; ghi vào `docs/architecture.md`.
- Chuyển phòng vẫn chỉ trong cùng cơ sở (spec mục 2). Lý do giờ không còn là ví mà là phạm vi việc làm.

**Test.** Sửa `tests/integration/wallet.test.ts`: thay test "cơ sở B không thấy ví cơ sở A" bằng "ví nạp ở cơ sở A dùng được cho hoá đơn ở cơ sở B; sổ quỹ toàn công ty thu đúng một lần".

### D2. Giao diện ví khách (đã chọn)

- Trang chi tiết khách: khối "Ví khách" gồm số dư và bảng lịch sử (ngày, loại theo nhãn ở "Quy ước chung", số tiền ±, hoá đơn hoặc hợp đồng liên quan bấm mở được, cơ sở phát sinh, ghi chú).
- Trang chi tiết hợp đồng: số dư ví của khách chính, liên kết sang trang khách.
- **Chỗ đặt code:** `tenants` (tầng 2) không được import `leasing`. Khối ví đặt ở `leasing/ui/` (ví dụ `wallet-panel.tsx`, xuất qua `leasing/ui.ts`), ghép vào trang ở route `src/app/(app)/tenants/...`. Dữ liệu lấy qua `listWalletEntries` của `leasing`.
- Không có nút nạp hoặc rút ví trực tiếp: ví chỉ thay đổi qua thu tiền, gỡ phiếu, thanh lý, chuyển phòng.

---

## Số liệu vòng đời khách mới (`customer-lifecycle.test.ts`)

Theo A1, A4, A5. Các bước khác giữ nguyên.

| Bước | Cũ | Mới |
|---|---|---|
| Trước chuyển phòng | Hoá đơn 11/2026 chưa thu | Thu 9.000.000 tiền mặt ngày 15/11; thêm bước "chuyển phòng lúc còn nợ bị từ chối" trước đó |
| T khi chuyển 20/11 | −3.300.000 + 9.000.000 − 9.000.000 − 1.000.000 = −4.300.000 | −3.300.000 − 9.000.000 − 1.000.000 = **−13.300.000**; không có dòng "Nợ cũ", không có `carry` |
| Hoá đơn 11/2026 hợp đồng mới | 12.000.000 + 4.400.000 − 4.300.000 = 12.100.000 | 12.000.000 + 4.400.000 − 13.300.000 = **3.100.000** |
| Thanh lý 16/01/2027 | Hoàn 17–31/01 = 5.806.452; tổng −15.306.452; mức chặn hoàn một phần 5.806.453 | Hoàn 16–31/01 = 16/31 × 12.000.000 = **6.193.548**; tổng **−15.693.548**; mức chặn **6.193.549** |
| Sổ quỹ | 64.100.000 | 3 + 10 + 5 + 3 + 7 + **9** + **3,1** + 12 + 12 triệu = **64.100.000** (không đổi) |

Thêm nhánh riêng (dùng `beforeEach` riêng, không nối vào chuỗi chính):
- A3: thu 3.100.000 ở hợp đồng mới rồi huỷ chuyển phòng (số mong đợi ở mục A3).
- A4: cọc phòng mới 3.000.000 (số mong đợi ở mục A4).

---

## Sửa spec, tài liệu

- Spec `2026-11-27-chuyen-phong-hai-buoc-design.md`:
  - mục 2: bỏ "không khôi phục được sau khi hoá đơn đầu đã có thanh toán" (A3); giữ "không nạp trước vào ví";
  - mục 5.0: ghi rõ đã áp cho mọi thanh lý (A5);
  - mục 5.1: bỏ "tách theo cơ sở", thêm bảng loại ví (D1, "Quy ước chung");
  - mục 5.3: thêm điều kiện "sạch nợ trước khi chuyển" (A1), sửa phần "Khi có lỗi" (A3);
  - mục 7: bỏ "ví tách theo cơ sở" và "duyệt thanh lý không đòi khách đã trả đủ".
- Plan `2026-11-27-chuyen-phong-hai-buoc.md`: dòng ví (B6).
- `docs/architecture.md`: ví theo khách, bảng loại ví và cách sổ quỹ đọc; gỡ phiếu ba lựa chọn; đóng nợ cũ ở mọi thanh lý; huỷ chuyển phòng chuyển tiền vào ví; sổ quỹ theo cơ sở không khớp từng nơi (D1).
- Mô tả PR #60: cập nhật mục "Việc hoãn" (nhãn, giao diện ví đã đưa vào việc làm).

## Thứ tự làm gợi ý

1. D1 (đổi `walletBalance`, migration index): nền cho mọi mục ví.
2. "Quy ước chung" + B7: loại ví, nhãn, sổ quỹ đọc `listWalletCashEntries` (C3).
3. A5, A2, B5, C1: phần hoá đơn thanh lý.
4. A1, B3, B4, C4, C5: phần chuyển phòng.
5. B1, B2, rồi A3 (dùng B2), A4.
6. D2: giao diện.
7. Cập nhật test và tài liệu, rồi chạy `npm run lint`, `npm run typecheck`, `npm test` trước khi đẩy PR.
