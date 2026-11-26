# Hoàn tiền phòng đã trả trước khi thanh lý — Kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn thanh lý có ô "Tiền phòng đã trả trước" (hoàn theo ngày / hoàn một phần / không hoàn); hoàn theo ngày gồm cả phí cố định đã thu trước.

**Architecture:** Hàm thuần `buildTerminationInvoice` tính các dòng hoàn theo ngày (tiền phòng như cũ, thêm phí cố định) rồi áp lựa chọn; service chỉ parse và kiểm tra trần; wizard thêm một ô chọn cạnh "Mất cọc". Không đổi schema DB (dòng hoá đơn đã được lưu, `finalize.ts` không đọc lựa chọn này).

**Tech Stack:** TypeScript, zod, Vitest (unit + PGlite integration), Playwright, React 19.

**Spec:** `docs/superpowers/specs/2026-11-25-hoan-tien-phong-khi-thanh-ly-design.md`

## Global Constraints

- Commit, comment, chuỗi giao diện viết tiếng Việt; commit theo Conventional Commits.
- Mặc định `by_days`: client không gửi `rentRefund` thì hành vi như cũ.
- Điện nước và phí tính theo đồng hồ không hoàn; "Mất cọc" giữ nguyên, độc lập.
- Hằng số/nhãn mỗi khái niệm một nguồn (`src/modules/leasing/domain/liquidation.ts`); UI chỉ `import` từ `domain` của module.
- Chỉ chạy test khi chuẩn bị PR (CLAUDE.md); các task dưới viết/cập nhật test, bước chạy test thuộc bước cuối.
- Tiền là số nguyên đồng; làm tròn `Math.round` như code hiện có.

## Review Focus

- Khách trả trước nhiều kỳ (2 hoá đơn đã duyệt sau ngày trả): hoàn đủ cả hai, không chỉ kỳ đầu.
- Kỳ trả trước bắt đầu sau ngày trả: hoàn trọn kỳ (tiền phòng và phí cố định).
- Phí đồng hồ (dòng `fee` không có `meta.from`) và hoá đơn nháp không bị hoàn.
- Hoàn một phần: bằng đúng mức tối đa thì được; vượt 1 đồng thì báo lỗi; không có gì để hoàn mà nhập số > 0 thì báo lỗi; số 0 coi như không hoàn.
- Không có gì để hoàn (không kỳ nào vượt ngày trả, hoặc chọn không hoàn) thì hoá đơn thanh lý không có dòng hoàn (đã đổi: không để dòng 0 đồng).
- Client cũ không gửi `rentRefund`: kết quả y như trước.

## Cấu trúc file

- Sửa `src/domain/types.ts`: thêm kiểu `RentRefundInput` cạnh `ForfeitInput`.
- Sửa `src/modules/leasing/domain/liquidation.ts`: logic hoàn, `RENT_REFUND_MODES`, trả thêm `maxRefund`.
- Sửa `src/modules/leasing/server/addenda/service.ts`: `terminationSchema` và kiểm tra trần.
- Sửa `src/modules/leasing/ui/contracts/termination-wizard.tsx`: ô chọn + ô tiền.
- Test: `tests/unit/domain/billing.test.ts`, `tests/integration/addenda.test.ts`, `tests/e2e/addenda.spec.ts`.
- Tài liệu: mục "Hoá đơn thanh lý" của `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md`.

---

### Task 1: Logic hoàn trong `buildTerminationInvoice`

**Files:**
- Modify: `src/domain/types.ts` (cạnh `ForfeitInput`, dòng 148)
- Modify: `src/modules/leasing/domain/liquidation.ts:14-74`
- Test: `tests/unit/domain/billing.test.ts` (trong `describe('buildTerminationInvoice')`, dòng 639-681)

**Interfaces:**
- Produces:
  - `type RentRefundInput = { mode: 'by_days' | 'partial' | 'none'; amount?: number }` (`src/domain/types.ts`)
  - `RENT_REFUND_MODES: readonly ['by_days', 'partial', 'none']` (`liquidation.ts`)
  - `TerminationInput.rentRefund?: RentRefundInput` (thiếu = `by_days`)
  - `buildTerminationInvoice(input): { lines: InvoiceLineInput[]; total: number; maxRefund: number }`; `maxRefund` ≥ 0 là tổng tiền hoàn theo ngày (tiền phòng + phí cố định), tính cả khi chọn `none`/`partial`.

