# Sửa phí hợp đồng và chỉ số đầu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Theo `CLAUDE.md`: viết/cập nhật test nhưng **không chạy** test, lint, build cho tới khi chuẩn bị PR; kiểm giao diện bằng dev server. Commit tiếng Việt, `feat:`/`fix:`.

**Goal:** Popup "Chỉnh sửa hợp đồng" hiện đầy đủ phí như form tạo, sửa được đồng hồ và chỉ số đầu; trang Chỉ số và biên bản bàn giao lấy số theo hợp đồng/hoá đơn, không tự đổi hoá đơn đã lập.

**Architecture:** Giữ nguyên bảng dữ liệu: chỉ số đầu vẫn là dòng `meter_readings` loại `handover` do `ensureFeeMeter` tạo khi lập hợp đồng. Thêm hàm dùng chung chọn "chỉ số đầu của phí" (lần chốt sớm nhất từ ngày bắt đầu hợp đồng), hàm sửa đồng hồ/chỉ số trong transaction của `updateLease`, và sửa cách hiển thị của trang Chỉ số. Biên bản bàn giao bỏ hẳn phần chỉ số.

**Tech Stack:** Next.js server actions, Drizzle, zod, `MoneyInput`, `BareSelect`, PGlite integration tests.

**Spec:** `docs/superpowers/specs/2026-11-22-sua-phi-hop-dong-design.md`

## Global Constraints

- Kiến trúc N-Layer: `server` được import `db`, `domain`, `lib`; `features` không import `db`. Một feature không import feature khác.
- Quyền: sửa phí cần `tenants_contracts` của toà; sửa đồng hồ/chỉ số cần thêm `meters`. Không thêm quyền mới.
- Không đổi cách tính tiền, không tự sửa hoá đơn đã lập. Hoá đơn lập lại sau khi sửa thì dùng số mới.
- Tiền hiển thị `formatVND`, nhập bằng `MoneyInput`; menu chọn dùng `Select`/`BareSelect` của app, không dùng `<select>` native cho menu nổi.
- Giao diện, chú thích, commit tiếng Việt; tiêu đề commit ≤ 72 ký tự.
- Không sửa tay file trong `drizzle/`; lần này không có migration.
- Theo `CLAUDE.md`: chỉ chạy `npm test`, `npm run lint`, `npm run build`, e2e khi chuẩn bị PR; trong lúc làm kiểm bằng dev server.

## Review Focus

- Hợp đồng đã có hoá đơn: sửa chỉ số không được làm đổi hoá đơn cũ; xoá và lập lại mới dùng số mới (Task 2, 4).
- Đổi sang đồng hồ phòng khác, đồng hồ đã gỡ, hoặc đồng hồ đang gắn phí hợp đồng khác → phải chặn (Task 2).
- Chỉ số âm, nhỏ hơn lần chốt trước, lớn hơn lần chốt sau, hoặc trước ngày lắp đồng hồ → phải chặn (Task 2).
- Người chỉ có quyền hợp đồng (không có `meters`) vẫn sửa được đơn giá nhưng không thấy/gửi được đồng hồ, chỉ số; server từ chối nếu cố gửi (Task 2, 3, 4).
- Hợp đồng bắt đầu giữa tháng: bảng Chốt tháng và Lịch sử phải hiện số đầu 1.250, dòng bàn giao đầu hợp đồng 1.250 → 1.250 (Task 1, 5).
- Mẫu biên bản cũ còn `@bang:chi_so` hoặc khối chỉ số: in ra bảng rỗng, không lỗi (Task 6).

---

### Task 1: Chỉ số đầu của phí — một nguồn dùng chung

**Files:**
- Modify: `src/server/meters/service.ts:418-427` (`listLeaseMeterInitials`)
- Modify: `src/server/invoices/service.ts:693-706` (`buildMeterPanels`: `initialOf`, `openingRow`)
- Test: `tests/integration/meters.test.ts` (thêm describe/nhóm test mới)

**Interfaces:**
- Produces: `type LeaseMeterInitial = { meterId: string; meterCode: string | null; value: number; readOn: string; readingId: string | null }`
- Đổi kiểu trả về: `listLeaseMeterInitials(db, ctx, leaseId): Promise<Record<string, LeaseMeterInitial>>` (khoá là `leaseFeeId`). Người không có quyền `meters` vẫn nhận `{}`.
- Quy tắc: chỉ số đầu = lần chốt `handover` **sớm nhất** của đồng hồ đang gắn có `readOn >= leases.startDate`; không có thì `meters.startReading`/`installed_on`, `readingId = null`.
- Consumers hiện có: `src/app/(app)/contracts/contract-detail.tsx:359` chỉ đọc `value`, `readOn`, `meterCode` — giữ nguyên các trường này.

