# Kế hoạch triển khai Siris

Spec: [../specs/2026-11-16-quan-ly-khach-thue-design.md](../specs/2026-11-16-quan-ly-khach-thue-design.md)

Từ 16/11/2026 chỉ còn hai plan, làm theo thứ tự:

| # | Plan | Nội dung | Tiến độ (16/11/2026) |
|---|---|---|---|
| 1 | [Chức năng](2026-11-16-chuc-nang.md) | Mọi chức năng nghiệp vụ (đợt 1–4 cũ, xuất PDF/ảnh, tăng tốc chuyển trang), danh sách test có tick, kiểm tra cuối và người dùng duyệt | Task 1–13, 4b, tăng tốc xong · Task 14, 15 đang làm · Task 16, 17, 20 chưa làm · Task 18 làm một phần |
| 2 | [Lưu trữ và chạy thật](2026-11-16-luu-tru.md) | Chuyển file sang R2, tự xoá ảnh sau thanh lý, sao lưu Google Drive, xoá dữ liệu giả, chuyển sang dữ liệu thật | Task 22 (sao lưu) đã cài, chưa chạy thử khôi phục · còn lại làm sau khi người dùng duyệt plan 1 |

Số Task giữ như cũ cho cả dự án. Các plan đợt 1–5, kế hoạch kiểm thử tổng thể và kế hoạch tăng tốc đã được gộp vào hai file trên; bản cũ xem trong lịch sử git (commit trước `docs: tách plan lưu trữ, gộp plan chức năng`).

## Tiến độ

- **16/11/2026:** Task 1–12 merge vào `main` (`f2a8a22`); 242/242 test đạt. Đã migrate + nạp dữ liệu giả lên Supabase `siris-pms`.
- **16/11/2026:** e2e + checklist đợt 1 (`4d71407`); seed tự tạo bucket `siris` (`8c09af0`).
- **16/11/2026 — rà soát plan với spec:** thêm Task 12b và 4b; sửa Task 13–15, 18, 21.
- **16/11/2026:** Task 12b, điểm dừng đợt 1 và 2 hoàn thành theo xác nhận của người dùng; seed chạy thêm dần (không cần `--reset`).
- **16/11/2026:** tăng tốc chuyển trang (getClaims, cache, loading, Vercel `bom1`) đã triển khai; Preview trung vị 409 ms, chưa đo `_rsc`.
- **16/11/2026:** Task 4b, 13 xong (`f352374`, `a950290`); Task 14, 15 đang làm trên nhánh `my-plan-3`.
- **16/11/2026 — tách plan:** theo yêu cầu người dùng, tách phần lưu trữ ra plan riêng và gộp mọi plan chức năng thành một file có danh sách test, để test chức năng trước.

## Ghi chú môi trường

- Project Supabase dùng cho web: **siris-pms** (`giwatdbtmctydtiststh`, ap-south-1). Project "Siris" cũ là của app khác, không dùng.
- `DATABASE_URL` phải dùng **Session pooler** (`aws-1-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>`); địa chỉ `db.<ref>.supabase.co` chỉ có IPv6, máy không kết nối được.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` nhận được cả publishable key mới (`sb_publishable_…`); `SUPABASE_SERVICE_ROLE_KEY` nhận được cả secret key mới (`sb_secret_…`).
- Supabase Storage cần bucket riêng tư `siris`; `npm run db:seed` tự tạo nếu chưa có.
