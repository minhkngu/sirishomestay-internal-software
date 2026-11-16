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
