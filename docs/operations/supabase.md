# Ghi chú môi trường Supabase

- Project Supabase dùng cho web là **siris-pms** (`giwatdbtmctydtiststh`, ap-south-1). Project "Siris" cũ thuộc app khác, không dùng.
- `DATABASE_URL` (máy local và Vercel) dùng **Transaction pooler**: `aws-1-ap-south-1.pooler.supabase.com:6543`, user `postgres.<ref>`.
  - Không dùng Session pooler (cổng 5432): nhiều instance Vercel sẽ làm hết 15 chỗ và báo `EMAXCONNSESSION`.
  - Địa chỉ `db.<ref>.supabase.co` chỉ có IPv6, máy không kết nối được.
- Supavisor treo khi nhận nhiều truy vấn gửi dồn trên một kết nối. Vì vậy `src/db/client.ts` phải giữ `max_pipeline: 1` và `query_timeout`; test ở `tests/integration/db-pooler-hang.test.ts`.
- Role `postgres` có `transaction_timeout = 60s`: kết nối nào kẹt quá 60 giây sẽ bị cắt. Migration dài hơn 60 giây phải tạm nâng giới hạn này.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` nhận được cả publishable key mới (`sb_publishable_…`). `SUPABASE_SERVICE_ROLE_KEY` nhận được cả secret key mới (`sb_secret_…`).
- Supabase Storage cần bucket riêng tư `siris`. `npm run db:seed` tự tạo nếu chưa có.
