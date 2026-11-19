# Kế hoạch triển khai Siris

Spec nền: [Quản lý khách thuê](../specs/2026-11-16-quan-ly-khach-thue-design.md), [Ổn định app, hoá đơn PDF, giao diện](../specs/2026-11-17-on-dinh-giao-dien-hoa-don-pdf-design.md). Spec từng tính năng nằm trong `../specs/`.

Plan làm xong thì xoá khỏi thư mục này (lần gần nhất: 19/11/2026); xem lại trong lịch sử git. Ghi chú môi trường ở [docs/operations/supabase.md](../../operations/supabase.md).

## Plan đang mở

| Plan | Nội dung | Tiến độ (17/11/2026) |
|---|---|---|
| [Lưu trữ và chạy thật](2026-11-16-luu-tru.md) | Chuyển file sang R2, tự xoá ảnh sau thanh lý, sao lưu Google Drive, xoá dữ liệu giả, chuyển sang dữ liệu thật | Task 22 (sao lưu) đã cài, chưa thử khôi phục. Phần còn lại làm sau khi người dùng duyệt chức năng. |
| [Chuẩn hoá repo](2026-11-19-chuan-hoa-repo.md) | Chuẩn hoá repo (Prettier, CI, lint) và chuyển sang Modular Monolith — 22 task, mỗi task một PR xếp chồng | Đã làm đủ 22 task (20/11/2026), chờ merge |

## Việc còn lại trước khi người dùng duyệt

- [ ] Xác nhận xuất PDF và ảnh hoá đơn, phiếu thu trên bản preview mới nhất (sau commit `391ec48` đóng gói `pdfkit` và `@napi-rs/canvas`).
- [ ] Chạy lại toàn bộ e2e (`node scripts/e2e-preflight.mjs` trước), xác nhận tất cả đạt.
- [ ] Đo tốc độ chuyển trang trên bản production (`npm run test:perf`). Ghi kết quả vào `docs/operations/toc-do.md`.
- [ ] `npm run db:migrate && npm run db:seed` trên Supabase dev (không `--reset`), deploy bản thử.
- [ ] Gửi link bản thử và [checklist duyệt](../../review/checklist.md) cho người dùng. Mỗi góp ý sửa trong một commit `fix:` riêng.
