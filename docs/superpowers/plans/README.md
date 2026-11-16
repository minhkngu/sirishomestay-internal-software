# Kế hoạch triển khai Siris

Spec: [../specs/2026-11-16-quan-ly-khach-thue-design.md](../specs/2026-11-16-quan-ly-khach-thue-design.md)

Dùng Supabase ngay từ đầu, dữ liệu giả nạp bằng `npm run db:seed`. Mỗi đợt kết thúc bằng **điểm dừng**: đưa bản thử lên Vercel + checklist để người dùng test và góp ý, rồi mới sang đợt sau. Số Task đánh liên tục cho cả dự án.

| Đợt | Nội dung | Task | File | Tiến độ (16/11/2026) |
|---|---|---|---|---|
| 1 | Nền tảng: đăng nhập, phân quyền, người dùng, cơ sở/phòng, cài đặt, loại phí, đơn giá, lưu file, khách thuê, nhắc visa | 1, 2, 3, 5, 6, 7, 7b | [dot-1](2026-11-16-dot-1-nen-tang.md) | Code xong · e2e + checklist xong (`4d71407`); còn bản thử Vercel và người dùng test |
| 2 | Mẫu Word, hợp đồng cọc/thuê, tài sản & kho, điện nước, bàn giao | 8–12, 12b | [dot-2](2026-11-16-dot-2-hop-dong-tai-san-dien-nuoc.md) | Task 8–12 xong · Task 12b (thêm sau rà soát) và điểm dừng chưa làm |
| 3 | Tài chính: lõi tính tiền, phí phát sinh, sổ cọc, hoá đơn, thu tiền, phụ lục gia hạn/chuyển phòng/thanh lý/đổi người ở | 4, 4b, 13–15 | [dot-3](2026-11-16-dot-3-tai-chinh.md) | Task 4 xong · Task 4b (thêm sau rà soát), 13–15 chưa làm |
| 4 | Sự cố, nhắc việc đầy đủ, nhập Excel, test toàn hệ thống | 16–19 | [dot-4](2026-11-16-dot-4-su-co-nhac-viec-nhap-excel.md) | Chưa làm |
| 5 | Chạy thật: PDF/ảnh, R2 + tự xoá ảnh, sao lưu Drive, xoá dữ liệu giả | 20–23 | [dot-5](2026-11-16-dot-5-chay-that.md) | Task 22 (sao lưu) xong, chưa chạy thử khôi phục · còn lại chưa làm |

Kế hoạch các đợt sau có thể được chỉnh lại theo góp ý ở điểm dừng của đợt trước.

Kế hoạch lẻ: [Tăng tốc chuyển trang](2026-11-16-tang-toc-tai-trang.md) — getClaims, dùng chung AccessContext, loading, Vercel `bom1` (chưa làm).

## Tiến độ

- **16/11/2026:** Nhánh `claude/superpowers-executing-plans-phase-1-728325` đã merge vào `main` (commit `f2a8a22`): Task 1, 2, 3, 4, 5, 6, 7, 7b, 8–12. Kiểm tra: 242/242 test đạt, `tsc` sạch, lint 0 lỗi (8 cảnh báo), build OK. Đã migrate + nạp dữ liệu giả lên Supabase `siris-pms`, đăng nhập thử Admin thành công.
- **16/11/2026 (sau):** seed tự tạo bucket `siris` (`8c09af0`); e2e + checklist đợt 1 (`4d71407`).
- **16/11/2026 — rà soát plan với spec:** thêm Task 12b (ẩn thông tin khách/tiền theo quyền, quyền cho hợp đồng/bàn giao, vật tư theo số lượng, người ở phải là cá nhân) và Task 4b (tách kỳ theo phụ lục chưa duyệt, đổi người ở, kỳ thanh toán nhiều tháng, nước tính theo người, hoá đơn hoàn khách). Sửa Task 13–15 (quyền, ghi đè lẻ ngày trên hoá đơn, `billing_cycle_months`, phiếu thu, điều chỉnh "sửa thẳng hoá đơn hiện tại", sổ cọc khi thanh lý, không xoá ảnh giấy tờ của khách còn hợp đồng), Task 18 (khoá chống trùng cho cọc, công nợ, mã hợp đồng cũ) và Task 21.
- **Việc kế tiếp:** Task 12b → điểm dừng đợt 2 (e2e, `dot-2-checklist.md`) → bản thử Vercel; gỡ thư viện thừa `zustand`, `idb-keyval`; người dùng test và góp ý. Sau đó làm Task 4b, 13–15 (đợt 3).

## Ghi chú môi trường (rút ra khi chạy thật)

- Project Supabase dùng cho web: **siris-pms** (`giwatdbtmctydtiststh`, ap-south-1). Project "Siris" cũ là của app khác, không dùng.
- `DATABASE_URL` phải dùng **Session pooler** (`aws-1-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>`); địa chỉ `db.<ref>.supabase.co` chỉ có IPv6, máy không kết nối được.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` nhận được cả publishable key mới (`sb_publishable_…`); `SUPABASE_SERVICE_ROLE_KEY` nhận được cả secret key mới (`sb_secret_…`).
- Supabase Storage cần bucket riêng tư `siris`; `npm run db:seed` tự tạo nếu chưa có.