- [ ] **Step 1: Viết test lỗi** trong `describe('buildTerminationInvoice')`. Dùng `invoice()` và `input()` có sẵn; thêm `paidNovFee = invoice({ lines: [...paidNov.lines, { type: 'fee', description: 'Wifi', quantity: 1, unitPrice: 300_000, amount: 300_000, meta: { leaseFeeId: 'f1', from: '2026-11-01', to: '2026-11-30', coefficient: 1 } }, { type: 'fee', description: 'Điện', quantity: 100, unitPrice: 3500, amount: 350_000, meta: { leaseFeeId: 'e1', unit: 'kWh' } }] })`. Các test (ngày trả 2026-11-20, `days_30`, 10 ngày còn lại = 1/3 tháng):
  - `'hoàn theo ngày: hoàn cả phí cố định, không hoàn phí đồng hồ'`: với `approvedInvoices: [paidNovFee]` có đúng hai dòng `refund`, `-3_000_000` (tiền phòng) và `-100_000` (Wifi, mô tả bắt đầu bằng `Hoàn Wifi`); `maxRefund === 3_100_000`; `total === -11_180_000`.
  - `'hoàn theo ngày: hoàn mọi kỳ trả trước'`: thêm `invoice({ id: 'I2', periodStart: '2026-12-01', periodEnd: '2026-12-31', lines: [rent 9_000_000] })` → tổng các dòng `refund` = `-12_000_000`.
  - `'không hoàn: không có dòng hoàn, có một dòng ghi chú 0 đồng'`: `rentRefund: { mode: 'none' }` → không dòng nào `amount < 0` loại `refund`; có đúng một dòng `refund` `amount: 0` mô tả bắt đầu bằng `Không hoàn`; `total === -8_080_000`; `maxRefund === 3_000_000`.
  - `'hoàn một phần: một dòng gộp'`: `{ mode: 'partial', amount: 1_000_000 }` → đúng một dòng `refund` `amount: -1_000_000`, `total === -9_080_000`.
  - `'hoàn một phần vượt mức tối đa thì cắt về mức tối đa'`: `amount: 5_000_000` → dòng `-3_000_000`.
  - `'không có kỳ nào vượt ngày trả → vẫn có một dòng hoàn 0 đồng'`: `endDate: '2026-11-30'`, với cả ba chế độ → đúng một dòng `refund` `amount: 0`, `maxRefund === 0`, `total` không đổi so với không có dòng đó.
  - `'hoàn một phần nhập 0 → dòng hoàn 0 đồng'`: `{ mode: 'partial', amount: 0 }` → đúng một dòng `refund` `amount: 0`.
  - `'không truyền rentRefund = hoàn theo ngày'`: kết quả bằng với `{ mode: 'by_days' }`.

- [ ] **Step 2: Chạy riêng để thấy lỗi**

Run: `npx vitest run tests/unit/domain/billing.test.ts -t buildTerminationInvoice`
Expected: các test mới FAIL (thiếu `maxRefund`/dòng hoàn phí).

- [ ] **Step 3: Thêm `RentRefundInput`** vào `src/domain/types.ts` ngay dưới `ForfeitInput`, và `RENT_REFUND_MODES` (`as const`) vào `liquidation.ts`.

