# Ô nhập tiền tự thêm dấu chấm

## Vì sao
Người dùng phải đếm số 0 khi nhập tiền (`15000000`). Tiền hiển thị đã có dấu chấm (`15.000.000`) nhưng ô nhập vẫn là số thô. Mong muốn: **chỉ các ô nhập tiền** tự thêm dấu chấm khi gõ; mọi số khác giữ nguyên.

## Mục tiêu
- Ô nhập tiền (VND) tự hiện `15.000.000` ngay khi gõ hoặc dán.
- Giữ vị trí con trỏ khi sửa giữa số.
- Dán `15000000`, `15.000.000`, `15,000,000` đều cho cùng một số.
- Gửi lên server số nguyên thô, không có dấu phân cách; không đổi schema/DB.
- Số âm hoạt động ở ô cho phép âm (thanh toán/hoàn tiền, đơn giá dòng điều chỉnh).
- Ô trống vẫn trống.

## Không làm
- Không đổi định dạng hiển thị (tiền vẫn `formatVND`; số khác giữ nguyên).
- Không đổi ô số lượng, diện tích, chỉ số, hệ số, số đếm.
- Không định dạng SĐT, CCCD, số tài khoản, mã phòng/hợp đồng.
- Không đổi PDF, phiếu thu, mẫu hợp đồng Word, Excel mẫu.
- Không thêm thư viện; không đổi quy tắc tính tiền.

## Không được xảy ra
- Nhập `15.000.000` rồi lưu thành `15` hoặc `15000000.0`.
- Dấu chấm lọt vào dữ liệu gửi server khiến Zod/`Number` hiểu sai.
- Con trỏ nhảy về cuối mỗi lần sửa giữa số.
- Ô trống tự thành `0`; số âm (hoàn tiền) mất dấu trừ.
- Tiền VND là số nguyên: gõ/dán phần lẻ thì cắt bỏ, không làm tròn lên.

## Cách đã cân nhắc
- **A. Tự viết `MoneyInput` dùng `formatVND` sẵn có (đã chọn).** Nhỏ, không thêm dependency, đúng định dạng đang dùng; đổi lại phải tự xử lý con trỏ và dán.
- **B. Dùng `react-number-format`.** Xử lý con trỏ/dán sẵn nhưng thêm dependency, không cần cho phạm vi nhỏ này.
- **C. Chỉ định dạng khi blur.** Đơn giản nhưng không đáp ứng "tự hiện khi gõ".

## Thiết kế
1. **Helper** trong `src/domain/money.ts`:
   - `parseMoneyInput(text: string): string` — trả chuỗi số nguyên thô: bỏ khoảng trắng và mọi dấu `.`/`,`; giữ `-` ở đầu; nếu có phần lẻ thì cắt bỏ; `''` giữ `''`.
2. **Component** `src/components/ui/money-input.tsx` (client), dùng `Input` sẵn có:
   - Props: `value: string` (số thô), `onValueChange(raw: string)`, `allowNegative?: boolean`, `name?`, và mọi props của `Input` (`ref`, `onKeyDown`, `aria-*`…).
   - Hiển thị bằng `formatVND(Number(raw))`; riêng `''`, `-` giữ nguyên.
   - Gõ: chỉ nhận chữ số và một `-` ở đầu (nếu cho phép âm); dấu `.`/`,` gõ vào bị bỏ qua (dấu chấm do component tự chèn).
   - Dán: chuẩn hoá bằng `parseMoneyInput` rồi định dạng lại.
   - Sau mỗi lần sửa, đặt con trỏ sau đúng số chữ số/dấu `-` đã có trước con trỏ (bỏ qua dấu chấm).
   - Khi blur: bỏ `-` lẻ; ô trống vẫn trống.
   - Có `name` thì render thêm `<input type="hidden" name={name} value={value} />` để form gửi số thô; ô hiển thị không có `name`.
3. **Thay các ô tiền** (giữ nguyên state chuỗi thô):
   - `fee-type-form`, `fee-facilities-dialog`, `lease-fees` (đơn giá, phí riêng), `lease-wizard` (giá thuê, tiền cọc, đã cọc), `deposit-form`, `contract-edit-actions`, `transfer-wizard`, `extension-dialog`, `termination-wizard`, `deposit-ledger`, `payment-dialog`, `one-off-dialog` (đơn giá), `invoice-editor` (đơn giá), `handover asset-condition-row` (tiền phạt), `asset-form`, `lease-assets` (giá trị tài sản mới), ô giá niêm yết phòng (`room-edit-form`, `room-quick-actions`, `room-panels`).
   - `allowNegative`: `payment-dialog` (số tiền) và `invoice-editor` (đơn giá dòng điều chỉnh).
   - Ô tiền đang `type="number"` chuyển sang `MoneyInput`; ô số khác không đổi.
   - Bỏ validator chặn dấu phân cách (ví dụ `/^\d+$/` ở đơn giá) và kiểm tra trên chuỗi thô.
4. **Không đổi** `formatVND`, hiển thị, PDF/Word hay các ô số khác.

## Kiểm thử
- Unit `tests/unit/domain/money.test.ts`: `parseMoneyInput` với `15000000`, `15.000.000`, `15,000,000`, `15.000.000,50` → `15000000`; `-1.500.000` → `-1500000`; `''` → `''`.
- E2E mới: nhập `15000000` vào ô giá thuê → thấy `15.000.000`; thêm `0` ở cuối → `150.000.000`; sửa giữa số, con trỏ đúng chỗ; dán `1.500.000`; lưu và mở lại thấy đúng số; ô trống vẫn trống.
- Chạy `npm test`, `npx tsc --noEmit`, `npm run lint`, e2e liên quan.
