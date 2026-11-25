# Spec Thanh lý hợp đồng & Tóm tắt thay đổi phiên làm việc

Nhánh: `feat/thanh-ly-hop-dong`

---

## 1. Spec: Luồng & Popup Thanh lý hợp đồng

### 1.1. Mục tiêu
Cho phép nhân viên thực hiện thanh lý hợp đồng thuê phòng gọn, rõ ràng, không yêu cầu nhập liệu thừa (như đồng hồ không gắn phí) và cảnh báo hợp lệ ngay khi nhập liệu.

### 1.2. Dữ liệu đầu vào khi mở popup thanh lý (`loadAddendumForm`)
- **`startDate`, `endDate`, `today`**: Ngày bắt đầu hợp đồng, ngày kết thúc dự kiến, ngày hiện tại theo giờ VN.
- **`terminationMeters`**: Chỉ lọc các đồng hồ đang hoạt động của phòng hiện tại **và có gắn với một khoản phí tính theo đồng hồ (`quantity_source = 'meter'`)** của hợp đồng qua `lease_fee_meters` (`linkedMeterIdsForLease`).
  - Ví dụ: phòng có cả đồng hồ điện và nước, nhưng hợp đồng chỉ gắn phí điện → popup chỉ hiển thị và yêu cầu nhập chỉ số điện.
- **`latestReading`**: Với mỗi đồng hồ, lấy chỉ số chốt gần nhất từ `meter_readings` (theo `read_on` mới nhất; nếu chưa có lần chốt nào thì fallback về `meters.start_reading`).
- **`checkoutAssets`**: Danh sách tài sản kiểm kê bàn giao (ưu tiên từ biên bản check-in gần nhất).
- **`depositBalance`**: Số dư tiền cọc hiện tại của hợp đồng.

### 1.3. Giao diện & Hành vi (`TerminationWizard` + `ReadingInputs`)
1. **Ngày trả phòng & Chỉ số đồng hồ**:
   - Mặc định `endDate = today`.
   - Với mỗi đồng hồ trong `terminationMeters`, điền sẵn giá trị `latestReading.value` vào ô nhập và hiển thị chú thích `(Chốt gần nhất: <số> · <ngày>)` ngay bên cạnh.
2. **Kiểm kê & Đền bù tài sản**:
   - Danh sách tài sản trong phòng: tình trạng, đánh dấu hư hỏng / mất tài sản, tiền đền bù (tự gợi ý giá trị tài sản khi đánh dấu mất nếu chưa nhập), ghi chú, tải ảnh hiện trạng.
3. **Mất cọc & Phí phạt hợp đồng**:
   - Chế độ mất cọc: `Không mất cọc`, `Mất một phần` (nhập số tiền), `Mất toàn bộ`.
   - Danh sách khoản phạt hợp đồng (nội dung + số tiền).
   - Footer hiển thị tổng: `Đền bù TS`, `Phạt HĐ`, `Mất cọc` (nếu có) và nút duy nhất **Xác nhận thanh lý** (đã bỏ nút *Xem trước tiền* dư thừa).

### 1.4. Quy tắc kiểm tra hợp lệ trực tiếp (Live Validation)
Mọi lỗi được cảnh báo ngay sau khi nhập/sửa trường và khoá nút **Xác nhận thanh lý** khi còn lỗi:
- **Ngày trả phòng**: Không được trống; phải `>= startDate` của hợp đồng.
- **Chỉ số đồng hồ**: Với mỗi đồng hồ trong `terminationMeters`, không được trống, phải là số nguyên không âm, và không được nhỏ hơn `latestReading.value`.
- **Đền bù tài sản**: Không được âm.
- **Mất cọc một phần**: Phải nhập số tiền `> 0` và `<= depositBalance`.
- **Phí phạt hợp đồng**: Mỗi dòng đã nhập phải đủ cả nội dung lẫn số tiền `> 0`.

### 1.5. Xử lý phía Server (`createTermination`)
- Kiểm tra `data.endDate >= l.startDate` và chưa tồn tại phụ lục thanh lý (`addenda.type = 'termination'`).
- Gọi `recordReadings(tx, [l.roomId], data.endDate, data.readings, await linkedMeterIdsForLease(tx, leaseId))`: chỉ bắt buộc và ghi nhận chỉ số cho các đồng hồ có gắn phí của hợp đồng.
- Tạo biên bản `check_out` (`status = 'done'`) kèm các `handover_items` (và upload ảnh hiện trạng nếu có).
- Tính toán và tạo hoá đơn thanh lý nháp (`buildTerminationInvoice`) gồm: hoàn tiền phòng trả trước hoặc tính bù tiền phòng thiếu, phí đồng hồ, phát sinh/điều chỉnh chưa lên hoá đơn, nợ cũ chưa thanh toán, tiền phạt tài sản/hợp đồng, và dòng trừ cọc `-(depositBalance - forfeited)`.