- [ ] **Step 4: Cài đặt** trong `liquidation.ts`: thay khối hoàn hiện tại (dòng 38-59) bằng việc gom `candidates: InvoiceLineInput[]` rồi áp lựa chọn. Chữ ký không đổi ngoài `rentRefund?` và `maxRefund` trả về. Giữ nguyên cách tính dòng hoàn tiền phòng hiện tại. Với mỗi hoá đơn tiền phòng đã duyệt có `periodEnd > endDate`, thêm dòng hoàn cho mỗi dòng `type === 'fee'` có `meta.from` và `meta.to` là chuỗi ngày và `meta.to > endDate`: `from' = max(endDate + 1, meta.from)`, `amount = -Math.round(line.quantity * line.unitPrice * prorateFraction(from', meta.to, proration))`, `description = Hoàn ${line.description} đã trả trước dd/mm–dd/mm`, `type: 'refund'`, bỏ qua nếu `amount === 0`. Áp lựa chọn: `by_days` → thêm mọi `candidates`; `none` → một dòng `refund` `quantity: 1, unitPrice: 0, amount: 0`, mô tả `Không hoàn tiền phòng và phí dịch vụ đã trả trước dd/mm–dd/mm` (từ ngày nhỏ nhất đến lớn nhất của các khoảng `candidates`; không có `candidates` thì `Không hoàn tiền phòng đã trả trước`); `partial` → nếu `min(amount, maxRefund) > 0` thì một dòng `refund` `quantity: 1`, `unitPrice = amount = -min(amount, maxRefund)`, mô tả `Hoàn một phần tiền phòng và phí dịch vụ đã trả trước`; ngược lại xử lý như `none`. Quy tắc chung: sau khi áp lựa chọn mà chưa có dòng `refund` nào (kể cả `by_days` không có `candidates`) thì thêm dòng 0 đồng `Hoàn tiền phòng đã trả trước: 0`; hoá đơn thanh lý luôn có ít nhất một dòng `refund`.

- [ ] **Step 5: Chạy lại cho PASS**