- [ ] Viết test `listLeaseMeterInitials`: hợp đồng bắt đầu `2026-10-15`, đồng hồ có chốt cũ `2025-01-01 = 500` và chốt `2026-10-15 = 1250`; phí gắn đồng hồ. Kỳ vọng `{ meterId, value: 1250, readOn: '2026-10-15', readingId: <id dòng chốt> }`, bỏ qua chốt 2025.
- [ ] Viết test không quyền `meters` → `{}`.
- [ ] Viết test panel hoá đơn: đồng hồ có chốt cũ 500 (2025) và chốt hợp đồng 1250 (2026-01-01), `getInvoiceDetail`/`buildMeterPanels` hiện `initial.value = 1250`, không lấy 500.
- [ ] Cài đặt: lấy `leases.startDate`, thêm `leaseFeeMeters.meterId` và `meterReadings.id` vào truy vấn; chọn `handovers.find(x => x.meterId === link.meterId && x.readOn >= startDate)`.
- [ ] Sửa `buildMeterPanels`: `initialOf` và nhánh fallback `handovers` của `openingRow` chỉ lấy chốt có `readOn >= leaseRow.startDate`.
- [ ] Commit `feat: chỉ số đầu hợp đồng lấy từ chốt sau ngày bắt đầu`.

### Task 2: Sửa đồng hồ và chỉ số đầu khi lưu hợp đồng

**Files:**
- Modify: `src/server/meters/service.ts` (thêm `updateLeaseFeeMeter`)
- Modify: `src/server/contracts/service.ts:370-372` (`LeaseEditInput` chú thích), `:382-409` (`applyLeaseFeeEdits`), `:411-436` (`updateLease` truyền `input.startDate`)
- Test: `tests/integration/contract-edit-delete.test.ts`; `tests/integration/invoices.test.ts` (test hoá đơn lập lại)

**Interfaces:**
- Produces: `updateLeaseFeeMeter(tx: DB, ctx: AccessContext, input: { leaseId: string; leaseFeeId: string; roomId: string; meterId: string; initialReading: number; startDate: string }): Promise<void>`.
- `applyLeaseFeeEdits(tx, ctx, leaseId, edits, roomId, startDate)` — thêm tham số `startDate`.
- `LeaseEditInput.fees[]` giữ nguyên hình dạng: `{ leaseFeeId?, feeTypeId?, unitPrice, initialReading?, existingMeterId? }`. Với dòng có `leaseFeeId`, nếu có `existingMeterId`/`initialReading` thì gọi `updateLeaseFeeMeter`; thiếu một trong hai → `ValidationError` tương ứng "Chọn đồng hồ…"/"Nhập chỉ số…".
- Audit: entity `meter_readings` khi sửa chỉ số, entity `meter` khi đổi liên kết; summary tiếng Việt.

Quy tắc của `updateLeaseFeeMeter`:
- Phí phải thuộc hợp đồng và có `quantitySource = 'meter'`; phòng lấy theo `roomId` của hợp đồng sau khi sửa.
- `assertCan(ctx, 'meters', room.facilityId)` → thiếu quyền là `ForbiddenError`.
- Đồng hồ phải cùng phòng, `removedOn` null; bận = đang gắn phí của hợp đồng **đang chạy khác** (trừ chính phí này) → `ValidationError`.
- Ngày chốt: lần chốt `handover` sớm nhất của đồng hồ hiện tại có `readOn >= startDate`; không có thì `startDate`.
- `initialReading` nguyên, `0..2_147_483_647`; không trước `meters.installedOn`; không nhỏ hơn lần chốt liền trước ngày chốt; không lớn hơn lần chốt liền sau ngày chốt; nếu đã có chốt `handover` cùng ngày ở đồng hồ mới thì phải trùng giá trị.
- Cùng đồng hồ: cập nhật dòng chốt đang dùng; không có dòng chốt (dữ liệu cũ) thì cập nhật `meters.startReading`.
- Đổi đồng hồ: cập nhật `lease_fee_meters.meterId`, ghi/khớp dòng chốt cho đồng hồ mới tại ngày chốt cũ; giữ dòng chốt của đồng hồ cũ làm lịch sử.
- Không đụng `invoices`, `invoice_lines`, `payments`.