---

## 2. Tóm tắt toàn bộ thay đổi trong phiên

### 2.1. Thanh lý hợp đồng & Phụ lục
- Lọc đồng hồ thanh lý theo các đồng hồ có gắn phí của hợp đồng ở cả UI lẫn server (`linkedMeterIdsForLease`).
- Hiển thị và điền sẵn chỉ số chốt tháng gần nhất (`latestReading`) vào popup thanh lý; kiểm tra hợp lệ theo `startDate` và `latestReading`.
- Bỏ nút *Xem trước tiền* và khung tạm tính nháp dư thừa trong `TerminationWizard`.

### 2.2. Hợp đồng cọc & Luồng chuyển sang hợp đồng thuê
- Bổ sung trường thoả thuận trên `deposit_contracts` (`drizzle/0044_big_gideon.sql`, `src/db/schema/contracts.ts`): `agreed_rent`, `agreed_deposit`, `agreed_fees`.
- Tách rõ 2 ô ở `DepositForm`: **Tiền cọc thoả thuận** (mặc định bằng giá thuê thoả thuận, sửa được) và **Tiền cọc giữ chỗ** (tự động ghi thu, bỏ nút *Đã thu* riêng), đồng bộ sang hợp đồng thuê và sổ cọc/hoá đơn khi chuyển đổi (`LeaseWizard`, `deposits.ts`, `leases.ts`).

### 2.3. Luồng Khách thuê (`tenants`)
- Bổ sung xoá khách đơn lẻ và xoá nhiều khách hàng loạt (`tenant-delete-button.tsx`, `tenant-table.tsx`), xử lý chính xác điều kiện lọc khách chưa ở.
- Bấm vào tên khách mở popup thông tin chi tiết (`@modal/(.)tenants/[id]`, `tenant-detail.tsx`) và popup chỉnh sửa nhanh (`tenant-edit-button.tsx`).
- Đưa 2 nút thao tác nhanh lên phía trước và tinh gọn giao diện chỉnh sửa.

### 2.4. Bản in PDF & Hoá đơn
- **Biên bản bàn giao check-in (`handover_check_in`)**: Tách `HANDOVER_CHECK_IN` khỏi `HANDOVER` trong `src/domain/template-fields.ts` và xoá dòng `Tiền phạt` trong `src/modules/documents/server/templates/defaults.ts`.
- **Hợp đồng thuê (`lease`)**: Thêm cột `chi_so_dau` (`Chỉ số đầu`) vào `SERVICE_FEES` và nạp `listLeaseMeterInitials` trong `registerDocLoader('lease', ...)` (`src/modules/leasing/server/contracts/lifecycle.ts`).
- **Hoá đơn (`invoice-editor.tsx`)**: Bỏ dòng chú thích `Chốt lúc ký hợp đồng ... (số hiện tại của hợp đồng)` ở `FirstInvoiceReadings`.

### 2.5. Cảnh báo trực tiếp sau khi điền trường trên toàn web
Chuyển các kiểm tra hợp lệ sang cảnh báo trực tiếp ngay khi điền trường (thay vì ẩn nút hoặc chỉ báo khi bấm nút) tại:
- Hợp đồng & Thanh lý: `lease-wizard.tsx`, `deposit-form.tsx`, `termination-wizard.tsx`, `contract-edit-actions.tsx`.
- Hoá đơn & Thu tiền: `collect-payment-dialog.tsx`, `invoice-fee-quantities.tsx`, `invoice-editor.tsx`.
- Chỉ số đồng hồ & Sổ quỹ: `add-meter-dialog.tsx`, `reading-history.tsx`, `replace-meter-dialog.tsx`, `expense-dialog.tsx`, `edit-entry-dialog.tsx`, `lease-dialogs.tsx`.

### 2.6. Phòng, Dashboard & Kiểm thử
- Cập nhật quản lý phòng (`room-manage-table.tsx`, `room-grid.tsx`, `room-map.tsx`, `room-quick-actions.tsx`, `facilities/server/rooms/*`), dashboard (`dashboard/service.ts`), và các test liên quan (`tests/integration/addenda.test.ts`, `tests/integration/dashboard.test.ts`, `tests/e2e/no-reload.spec.ts`).
