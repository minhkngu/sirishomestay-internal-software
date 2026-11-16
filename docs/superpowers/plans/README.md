# Kế hoạch triển khai Siris

Spec: [../specs/2026-11-16-quan-ly-khach-thue-design.md](../specs/2026-11-16-quan-ly-khach-thue-design.md)

Dùng Supabase ngay từ đầu, dữ liệu giả nạp bằng `npm run db:seed`. Mỗi đợt kết thúc bằng **điểm dừng**: đưa bản thử lên Vercel + checklist để người dùng test và góp ý, rồi mới sang đợt sau. Số Task đánh liên tục cho cả dự án.

| Đợt | Nội dung | Task | File |
|---|---|---|---|
| 1 | Nền tảng: đăng nhập, phân quyền, người dùng, cơ sở/phòng, cài đặt, loại phí, đơn giá, lưu file, khách thuê, nhắc visa | 1, 2, 3, 5, 6, 7, 7b | [dot-1](2026-11-16-dot-1-nen-tang.md) |
| 2 | Mẫu Word, hợp đồng cọc/thuê, tài sản & kho, điện nước, bàn giao | 8–12 | [dot-2](2026-11-16-dot-2-hop-dong-tai-san-dien-nuoc.md) |
| 3 | Tài chính: lõi tính tiền, phí phát sinh, sổ cọc, hoá đơn, thu tiền, phụ lục gia hạn/chuyển phòng/thanh lý | 4, 13–15 | [dot-3](2026-11-16-dot-3-tai-chinh.md) |
| 4 | Sự cố, nhắc việc đầy đủ, nhập Excel, test toàn hệ thống | 16–19 | [dot-4](2026-11-16-dot-4-su-co-nhac-viec-nhap-excel.md) |
| 5 | Chạy thật: PDF/ảnh, R2 + tự xoá ảnh, sao lưu Drive, xoá dữ liệu giả | 20–23 | [dot-5](2026-11-16-dot-5-chay-that.md) |

Kế hoạch các đợt sau có thể được chỉnh lại theo góp ý ở điểm dừng của đợt trước.