Run: `npx vitest run tests/unit/domain/billing.test.ts -t buildTerminationInvoice`
Expected: PASS, gồm cả các test cũ của khối này.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/modules/leasing/domain/liquidation.ts tests/unit/domain/billing.test.ts
git commit -m "feat: chọn cách hoàn tiền phòng đã trả trước khi thanh lý (hàm tính)"
```

---

### Task 2: Service nhận lựa chọn và kiểm tra trần

**Files:**
- Modify: `src/modules/leasing/server/addenda/service.ts:108-114` (schema), `:711-733` (gọi hàm tính)
- Test: `tests/integration/addenda.test.ts` (cạnh các test `createTermination`, khoảng dòng 130-180)

**Interfaces:**
- Consumes: `buildTerminationInvoice(...).maxRefund`, `RENT_REFUND_MODES` (Task 1).
- Produces: `createTermination`/`previewAddendum('termination', …)` nhận thêm `rentRefund?: { mode: 'by_days' | 'partial' | 'none'; amount?: number }`; `ValidationError` khi `partial` có `amount > maxRefund`, `fieldErrors: { rentRefund: 'Số tiền hoàn vượt mức tính theo ngày' }`.

- [ ] **Step 1: Viết test lỗi** trong `tests/integration/addenda.test.ts`, theo mẫu test thanh lý hiện có (thiết lập hợp đồng, hoá đơn tháng đã duyệt cho kỳ vượt ngày trả như test hoàn tiền hiện có; tìm bằng `Hoàn tiền phòng` hoặc `refund` trong file, nếu chưa có thì tạo hoá đơn tiền phòng đã duyệt qua helper của file):
  - `'thanh lý không hoàn: hoá đơn không có dòng hoàn âm'` → `rentRefund: { mode: 'none' }` và `r.invoice!.lines` không có dòng `refund` có `amount < 0`.
  - `'thanh lý hoàn một phần vượt mức tối đa bị từ chối'` → `rejects.toMatchObject({ fieldErrors: { rentRefund: expect.any(String) } })`.
  - `'thanh lý không gửi rentRefund vẫn hoàn theo ngày'`.
  - Rà các test thanh lý hiện có trong file này và `tests/e2e`: test nào đếm số dòng hoặc so sánh nguyên danh sách dòng của hoá đơn thanh lý thì cập nhật cho có thêm dòng hoàn 0 đồng (không sửa kỳ vọng tiền).
  - `'hoá đơn thanh lý không hoàn vẫn duyệt được'`: duyệt hoá đơn có dòng ghi chú 0 đồng bằng hàm duyệt đang dùng ở test `finalize` trong file này, hợp đồng chuyển `ended`.

- [ ] **Step 2: Chạy riêng để thấy lỗi**

Run: `npx vitest run tests/integration/addenda.test.ts -t "thanh lý"`
Expected: test mới FAIL.

- [ ] **Step 3: Sửa `terminationSchema`**: thêm `rentRefund: z.object({ mode: z.enum(RENT_REFUND_MODES), amount: z.number().int().nonnegative().optional() }).default({ mode: 'by_days' })`.

- [ ] **Step 4: Truyền `rentRefund: data.rentRefund` vào `buildTerminationInvoice`** và ngay sau đó, nếu `data.rentRefund.mode === 'partial' && (data.rentRefund.amount ?? 0) > built.maxRefund` thì `throw new ValidationError('Số tiền hoàn vượt mức tính theo ngày', { rentRefund: 'Số tiền hoàn vượt mức tính theo ngày' })`. Lỗi ném trong transaction nên không lưu gì; bước "Xem trước tiền" hiển thị lỗi này.

- [ ] **Step 5: Chạy lại cho PASS**

Run: `npx vitest run tests/integration/addenda.test.ts -t "thanh lý"`
Expected: PASS, kể cả các test thanh lý cũ.

- [ ] **Step 6: Commit**

```bash
git add src/modules/leasing/server/addenda/service.ts tests/integration/addenda.test.ts
git commit -m "feat: service thanh lý nhận lựa chọn hoàn tiền phòng và kiểm tra mức tối đa"
```

---

### Task 3: Ô chọn trên màn thanh lý, e2e và tài liệu

**Files:**
- Modify: `src/modules/leasing/ui/contracts/termination-wizard.tsx:21-60`
- Test: `tests/e2e/addenda.spec.ts:30-42`
- Modify: `docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md:100`

**Interfaces:**
- Consumes: `RENT_REFUND_MODES` (Task 1), input `rentRefund` của `createTerminationAction` (Task 2).

- [ ] **Step 1: Viết test e2e** trong `tests/e2e/addenda.spec.ts`, mở rộng test thanh lý hiện có: sau khi mở "Thanh lý hợp đồng", `getByLabel('Tiền phòng đã trả trước')` thấy được; chọn "Hoàn một phần" thì `getByLabel('Số tiền hoàn')` hiện, chọn "Không hoàn" thì ô này ẩn.

- [ ] **Step 2: Sửa wizard**: thêm state `refundMode` (mặc định `'by_days'`) và `refundAmount`; `input.rentRefund = { mode: refundMode, ...(refundMode === 'partial' ? { amount: Number(refundAmount) || 0 } : {}) }`. Dưới "Mất cọc" thêm `Field` "Tiền phòng đã trả trước" dùng `BareSelect` (`ariaLabel="Tiền phòng đã trả trước"`) với nhãn: `Hoàn theo ngày không ở`, `Hoàn một phần`, `Không hoàn`; khi `partial` thêm `Field` "Số tiền hoàn" dùng `MoneyInput`, kèm dòng gợi ý "Tối đa bằng số tính theo ngày, xem ở bước Xem trước tiền". Nhãn dựng từ `RENT_REFUND_MODES`, không viết lại giá trị. Đổi lựa chọn thì bước xem trước phải làm lại (đã do `AddendumShell` theo `input`).

- [ ] **Step 3: Cập nhật tài liệu**: ở mục "Hoá đơn thanh lý" của spec gốc, thay "(hoặc phần hoàn nếu trả dư)" bằng mô tả ba lựa chọn, ghi rõ hoàn gồm phí cố định đã thu trước và không áp quy tắc báo trước.

- [ ] **Step 4: Kiểm tra trước khi mở PR** (chạy một lần theo CLAUDE.md): `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run tests/unit/domain/billing.test.ts tests/integration/addenda.test.ts`, rồi `node scripts/e2e-preflight.mjs` và e2e riêng `tests/e2e/addenda.spec.ts`. Expected: tất cả PASS; ghi lại lệnh đã chạy và kết quả vào báo cáo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leasing/ui/contracts/termination-wizard.tsx tests/e2e/addenda.spec.ts docs/superpowers/specs/2026-11-16-quan-ly-khach-thue-design.md
git commit -m "feat: ô chọn hoàn tiền phòng đã trả trước trên màn thanh lý"
```
