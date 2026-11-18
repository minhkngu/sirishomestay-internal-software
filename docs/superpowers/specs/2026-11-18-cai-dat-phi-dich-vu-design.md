# Cài đặt — Phí dịch vụ: sắp xếp lại

## Mục đích

Tab **"Đơn vị & loại phí"** hiện tại không trực quan: cùng một loại phí nằm rải ở ba chỗ (bảng, thẻ "Mặc định theo cơ sở", khối "Giá riêng theo toà"); tạo đơn vị là một bước riêng ở trên cùng; form tạo loại phí nằm rời ở cuối trang. Mục tiêu là mỗi loại phí thành một khối duy nhất, việc tạo đơn vị nằm ngay trong lúc tạo phí, và thứ tự trên trang đi theo công việc thật.

## Hiện trạng

- Đầu tab: ô "Thêm đơn vị" + danh sách đơn vị viết thành một dòng chữ.
- Bảng loại phí: tên, đơn vị, đơn giá, kiểu; chỉ có nút **Lưu trữ**, không sửa được.
- Dưới bảng: N thẻ "Mặc định theo cơ sở — <phí>" (checkbox từng cơ sở).
- Rồi N khối `<details>` "Giá riêng theo toà — <phí>".
- Cuối trang: form "Thêm loại phí" 5 ô.

Hệ quả: trang dài gấp ba theo số loại phí; phí đã lưu trữ biến mất khỏi mọi nơi kể cả giá riêng; `updateFeeType` đã có ở server nhưng giao diện không dùng.

## Mục tiêu

- Mỗi loại phí là một thẻ chứa đủ: đơn vị, đơn giá, kiểu tính, cách lấy số lượng, mặc định theo cơ sở, giá riêng theo toà.
- Tạo đơn vị mới ngay trong form loại phí (chọn đơn vị có sẵn hoặc gõ tên mới).
- Tạo và sửa loại phí dùng chung một form, đặt ngay đầu danh sách.
- Loại phí đã lưu trữ vẫn xem được và khôi phục được.

## Không làm (non-goals)

- Không đổi schema DB, không thêm migration.
- Không đổi cách hợp đồng, hoá đơn đọc loại phí / giá riêng / phí mặc định.
- Không đổi tab "Đơn giá điện nước", "Cơ sở", "Chung", "Tài khoản nhận tiền".
- Không xoá cứng loại phí hay đơn vị; không sửa tên đơn vị đã tạo (chỉ thêm và hiển thị).
- Không đổi quyền: vẫn là `settings`.

## Anti-goals

- Trang không được dài hơn hiện tại khi số loại phí không đổi.
- Không thêm màn hình con bắt người dùng đi qua lại giữa danh sách và trang chi tiết.
- Không mất giá riêng hoặc dấu mặc định khi lưu trữ / khôi phục một loại phí.
- Không làm hỏng luồng tạo hợp đồng đang đọc `feeDefaults` và `feeTypePrices`.

## Ràng buộc

- `src/features/settings` chỉ gọi server action; không import `db`.
- Service nhận `(db, ctx, input)`, kiểm quyền bằng `assertCan(ctx, 'settings')`, ghi audit như các hàm hiện có.
- Chuỗi giao diện tiếng Việt; dùng `formatVND`, các component `ui/` sẵn có (`Button`, `Input`, `Label`, `Checkbox`).

## Phương án đã cân nhắc

- **A. Mỗi loại phí một thẻ, mọi thứ trong thẻ** — chọn. Ít bấm, thấy ngay quan hệ phí ↔ cơ sở, trang dài tuyến tính theo số phí.
- **B. Bảng gọn + bấm dòng mở cấu hình** — gọn hơn khi có nhiều phí, nhưng vẫn phải bấm mở mới thấy mặc định và giá riêng.
- **C. Danh sách trái, chi tiết phải** — hợp khi danh mục vài chục phí, nhiều cơ sở; nặng hơn nhu cầu hiện tại và chật trên màn hình hẹp.

## Thiết kế

Thứ tự trong tab (đổi tên tab thành **"Phí dịch vụ"**):

1. **Tiêu đề mục + nút "+ Thêm loại phí"**.
2. **Danh sách thẻ loại phí đang dùng**, xếp theo tên. Mỗi thẻ:
   - Dòng đầu: tên phí; dòng phụ: `đơn vị · đơn giá · kiểu tính · cách lấy số lượng`; bên phải: **Sửa**, **Lưu trữ**.
   - **Mặc định cho cơ sở**: một checkbox kèm tên từng cơ sở, lưu ngay khi bấm (lỗi thì hoàn tác như hiện tại).
   - **Giá riêng theo toà**: mỗi cơ sở một dòng — tên cơ sở, ô giá (để trống, placeholder hiện đơn giá chung), **Lưu**, và **Xoá** khi đang có giá riêng.
   - Lỗi / xác nhận hiện trong thẻ.
3. **"Đã lưu trữ (n)"** dạng gập: tên phí + **Khôi phục**.
4. **"Đơn vị tính"** dạng dải nhỏ cuối trang: các đơn vị hiện có + ô thêm nhanh. Đây là nơi tra cứu; đường tạo chính là trong form loại phí.

**Form tạo / sửa loại phí** (cùng một component, hiện inline ở đầu danh sách khi tạo, thay thân thẻ khi sửa):

- Tên phí.
- Đơn vị: chọn từ danh sách có sẵn, hoặc chọn "Đơn vị mới…" để hiện ô nhập tên.
- Đơn giá mặc định, kiểu phí (cố định hằng tháng / theo lần, tiêu thụ), cách lấy số lượng (nhập tay, theo số người, theo phòng, theo đồng hồ, nhập lượng mỗi kỳ).
- Lưu / Huỷ; validate và báo lỗi theo ô như hiện tại.

**Server:**

- `createFeeType` nhận `unitId` **hoặc** `newUnitName`: tên đã tồn tại (so khớp sau khi trim) thì dùng lại đơn vị đó, chưa có thì tạo; đơn vị và loại phí tạo trong cùng transaction.
- Thêm `restoreFeeType(id)` (đặt `isActive = true`) và action tương ứng; trang Cài đặt lấy cả loại phí đã lưu trữ để hiển thị mục 3.
- Dùng `updateFeeType` đã có cho form sửa; action `updateFeeTypeAction` đã có sẵn.

**Kiểm thử:** integration cho tạo phí kèm đơn vị mới (tạo đơn vị + phí), tạo phí với tên đơn vị đã có (không tạo trùng), khôi phục phí đã lưu trữ; chạy lại test cài đặt hiện có.

## Việc để người viết code quyết

- Tên component, cách chia file trong `src/features/settings/components/`.
- Bố cục responsive của thẻ và dải đơn vị trên màn hình hẹp.
- Câu chữ trợ giúp ngắn trong thẻ và placeholder của ô giá riêng.
- Có xác nhận trước khi lưu trữ hay không (mặc định: có, bằng hộp thoại đơn giản).
