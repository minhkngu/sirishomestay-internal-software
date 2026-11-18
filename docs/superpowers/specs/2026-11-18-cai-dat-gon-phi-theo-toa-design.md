# Cài đặt gọn: bỏ tab Cơ sở, phí theo toà dùng popup

## Ý định
Trang Cài đặt có tab "Cơ sở" trùng với trang Cơ sở riêng. Phần Phí dịch vụ liệt kê mọi toà ngay trong thẻ khi sửa nên dài ra theo số toà.

## Mục tiêu
- Bỏ tab "Cơ sở" khỏi Cài đặt.
- Thẻ phí giữ độ dài cố định dù có nhiều toà.

## Không làm
- Không chuyển "ngày tạo hoá đơn dự kiến" sang chỗ khác (người dùng xác nhận không cần). Giá trị trong DB, schema và nhắc việc giữ nguyên, chỉ không còn ô sửa trên giao diện.
- Không đổi logic lưu: mỗi lần tick hoặc lưu giá vẫn gọi ngay `setFeeDefaultAction`, `setFeeTypePriceAction`, `removeFeeTypePriceAction`.

## Cách làm (người dùng đã chọn)
Đã cân nhắc: popup sửa, hoặc bảng gọn có cuộn trong thẻ. Chọn popup.

1. `settings-tabs.tsx`: xoá `FacilitiesTab`, tab và `TabsContent` "Cơ sở", import `createFacilityAction`/`updateFacilityAction` và kiểu `Fac` thừa. `facilities` truyền xuống `FeeSettings` chỉ cần `{id, name}`; `page.tsx` bỏ `code/address/expectedInvoiceDay` trong map.
2. `fee-type-card.tsx`: bỏ hai khối "Mặc định cho cơ sở" và "Giá riêng theo toà" khỏi chế độ sửa. Dòng tóm tắt luôn hiện, dạng "Áp dụng N toà · M giá riêng" (hoặc "Chưa áp dụng toà nào"). Thêm nút "Áp dụng theo toà" mở popup.
3. Popup (`src/components/ui/dialog.tsx`, component mới trong `src/features/settings/components/`): bảng gồm tên toà, ô tick, ô giá riêng (placeholder theo giá chung), nút Lưu/Xoá. Giá riêng chỉ nhập được khi toà đã tick. Phần bảng cuộn, tiêu đề cố định. Với danh sách dài, thêm ô tìm toà nếu từ 8 toà trở lên.
4. Kiểm thử: unit/e2e hiện có không nhắc tab Cơ sở trong Cài đặt thì không đổi; cần kiểm lại `tests/e2e/smoke-pages.spec.ts` và test đụng ô tick/giá riêng, cập nhật theo popup. Chạy lint, test liên quan và xem trên trình duyệt.

## Việc để người làm quyết
Ngưỡng hiện ô tìm toà, chiều cao tối đa của popup, nội dung chính xác của dòng tóm tắt.
