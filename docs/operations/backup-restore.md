# Sao lưu và khôi phục cơ sở dữ liệu

Supabase gói Free **không có sao lưu tự động**. Workflow `.github/workflows/backup.yml` chạy mỗi đêm lúc 2h sáng (giờ Việt Nam): `pg_dump` (schema `public` và `auth`, để giữ cả tài khoản đăng nhập) rồi tải lên Google Drive, giữ **30 bản** gần nhất (`siris-backup-YYYY-MM-DD.dump`).
Chỉ sao lưu cơ sở dữ liệu; file ảnh trong Cloudflare R2 không được sao lưu ra Drive.

## 1. Thiết lập (làm một lần)

1. **Tạo service account Google**: Google Cloud Console → tạo project → bật *Google Drive API* → *IAM & Admin → Service Accounts* → tạo tài khoản → tab *Keys* → *Add key → JSON* và tải file về.
2. **Tạo thư mục trên Google Drive** (ví dụ `Siris Backup`), chọn *Chia sẻ* và thêm **email của service account** (dạng `...@...iam.gserviceaccount.com`) với quyền **Người chỉnh sửa**. Lấy `FOLDER_ID` từ URL thư mục: `https://drive.google.com/drive/folders/<FOLDER_ID>`.
3. **Chuỗi kết nối Supabase**: Project Settings → Database → *Connection string* → chọn **Session pooler** (hoặc Direct connection nếu có IPv6), thay `[YOUR-PASSWORD]` bằng mật khẩu database.
4. Trong GitHub repo: *Settings → Secrets and variables → Actions → New repository secret*, thêm 3 secret:
   - `BACKUP_DATABASE_URL`: chuỗi kết nối ở bước 3.
   - `GDRIVE_SERVICE_ACCOUNT_JSON`: **toàn bộ nội dung** file JSON ở bước 1.
   - `GDRIVE_FOLDER_ID`: `FOLDER_ID` ở bước 2.

> Nếu Supabase nâng major version Postgres, cập nhật số `17` trong workflow cho khớp.

## 2. Chạy tay

GitHub → tab *Actions* → *Sao lưu cơ sở dữ liệu* → *Run workflow*. Kiểm tra file mới xuất hiện trong thư mục Drive.
Khi một bước thất bại, workflow báo lỗi (đỏ) và GitHub gửi email cho chủ repo.

## 3. Khôi phục

Khôi phục vào một **project Supabase mới** (đừng ghi đè project đang chạy khi chưa chắc chắn):

```bash
# tải file .dump từ Google Drive về máy, rồi:
pg_restore --clean --if-exists --no-owner -d "<CHUỖI_KẾT_NỐI_PROJECT_MỚI>" siris-backup-YYYY-MM-DD.dump
```

Sau đó:
1. Cập nhật `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` của app (Vercel) sang project mới.
2. Đăng nhập thử bằng một tài khoản nhân viên (tài khoản được giữ nhờ schema `auth`).
3. Một số cảnh báo về object thuộc Supabase (role, extension) khi `pg_restore` là bình thường; lỗi liên quan tới bảng trong `public` thì không.

## 4. Checklist chạy thử khôi phục (làm trước khi dùng thật)

- [ ] Chạy workflow bằng tay và thấy file `.dump` trong Drive.
- [ ] Tạo một project Supabase tạm, chạy `pg_restore` như trên.
- [ ] Đếm bản ghi: `select count(*) from tenants;`, `rooms`, `facilities`, `auth.users` khớp với bản gốc.
- [ ] Đăng nhập thử vào app trỏ tới project tạm bằng tài khoản thật.
- [ ] Xoá project tạm. Ghi lại ngày chạy thử và người thực hiện.
- [ ] Lặp lại mỗi quý, và sau mỗi lần Supabase nâng phiên bản Postgres.
