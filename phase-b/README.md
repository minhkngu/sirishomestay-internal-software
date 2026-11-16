# Phase B — phần gắn cơ sở dữ liệu (tạm cất)

Đây là bản triển khai "đợt 1" đã làm trước khi kế hoạch đổi thứ tự: dùng Postgres thật (Drizzle + Supabase Auth), server actions, ảnh giấy tờ ở Cloudflare R2.
Giai đoạn A (giao diện dữ liệu giả) thay thế các màn hình bằng `MockRepo`, nên phần này được **cất ở đây, không bị biên dịch** (`tsconfig`, ESLint, Vitest đều bỏ qua `phase-b/`).

Khi viết lại kế hoạch giai đoạn B: chuyển lại từng file về **cùng đường dẫn tương đối** (bỏ tiền tố `phase-b/`).
Các hàm dùng chung đã chuyển sang `src/domain/` (xem bảng), cần đổi import `@/lib/...` → `@/domain/...`.

| Cũ (đợt 1) | Hiện ở |
|---|---|
| `src/lib/{phone,dates,text,money,access}.ts` | `src/domain/` (dùng chung, đang dùng ở giai đoạn A) |
| `src/lib/image/compress.ts` | `src/lib/image.ts` |
| `src/features/import/parse.ts` | `src/lib/excel.ts` |
| `src/features/{tenants,rooms,facilities,users}/schemas.ts`, `src/features/import/{targets,validate}.ts` | giữ nguyên chỗ cũ (zod schema dùng chung cho form và nhập Excel) |
| `src/db`, `drizzle/`, `drizzle.config.ts`, `scripts/seed-admin.ts` | `phase-b/` |
| `src/features/*/{service,actions,queries,documents,mask}.ts`, `import/run.ts` | `phase-b/` (sẽ thành `SupabaseRepo` + server actions) |
| `src/lib/{session,audit,action-result,or-not-found,zod-errors,storage,supabase}` | `phase-b/` |
| `src/proxy.ts`, `src/app/(auth)`, `src/app/api/files` | `phase-b/` |
| `src/app/(app)/**` và `src/features/*/components/**` (màn hình gọi server action) | `phase-b/` (giai đoạn A viết lại bằng `useRepo()`) |
| `tests/integration`, `tests/helpers`, `tests/e2e/smoke.spec.ts` | `phase-b/tests/...` |
| `.github/workflows/backup.yml`, `docs/operations/backup-restore.md` | giữ nguyên (độc lập với giai đoạn) |

Ghi chú chuyển sang giai đoạn B (từ review đợt 1, các mục "Deferred minors" và rulings) nằm trong lịch sử git của nhánh này.