- [ ] Test: tạo hợp đồng có phí Điện chỉ số đầu 1.250 (đồng hồ sẵn của phòng), sửa thành 1.300 → dòng `meter_readings` = 1.300, có audit `meter_readings`; đơn giá không đổi vẫn giữ.
- [ ] Test: chặn số âm; chặn nhỏ hơn chốt trước (thêm chốt 500 trước ngày bắt đầu, sửa 400); chặn lớn hơn chốt sau (thêm chốt tháng 1.290, sửa 1.300); chặn trước `installedOn`.
- [ ] Test: đổi sang đồng hồ khác cùng phòng → `lease_fee_meters` đổi, có chốt 1.250 cùng ngày cho đồng hồ mới; chặn đồng hồ phòng khác; chặn đồng hồ đang gắn phí hợp đồng đang chạy khác.
- [ ] Test: người chỉ có `tenants_contracts` sửa đơn giá được; gửi kèm `existingMeterId`/`initialReading` → `ForbiddenError`.
- [ ] Test hoá đơn: hợp đồng bắt đầu 2026-01-01, phí Điện đầu 1.250, chốt tháng 1 = 1.300, tạo hoá đơn nháp kỳ 2026-02 → dòng Điện = 50; sửa chỉ số đầu thành 1.280; hoá đơn cũ vẫn 50; xoá hoá đơn, tạo lại → 20.
- [ ] Cài đặt `updateLeaseFeeMeter`; `applyLeaseFeeEdits` gọi khi dòng cũ có trường đồng hồ; `updateLease` truyền `input.startDate`.
- [ ] Commit `feat: sửa đồng hồ và chỉ số đầu của phí hợp đồng`.

### Task 3: Dữ liệu cho popup sửa hợp đồng

**Files:**
- Modify: `src/server/contracts/actions.ts:124-146` (`feeData` trong `quickContractDataAction`)
- Test: phủ qua Task 2 (server) và Task 4 (e2e); không cần test riêng cho action.

**Interfaces:**
- `FeeData.current[]` thêm: `quantitySource: 'occupants' | 'room' | 'meter' | 'period_input' | 'legacy_fixed'`, `quantity: number`, `meterId: string | null`, `meterLabel: string | null`, `opening: { readingId: string | null; value: number; readOn: string } | null`.
- `FeeData` thay `meterSupported` (đang không dùng) bằng `canEditMeters: boolean`; bỏ `locked` khỏi `current` (dùng `quantitySource === 'meter'`).
- `roomMeters` giữ `{ id, label, busy }`; đổi nghĩa `busy` = đồng hồ đang gắn phí của **hợp đồng đang chạy khác** (loại trừ chính hợp đồng này) để popup chọn lại được đồng hồ cũ trong cùng phiên.
- Nguồn: `listLeaseMeterInitials` (Task 1) + `leaseFeeMeters` của hợp đồng + `meterRows` sẵn có; `canEditMeters = can(ctx, 'meters', l.facilityId)`.

- [ ] Sửa truy vấn `busyRows` thêm `ne(leases.id, l.id)`.
- [ ] Lấy `links` (`leaseFeeId → meterId`) bằng `leaseFeeMeters` join `leaseFeeSnapshots` theo `leaseId`.
- [ ] Map `current` từ `l.fees`: `opening` lấy theo `initials[f.leaseFeeId]`, `meterLabel` lấy từ `meterRows`; không có quyền `meters` thì `meterId = null`, `meterLabel = null`, `opening = null` (không lộ đồng hồ/chỉ số cho người chỉ có quyền hợp đồng).
- [ ] Commit `feat: dữ liệu chỉ số cho popup sửa hợp đồng`.

### Task 4: Khối phí trong popup sửa

**Files:**
- Modify: `src/features/contracts/components/contract-edit-actions.tsx:37` (`FeeData`), `:64-70` (state phí), `:115-131` (lưu), `:247-262` (khối phí), `:287-321` (dialog thêm phí theo đồng hồ)
- Create: `src/features/contracts/fee-source-label.ts`
- Modify: `src/features/contracts/components/lease-fees.tsx:15-20` (dùng nhãn chung)
- Test: `tests/e2e/contract-edit-fees.spec.ts` (mới — chỉ viết)

**Interfaces:**
- `export const FEE_SOURCE_LABEL: Record<'occupants' | 'room' | 'meter' | 'period_input' | 'legacy_fixed', string>` = `Theo số người ở`, `Theo phòng`, `Theo đồng hồ`, `Nhập số lượng mỗi kỳ`, `Số lượng cố định`.
- State một dòng phí trong popup: `{ key: string; leaseFeeId: string | null; feeTypeId: string | null; name: string; unit: string; quantitySource: FeeData['current'][number]['quantitySource']; quantity: number; price: string; meterId: string; initialReading: string; openingReadOn: string | null; draft?: Record<string, unknown> }`.
- Gửi lên: `{ leaseFeeId, feeTypeId, unitPrice: Number(price), ...(quantitySource === 'meter' && canEditMeters && đã đổi ? { existingMeterId: meterId || undefined, initialReading: Number(initialReading) } : {}) }`.
- "Đã đổi" = `meterId !== (row.meterIdBanĐầu ?? '')` hoặc `initialReading !== String(opening?.value ?? '')`. Lưu lại giá trị ban đầu trong state (`originalMeterId`, `originalReading`) để so.

