# Siris — Web quản lý khách thuê dài hạn

Web nội bộ quản lý cơ sở, phòng, khách thuê. Thiết kế: `docs/superpowers/specs/`, kế hoạch: `docs/superpowers/plans/`.

## Chạy

```bash
cp .env.example .env.local   # điền biến môi trường
npm install
npm run dev                  # http://localhost:3000
npm test                     # Vitest + PGlite (không cần Docker)
```

Biến môi trường: xem `.env.example`.

## Cloudflare R2 (ảnh giấy tờ)

Tạo bucket riêng tư, tạo API token (Object Read & Write) rồi điền `R2_*` trong `.env.local`.
Bucket cần cấu hình CORS để trình duyệt tải ảnh lên trực tiếp bằng URL ký:

```json
[{ "AllowedOrigins": ["http://localhost:3000", "https://<tên-miền-app>"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

Khi thiếu biến `R2_*`, app dùng adapter bộ nhớ (chỉ để chạy thử, ảnh không được lưu).
