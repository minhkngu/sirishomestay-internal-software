# Kế hoạch triển khai Siris

Spec:
- [Quản lý khách thuê](../specs/2026-11-16-quan-ly-khach-thue-design.md): toàn bộ nghiệp vụ.
- [Ổn định app, hoá đơn PDF, giao diện](../specs/2026-11-17-on-dinh-giao-dien-hoa-don-pdf-design.md)

Các plan đã làm xong (chức năng, kiểm thử tổng thể, ổn định / hoá đơn PDF / giao diện Bạc hà) đã được xoá khỏi thư mục này ngày 17/11/2026. Muốn xem lại thì tìm trong lịch sử git.

## Plan đang mở

| Plan | Nội dung | Tiến độ (17/11/2026) |
|---|---|---|
| [Lưu trữ và chạy thật](2026-11-16-luu-tru.md) | Chuyển file sang R2, tự xoá ảnh sau thanh lý, sao lưu Google Drive, xoá dữ liệu giả, chuyển sang dữ liệu thật | Task 22 (sao lưu) đã cài, chưa thử khôi phục. Phần còn lại làm sau khi người dùng duyệt chức năng. |

## Việc còn lại trước khi người dùng duyệt

- [ ] Xác nhận xuất PDF và ảnh hoá đơn, phiếu thu trên bản preview mới nhất (sau commit `391ec48` đóng gói `pdfkit` và `@napi-rs/canvas`).
- [ ] Chạy lại toàn bộ e2e (`node scripts/e2e-preflight.mjs` trước), xác nhận tất cả đạt.
- [ ] Đo tốc độ chuyển trang trên bản production. Ghi kết quả vào `docs/operations/toc-do.md`.
- [ ] `npm run db:migrate && npm run db:seed` trên Supabase dev (không `--reset`), deploy bản thử.
- [ ] Gửi link bản thử và [checklist duyệt](../../review/checklist.md) cho người dùng. Mỗi góp ý sửa trong một commit `fix:` riêng.

## Ghi chú môi trường

- Project Supabase dùng cho web là **siris-pms** (`giwatdbtmctydtiststh`, ap-south-1). Project "Siris" cũ thuộc app khác, không dùng.
- `DATABASE_URL` (máy local và Vercel) dùng **Transaction pooler**: `aws-1-ap-south-1.pooler.supabase.com:6543`, user `postgres.<ref>`.
  - Không dùng Session pooler (cổng 5432): nhiều instance Vercel sẽ làm hết 15 chỗ và báo `EMAXCONNSESSION`.
  - Địa chỉ `db.<ref>.supabase.co` chỉ có IPv6, máy không kết nối được.
- Supavisor treo khi nhận nhiều truy vấn gửi dồn trên một kết nối. Vì vậy `src/db/client.ts` phải giữ `max_pipeline: 1` và `query_timeout`; test ở `tests/integration/db-pooler-hang.test.ts`.
- Role `postgres` có `transaction_timeout = 60s`: kết nối nào kẹt quá 60 giây sẽ bị cắt. Migration dài hơn 60 giây phải tạm nâng giới hạn này.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` nhận được cả publishable key mới (`sb_publishable_…`). `SUPABASE_SERVICE_ROLE_KEY` nhận được cả secret key mới (`sb_secret_…`).
- Supabase Storage cần bucket riêng tư `siris`. `npm run db:seed` tự tạo nếu chưa có.