Giao diện mỗi dòng (theo `LeaseFees` của form tạo):
- Card `rounded-xl border border-border/70 bg-muted/20 p-3.5`; tiêu đề `tên · đơn vị`, dòng phụ `FEE_SOURCE_LABEL[...]` (kèm `· số lượng {quantity}` cho `legacy_fixed`).
- Ô `Đơn giá` dùng `MoneyInput` (bỏ `type="number"`).
- Phí theo đồng hồ: `BareSelect` "Đồng hồ" (options: `roomMeters` cùng phòng, loại `busy`, loại đồng hồ đang dùng bởi dòng khác) + `Input` "Chỉ số đầu" (`inputMode="numeric"`) + chữ muted `chốt {formatDateVN(openingReadOn)}` nếu có.
- Không có `canEditMeters`: hiện chữ `Đồng hồ {meterLabel ?? '—'}` và `Chỉ số đầu {opening?.value ?? '—'}` thay cho ô nhập.
- Phí theo đồng hồ không có nút Xoá; phí khác giữ nút Xoá.
- Dưới khối, thêm ghi chú: `Hoá đơn đã lập giữ nguyên số cũ. Muốn áp dụng chỉ số mới, xoá hoá đơn tháng đầu và lập lại.`
- Dialog "Thêm phí" cho phí theo đồng hồ: dùng `meterId`/`initialReading` của dòng mới thay `meterInit`; khi thêm xong dòng hiện đúng giao diện trên và sửa tiếp được trước khi lưu.

- [ ] Viết e2e `contract-edit-fees.spec.ts`: mở danh sách hợp đồng → "Sửa hợp đồng"; thấy `Điện · kWh · Theo đồng hồ`, nhãn đồng hồ, `Chỉ số đầu` 1.250, đơn giá có dấu chấm; đổi chỉ số 1.300, bấm "Lưu thay đổi"; trang chi tiết hiện `Chỉ số đầu 1.300`; thấy ghi chú hoá đơn. Thêm một test đăng nhập Lan (quyền `tenants_contracts`, không có `meters`): vẫn thấy ô đơn giá, không thấy ô "Đồng hồ"/"Chỉ số đầu" để nhập.
- [ ] Cài đặt state/mapping và giao diện như trên; dùng `MoneyInput`, `BareSelect`, `formatDateVN`; bỏ `locked`/`meterSupported` khỏi `FeeData`.
- [ ] Kiểm bằng dev server: hợp đồng có phí Điện/Nước; sửa chỉ số và đồng hồ; lưu; mở lại thấy đúng; thử tài khoản không có quyền `meters` chỉ thấy số, vẫn sửa được đơn giá.
- [ ] Commit `feat: popup sửa hợp đồng hiện và sửa chỉ số đầu`.

### Task 5: Trang Chỉ số khớp chuỗi hoá đơn

**Files:**
- Modify: `src/server/meters/service.ts:31-40` (`MeterCell`, `MeterOverviewRow`), `:62-96` (`listReadingSheet`), `:330-360` (`listReadingHistory`)
- Modify: `src/features/meters/components/reading-grid.tsx:80-115,175-235` (nhãn số đầu), `src/features/meters/components/reading-history.tsx:87,160` (bỏ câu "đứng riêng", dialog sửa dùng `kind === 'handover'` thay vì `opening == null`)
- Test: `tests/integration/meters.test.ts`

**Interfaces:**
- `MeterCell` thêm `previousReadOn: string`, `previousKind: 'monthly' | 'handover' | 'start'`.
- `MeterOverviewRow` thêm `leaseStartDate: string | null` (ngày bắt đầu của hợp đồng đang chạy gắn đồng hồ).
- `ReadingHistoryRow` giữ nguyên hình dạng; `opening`/`usage` không còn null cho dòng chốt.

