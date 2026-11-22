# Kỳ hoá đơn theo dòng tiền phòng — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans để làm từng task. Theo CLAUDE.md: viết test nhưng **không chạy** cho tới khi chuẩn bị PR; kiểm bằng dev server.

**Goal:** Sau khi lưu hoá đơn, kỳ hoá đơn (`period_start`, `period_end`) khớp thời gian dòng tiền phòng, để hoá đơn kế tiếp nối đúng.

**Architecture:** Thêm hàm thuần `rentPeriodOf(lines)` ở `src/domain/invoice-builder.ts`; `updateLines` gọi nó và cập nhật bảng `invoices`.

**Tech Stack:** Drizzle, Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-11-22-ky-hoa-don-theo-tien-phong-design.md`

## Global Constraints
- Service `(db, ctx, input)`; `domain` không import module nào trong `src`.
- Chuỗi giao diện, comment, commit tiếng Việt; commit `fix:`; kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; tiêu đề ≤ 72 ký tự.
- Không đổi giao diện; không sửa dữ liệu cũ hàng loạt.

## Review Focus
- Hoá đơn bổ sung (không có dòng tiền phòng) không bị đổi kỳ.
- Dòng tiền phòng thiếu `meta.from/to` không làm kỳ thành rỗng/`undefined`.
- Hai dòng tiền phòng (nếu có) lấy sớm nhất/muộn nhất.
- Hoá đơn đã duyệt sửa dòng tiền phòng cũng đồng bộ kỳ.

### Task 1: Đồng bộ kỳ hoá đơn khi lưu dòng
**Files:** Modify `src/domain/invoice-builder.ts`, `src/server/invoices/service.ts` (hàm `updateLines`, sau `insert(invoiceLines)` khoảng dòng 590); Test `tests/unit/domain/invoice-builder.test.ts` (nếu chưa có file thì tạo), `tests/integration/invoice-backfill.test.ts`.

**Interfaces:**
- Produces: `rentPeriodOf(lines: Array<{ type: string; meta?: unknown }>): { start: string; end: string } | null` — chỉ xét dòng `type === 'rent'` có `meta.from`, `meta.to` là chuỗi `YYYY-MM-DD`; trả `null` nếu không có dòng nào hợp lệ; start = nhỏ nhất, end = lớn nhất.

- [ ] **Step 1: Viết test unit cho `rentPeriodOf`**: một dòng rent `{from:'2026-11-15',to:'2026-11-30'}` → `{start:'2026-11-15',end:'2026-11-30'}`; hai dòng rent → min/max; không có dòng rent → `null`; rent thiếu `to` → `null`; dòng `fee` có `from/to` bị bỏ qua.
- [ ] **Step 2: Viết test tích hợp** (describe mới trong `invoice-backfill.test.ts`, hợp đồng bắt đầu `2026-11-15`): `createDrafts` kỳ `2026-11` → hoá đơn đầu có `periodEnd` 2026-12-14; lấy dòng rent, gọi `updateLines` giữ nguyên mọi dòng nhưng sửa `meta.to = '2026-11-30'`, `meta.coefficient = 0.5333`; kiểm `invoices.periodEnd = '2026-11-30'` và `periodStart = '2026-11-15'`; rồi `previewNewInvoice` (hoặc `createDrafts`) cho tháng `2026-12` cho kỳ `2026-12-01` – `2026-12-31`. Thêm ca: hoá đơn bổ sung (không có rent) sửa dòng khác thì `periodStart/periodEnd` không đổi.
- [ ] **Step 3: Cài `rentPeriodOf`** trong `src/domain/invoice-builder.ts` theo Interfaces; so sánh chuỗi ISO.
- [ ] **Step 4: Trong `updateLines`**, sau khi ghi dòng: nếu `inv.kind === 'monthly'` và `rentPeriodOf(rows)` khác `null` và khác kỳ hiện tại thì `tx.update(invoices).set({ periodStart, periodEnd, updatedAt })`; mô tả audit thêm "đổi kỳ" khi kỳ đổi, `before/after` kèm kỳ cũ/mới.
- [ ] **Step 5: Kiểm bằng dev server** (không chạy test): mở hoá đơn đầu của hợp đồng giữa tháng, đổi thời gian dòng tiền phòng đến cuối tháng, Lưu; mở hợp đồng, tạo hoá đơn kế tiếp, thấy kỳ bắt đầu ngày 01 tháng sau.
- [ ] **Step 6: Commit** `fix: kỳ hoá đơn theo thời gian dòng tiền phòng`.
