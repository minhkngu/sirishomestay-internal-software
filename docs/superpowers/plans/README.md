# Kế hoạch triển khai Siris

Spec: [../specs/2026-11-16-quan-ly-khach-thue-design.md](../specs/2026-11-16-quan-ly-khach-thue-design.md)

Dùng Supabase ngay từ đầu, dữ liệu giả nạp bằng `npm run db:seed`. Mỗi đợt kết thúc bằng **điểm dừng**: đưa bản thử lên Vercel + checklist để người dùng test và góp ý, rồi mới sang đợt sau. Số Task đánh liên tục cho cả dự án.

| Đợt | Nội dung | Task | File | Tiến độ (16/11/2026) |
|---|---|---|---|---|
| 1 | Nền tảng: đăng nhập, phân quyền, người dùng, cơ sở/phòng, cài đặt, loại phí, đơn giá, lưu file, khách thuê, nhắc visa | 1, 2, 3, 5, 6, 7, 7b | [dot-1](2026-11-16-dot-1-nen-tang.md) | Code xong · điểm dừng: đã chạy trên Supabase + dữ liệu giả; còn e2e, checklist, bản thử Vercel |
| 2 | Mẫu Word, hợp đồng cọc/thuê, tài sản & kho, điện nước, bàn giao | 8–12 | [dot-2](2026-11-16-dot-2-hop-dong-tai-san-dien-nuoc.md) | Code xong (làm trước) · điểm dừng chưa làm |
| 3 | Tài chính: lõi tính tiền, phí phát sinh, sổ cọc, hoá đơn, thu tiền, phụ lục gia hạn/chuyển phòng/thanh lý | 4, 13–15 | [dot-3](2026-11-16-dot-3-tai-chinh.md) | Task 4 xong · Task 13–15 chưa làm |
| 4 | Sự cố, nhắc việc đầy đủ, nhập Excel, test toàn hệ thống | 16–19 | [dot-4](2026-11-16-dot-4-su-co-nhac-viec-nhap-excel.md) | Chưa làm |
| 5 | Chạy thật: PDF/ảnh, R2 + tự xoá ảnh, sao lưu Drive, xoá dữ liệu giả | 20–23 | [dot-5](2026-11-16-dot-5-chay-that.md) | Chưa làm |

Kế hoạch các đợt sau có thể được chỉnh lại theo góp ý ở điểm dừng của đợt trước.

## Tiến độ

- **16/11/2026:** Nhánh `claude/superpowers-executing-plans-phase-1-728325` đã merge vào `main` (commit `f2a8a22`): Task 1, 2, 3, 4, 5, 6, 7, 7b, 8–12. Kiểm tra: 242/242 test đạt, `tsc` sạch, lint 0 lỗi (8 cảnh báo), build OK. Đã migrate + nạp dữ liệu giả lên Supabase `siris-pms`, đăng nhập thử Admin thành công.
- **Việc kế tiếp — hoàn tất điểm dừng đợt 1 & 2:** script seed tự tạo bucket `siris`; e2e Playwright các luồng đợt 1–2; checklist `docs/review/dot-1-checklist.md`, `dot-2-checklist.md`; triển khai bản thử lên Vercel; gỡ thư viện thừa `zustand`, `idb-keyval`; người dùng test và góp ý. Sau đó mới làm Task 13–15 (đợt 3).

## Ghi chú môi trường (rút ra khi chạy thật)

- Project Supabase dùng cho web: **siris-pms** (`giwatdbtmctydtiststh`, ap-south-1). Project "Siris" cũ là của app khác, không dùng.
- `DATABASE_URL` phải dùng **Session pooler** (`aws-1-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>`); địa chỉ `db.<ref>.supabase.co` chỉ có IPv6, máy không kết nối được.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` nhận được cả publishable key mới (`sb_publishable_…`); `SUPABASE_SERVICE_ROLE_KEY` nhận được cả secret key mới (`sb_secret_…`).
- Supabase Storage cần bucket riêng tư `siris` trước khi seed (hiện tạo tay — sẽ đưa vào script).