Quy tắc:
- `previous` = chỉ số của lần chốt gần nhất (tháng hoặc bàn giao) có `readOn <= cuối kỳ`, **trừ** dòng chốt tháng của chính kỳ đang ghi; không có thì `active.startReading` + `active.installedOn`, kind `start`.
- `usage` của ô ghi: nếu không thay đồng hồ trong kỳ (`replaced = false`) thì `current == null ? null : Math.max(current - previous, 0)`; nếu `replaced = true` giữ `safeUsage(...)` như hiện tại (cộng phần đồng hồ cũ).
- Lịch sử: dòng `handover` có `readOn === leaseStartDate` (chốt đầu hợp đồng) → `opening = closing`, `usage = 0`; các dòng khác → `opening = prev`, `usage = Math.max(closing - prev, 0)`.
- Nhãn bảng ghi: "Số đầu kỳ" kèm ngày chốt thực tế (`chốt 21/11`), không ghi cứng "chốt tháng trước".
- Bỏ câu "chỉ số bàn giao đứng riêng (không có số đầu, mức dùng)" ở đầu bảng Lịch sử.

- [ ] Test bảng ghi: hợp đồng bắt đầu `2026-10-15`, chốt bàn giao 1.250, chốt tháng `2026-10-31 = 1.300` → ô Điện `previous: 1250, previousReadOn: '2026-10-15'`, `current: 1300`, `usage: 50`.
- [ ] Test lịch sử: hai dòng `[['monthly', 1250, 1300, 50], ['handover', 1250, 1250, 0]]` (mới nhất trước).
- [ ] Test không hồi quy thay đồng hồ giữa kỳ: giữ nguyên kỳ vọng `usage: 105, replaced: true` ở test hiện có.
- [ ] Cài đặt service + nhãn giao diện; ô "—" chỉ còn khi thật sự không có dữ liệu.
- [ ] Commit `fix: trang chỉ số hiện đúng số đầu khi hợp đồng bắt đầu giữa tháng`.

### Task 6: Biên bản bàn giao bỏ chỉ số đồng hồ

**Files:**
- Modify: `src/features/handovers/components/handover-form.tsx:1-50` (bỏ `meters`, state `readings`, khối "Chỉ số đồng hồ", `meterReadings` trong payload)
- Modify: `src/app/(app)/handovers/[id]/page.tsx:26,32` (bỏ `readByMeter`, prop `meters`)
- Modify: `src/server/handovers/service.ts:55-73` (`getHandover`), `:78-107` (`HandoverSave`, `saveHandover`), `:144-164` (doc loader)
- Modify: `src/server/templates/defaults.ts:110-130` (bỏ hai bài "Chỉ số điện, nước")
- Test: `tests/integration/handovers.test.ts`

**Interfaces:**
- `HandoverSave = { items: { id; condition?; note?; damaged?; missing?; penalty? }[] }` — bỏ `meterReadings`.
- `getHandover` không còn `meters`, `readings`.
- `HandoverForm` props bỏ `meters`.
- `template-fields` giữ `handover.readings` (mẫu cũ dùng `@bang:chi_so` in bảng rỗng); doc loader không truyền `readings`.

- [ ] Cập nhật test: bỏ hai test "chỉ số đồng hồ nhập ở bàn giao…" và "biên bản gọi đồng hồ theo tên phí…"; thêm test `getHandover` không có `readings`/`meters`.
- [ ] Thêm test `tests/unit/domain/template-fields.test.ts`: `buildTemplateData('handover_check_in', { handover: { date, items: [], readings: undefined } })` → `chi_so: []`, không ném lỗi (mẫu cũ có `@bang:chi_so` in bảng rỗng).
- [ ] Bỏ `meterReadings` khỏi mọi lời gọi `saveHandover` trong `tests/integration/handovers.test.ts`.
- [ ] Cài đặt form, trang, service, mẫu mặc định.
- [ ] Kiểm dev server: mở một biên bản check-in/check-out → không còn khối "Chỉ số đồng hồ"; hoàn tất được; in thử mẫu cũ có `@bang:chi_so` → bảng rỗng, không lỗi.
- [ ] Commit `feat: biên bản bàn giao bỏ chỉ số đồng hồ`.

### Task 7: Kiểm tra trước PR

**Files:** không thêm; cập nhật e2e nếu nhãn đổi.

- [ ] `npm test` — toàn bộ unit/integration đạt.
- [ ] `npm run lint` — không lỗi, `eslint-plugin-boundaries` đạt.
- [ ] `npm run build` — build đạt.
- [ ] `node scripts/e2e-preflight.mjs`, rồi `E2E_BASE_URL=… npm run test:e2e` — đạt, gồm `chi-so.spec.ts` và `contract-edit-fees.spec.ts`.
- [ ] Rà lại `docs/superpowers/specs/2026-11-22-sua-phi-hop-dong-design.md`: mọi mục có task tương ứng; ghi chú kết quả vào PR.
