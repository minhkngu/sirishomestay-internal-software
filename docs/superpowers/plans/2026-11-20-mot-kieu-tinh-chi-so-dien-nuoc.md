# Một kiểu tính chỉ số điện nước Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chỉ còn một cách tính điện nước: điện và nước là phí của hợp đồng, mỗi dòng phí gắn đúng một đồng hồ của phòng, đơn giá lấy từ dòng phí; bỏ kiểu tính theo bảng giá cơ sở.

**Architecture:** Mọi hợp đồng dùng `lease_fee_snapshots` + `lease_fee_meters`. Hoá đơn tháng, hoá đơn đầu, thanh lý đọc mức dùng từ đồng hồ gắn với dòng phí, đơn giá từ dòng phí. Đồng hồ điện, nước mặc định của phòng (đã có) là hai đồng hồ thường; đồng hồ thêm có `utility = 'fee'` (nhãn "Khác"). Thay đồng hồ chuyển liên kết dòng phí sang đồng hồ mới.

**Tech Stack:** Next.js 16, Drizzle + Postgres, Vitest + PGlite, zod, `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-11-20-mot-kieu-tinh-chi-so-dien-nuoc-design.md`. Plan này nối tiếp `.../2026-11-20-cong-to-mac-dinh-va-xem-mau-hoa-don.md` (đồng hồ mặc định, `createDefaultMeters`, `replaceMeter`, `meterUsage`).

## Global Constraints

- Theo `CLAUDE.md`: N-layer (`domain` không import gì trong `src`; `server` import `db`, `domain`, `lib`; `features` không import `db`); service nhận `(db, ctx, input)`, kiểm quyền bằng `assertCan`; sửa `src/db/schema/` rồi `npm run db:generate`, không sửa tay `drizzle/`.
- Commit tiếng Việt, tiêu đề ≤ 72 ký tự, dạng `feat:` / `fix:` / `refactor:`; kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Giao diện tiếng Việt; tiền dùng `formatVND`; không đọc file `.env*` có giá trị thật.
- **Không áp migration và không xoá dữ liệu trên CSDL dùng chung** nếu chưa được người dùng xác nhận lại ở thời điểm đó (Task 9).
- Mỗi task chạy test hẹp của nó, task cuối chạy `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Không bỏ qua hay xoá test để qua; test cũ dựa vào kiểu cũ được sửa theo hành vi mới (ghi rõ trong commit).

## Review Focus

- Hai hợp đồng cùng chọn một đồng hồ (đồng thời) → chỉ một thành công, thông báo rõ (Task 3).
- Phòng đổi (phụ lục chuyển phòng) khi dòng phí gắn đồng hồ của phòng cũ: hoá đơn vẫn có mức dùng hợp lý hoặc cảnh báo "Chưa có đồng hồ", không lỗi 500 (Task 1, 4).
- Thay đồng hồ giữa tháng khi dòng phí đang gắn: mức dùng tháng đó = cũ + mới, không bị tính hai lần hay mất (Task 2).
- Hợp đồng bắt đầu giữa tháng, chưa ghi chỉ số cuối tháng: hoá đơn tháng sau cảnh báo thiếu chỉ số, không tính 0 âm thầm (Task 1).
- Thanh lý khi dòng phí điện chưa có chỉ số: báo thiếu chỉ số như hiện nay, không dùng đơn giá cũ (Task 4).

---

### Task 1: Domain: một đường tính điện nước

**Files:**
- Modify: `src/domain/invoice-builder.ts` (bỏ nhánh `feeModel !== 'snapshot'` điện nước ở khoảng dòng 103–135 và import `rateFor`; hàm dựng hoá đơn đầu `buildFirstInvoice`)
- Modify: `src/domain/types.ts` (bỏ `Lease.feeModel`, `UtilityRate` nếu không còn ai dùng)
- Test: `tests/unit/domain/billing.test.ts`

**Interfaces:**
- Produces: `buildFirstInvoice(terms: LeaseTerms, startDate: ISODate, proration: Proration, depositCollected: number, meterStarts?: { leaseFeeId: string; reading: number }[]): InvoiceLineInput[]`. Với mỗi `terms.fees` có `quantitySource === 'meter'` và `leaseFeeId`, thêm dòng `{ type: 'fee', description: \`${f.name} (chỉ số ${reading} → ${reading})\`, quantity: 0, unitPrice: f.unitPrice, amount: 0, meta: { leaseFeeId, unit: f.unit } }`; thiếu `meterStarts` cho phí đó thì bỏ qua dòng.
- Produces: hàm dựng hoá đơn tháng không còn tham số `rates`, không đọc `lease.feeModel`; phần phí theo đồng hồ (`quantitySource === 'meter'`) chạy cho mọi hợp đồng. Nếu `link` trỏ đồng hồ đã gỡ, dùng chuỗi đồng hồ cùng phòng và cùng `leaseFeeId` (xem Task 2) — ở task này chỉ giữ `input.meters.find(m => m.id === link?.meterId)`.

- [ ] **Step 1: Viết test thất bại** (trong `billing.test.ts`)
  - `'hoá đơn đầu có dòng phí đồng hồ mức dùng 0 với chỉ số đầu = cuối'`: terms có một phí `quantitySource: 'meter'`, `buildFirstInvoice(..., [{ leaseFeeId, reading: 120 }])` → có dòng `description` chứa `120 → 120`, `quantity` 0, `amount` 0.
  - `'đổi bảng giá cơ sở không đổi hoá đơn'`: dựng hoá đơn tháng với `rates` khác nhau (hoặc bỏ `rates`) cho cùng một dòng phí đồng hồ → dòng giống nhau, `unitPrice` bằng giá của dòng phí.
  - `'không còn dòng điện nước tính theo bảng giá khi hợp đồng không có dòng phí đồng hồ'`: terms không có phí đồng hồ → không có dòng `type: 'electric'|'water'`.
- [ ] **Step 2: Chạy `npx vitest run tests/unit/domain/billing.test.ts`** → FAIL (hàm chưa có tham số / vẫn có dòng điện).
- [ ] **Step 3: Sửa `invoice-builder.ts` và `types.ts`** theo Interfaces; sửa các test cũ trong `billing.test.ts` dựa vào kiểu cũ (dòng `type: 'electric'`) sang dòng phí đồng hồ, giữ nguyên ý nghĩa (ước tính, thay đồng hồ).
- [ ] **Step 4: Chạy lại** → PASS; `npx tsc --noEmit` còn lỗi ở `src/server` do đổi chữ ký, sửa ở Task 2.
- [ ] **Step 5: Commit** `refactor: hoá đơn tính điện nước qua phí gắn đồng hồ`

### Task 2: Thay đồng hồ chuyển liên kết dòng phí

**Files:**
- Modify: `src/server/meters/service.ts` (`replaceMeter`)
- Modify: `src/domain/invoice-builder.ts` (mức dùng qua chuỗi đồng hồ của dòng phí)
- Test: `tests/integration/meters.test.ts`, `tests/unit/domain/billing.test.ts`

**Interfaces:**
- Consumes: `meterUsage(meters, readings, from, to)` (`src/domain/meters.ts`), bảng `lease_fee_meters(lease_fee_id PK, meter_id)`.
- Produces: trong cùng giao dịch của `replaceMeter(db, ctx, roomId, utility, input)`, `update lease_fee_meters set meter_id = fresh.id where meter_id = current.id`. Dựng hoá đơn tính mức dùng của dòng phí bằng `meterUsage` trên mọi đồng hồ cùng phòng thuộc chuỗi đã thay (cùng `roomId` và `utility`), không chỉ đồng hồ đang gắn.

- [ ] **Step 1: Viết test thất bại**
  - integration `'thay đồng hồ chuyển liên kết dòng phí sang đồng hồ mới'`: tạo hợp đồng có phí Điện gắn đồng hồ điện mặc định, `replaceMeter(...)`, kỳ sau đọc `lease_fee_meters` → `meterId` là đồng hồ mới.
  - unit `'mức dùng tháng thay đồng hồ = cuối cũ − chỉ số trước + chỉ số mới − đầu mới'` cho dòng phí đồng hồ.
- [ ] **Step 2: Chạy hai file test** → FAIL.
- [ ] **Step 3: Cài đặt** theo Interfaces.
- [ ] **Step 4: Chạy lại** → PASS (gồm các test thay đồng hồ ước tính đã có).
- [ ] **Step 5: Commit** `feat: thay đồng hồ chuyển liên kết dòng phí sang đồng hồ mới`

### Task 3: Chọn đồng hồ của phòng cho dòng phí

**Files:**
- Modify: `src/server/meters/service.ts` (`ensureFeeMeter`, thêm `addRoomMeter`)
- Modify: `src/server/meters/actions.ts` (`addRoomMeterAction`)
- Test: `tests/integration/meters.test.ts`, `tests/integration/fee-meter-concurrency.test.ts`

**Interfaces:**
- Produces: `ensureFeeMeter(tx, ctx, input: { roomId: string; leaseFeeId: string; existingMeterId: string; initialReading: number; installedOn: string }): Promise<{ id: string }>`. Bắt buộc `existingMeterId` (bỏ nhánh tạo đồng hồ mới và bỏ so khớp `feeTypeId`/đơn vị). Đồng hồ phải cùng phòng, `removed_on IS NULL`, chưa gắn dòng phí của hợp đồng `active` (lỗi `'Đồng hồ đang gắn với phí của hợp đồng khác'`); ghi chỉ số `handover` tại `installedOn` như hiện nay (không nhỏ hơn chỉ số gần nhất).
- Produces: `addRoomMeter(db, ctx, roomId: string, input: { startReading: number; installedOn: string; serial?: string }): Promise<{ id: string }>` tạo đồng hồ `utility: 'fee'`, kiểm quyền `meters` theo cơ sở của phòng, `recordAudit`. `addRoomMeterAction(roomId, input)` bọc bằng `toActionResult`, `revalidatePath('/meters')`.

- [ ] **Step 1: Viết test thất bại**
  - `'chọn đồng hồ của phòng khác bị từ chối'`, `'đồng hồ đã gắn dòng phí của hợp đồng đang chạy bị từ chối'`, `'đồng hồ điện bất kỳ của phòng chọn được cho phí nào cũng được'`, `'addRoomMeter tạo đồng hồ khác cho phòng'`; giữ test đồng thời ở `fee-meter-concurrency.test.ts` (hai hợp đồng cùng chọn một đồng hồ → một thành công).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt** theo Interfaces.
- [ ] **Step 4: Chạy** → PASS.
- [ ] **Step 5: Commit** `feat: dòng phí chỉ chọn đồng hồ của phòng, thêm đồng hồ cho phòng`

### Task 4: Hợp đồng, hoá đơn, thanh lý, phụ lục dùng một đường

**Files:**
- Modify: `src/server/contracts/service.ts` (bỏ `feeModel`, `convertLegacyFees`, nhánh legacy ở `insertLease`/`applyLeaseFeeEdits`/`leaseFees` helpers; hợp đồng luôn ghi `lease_fee_snapshots`)
- Modify: `src/server/invoices/service.ts` (bỏ nạp `utilityRates`, `leaseFees` legacy; truyền `meterStarts` cho `buildFirstInvoice`)
- Modify: `src/server/addenda/service.ts` + `src/domain/liquidation.ts` (thanh lý)
- Modify: `src/server/import/run.ts` (nhập Excel tạo hợp đồng theo kiểu mới)
- Modify: `src/db/schema/contracts.ts` (bỏ `feeModel`; bỏ bảng `leaseFees` nếu không còn dùng), rồi `npm run db:generate`
- Test: `tests/integration/contracts.test.ts`, `invoices.test.ts`, `addenda.test.ts`, `import-run.test.ts`, `handovers.test.ts`

**Interfaces:**
- Produces: `TerminationInput.utilities` đổi thành `meterFees: { leaseFeeId: string; name: string; unit: string; usage: number; unitPrice: number }[]`; mỗi phần tử thành một dòng hoá đơn thanh lý (`type: 'fee'`, `quantity: usage`, `unitPrice`, `amount: usage * unitPrice`). Mức dùng tính bằng `meterUsage` trên chuỗi đồng hồ của dòng phí từ đầu tháng (hoặc tháng trước nếu chưa có hoá đơn tháng) tới ngày trả; thiếu chỉ số → `ValidationError('Chưa có chỉ số <tên phí> để tính tiền')`.
- Hợp đồng mới: tự thêm hai dòng phí Điện, Nước nếu loại phí có trong cài đặt, gắn đồng hồ điện, nước mặc định của phòng; giá điền sẵn từ `fee_type_prices`/`default_price`, sửa được. Hoá đơn đầu gọi `buildFirstInvoice(..., meterStarts)` với chỉ số `handover` ghi lúc ký.
- Sau task: `rg "rateFor|utilityRates|feeModel|leaseFees\b" src` chỉ còn `src/server/fees/service.ts` (`ensureUtilityFeeTypes`, giá tham khảo) và `src/db/schema/fees.ts`.

- [ ] **Step 1: Viết/chỉnh test thất bại**
  - `'hoá đơn đầu của hợp đồng mới có dòng điện mức dùng 0'`, `'thanh lý tính điện bằng giá của dòng phí, không dùng bảng giá cơ sở'`, `'thanh lý thiếu chỉ số điện báo thiếu chỉ số'`, `'import tạo hợp đồng kèm phí điện nước gắn đồng hồ mặc định'`; chuyển các test cũ dựa vào `utility_rates`/`feeModel` sang kiểu mới.
- [ ] **Step 2: Chạy** các file trên → FAIL.
- [ ] **Step 3: Cài đặt** theo Interfaces; `npm run db:generate` để sinh migration (không áp).
- [ ] **Step 4: Chạy** các file trên + `npx tsc --noEmit` → PASS / sạch.
- [ ] **Step 5: Commit** `refactor: bỏ kiểu tính điện nước theo bảng giá cơ sở`

### Task 5: Form tạo hợp đồng chọn đồng hồ của phòng

**Files:**
- Modify: `src/features/contracts/lease-fee-meters.ts`, `src/features/contracts/components/lease-fees.tsx`, `lease-wizard.tsx`, `contract-edit-actions.tsx`
- Modify: `src/app/(app)/contracts/new-contract.tsx` (nạp đồng hồ của phòng, không còn `feeTypeId` trên đồng hồ)
- Modify: `src/server/contracts/actions.ts`
- Test: `tests/unit/features/lease-fee-meters.test.ts` (tạo nếu chưa có), `tests/e2e/chi-so.spec.ts` (cập nhật, chạy sau)

**Interfaces:**
- Produces: `RoomFeeMeter = { id: string; roomId: string; label: string; busy: boolean }` (bỏ `feeTypeId`, `unit`, `name` theo loại phí; `label` = "Điện", "Nước" hoặc "Khác" + số seri). `availableMeters({ roomMeters, roomId, fee, resolved })` chỉ lọc theo `roomId`, `!busy`, chưa dòng khác chọn. `resolveMeterIds` chọn mặc định đồng hồ điện cho phí Điện và nước cho phí Nước (theo tên loại phí), còn lại để trống; không còn lựa chọn "tạo đồng hồ mới".
- `meterFeeError(fee)` giữ: chỉ số ban đầu bắt buộc, kể cả khi chưa chọn đồng hồ thì báo "Chọn đồng hồ cho <phí>".

- [ ] **Step 1: Viết test thất bại** cho `resolveMeterIds`/`availableMeters`/`meterFeeError` (phòng khác không hiện; đồng hồ bận không hiện; hai dòng không nhận cùng một đồng hồ).
- [ ] **Step 2: Chạy** `npx vitest run tests/unit/features` → FAIL.
- [ ] **Step 3: Cài đặt** theo Interfaces.
- [ ] **Step 4: Chạy** → PASS; `npm run lint`.
- [ ] **Step 5: Commit** `feat: form hợp đồng chọn đồng hồ của phòng cho phí theo đồng hồ`

### Task 6: Ghi chỉ số theo toà, phòng, tháng, có dấu phòng có người ở

**Files:**
- Modify: `src/server/meters/service.ts` (`listReadingSheet`, kiểu `ReadingRow`)
- Modify: `src/features/meters/components/reading-grid.tsx`, `src/app/(app)/meters/page.tsx`
- Test: `tests/integration/meters.test.ts`

**Interfaces:**
- Produces: `ReadingRow` thêm `occupied: boolean` (phòng có hợp đồng `active` bao trùm kỳ: `start_date <= cuối kỳ` và `end_date >= đầu kỳ`). `listReadingSheet` trả `progress: { recorded: number; total: number }` đếm trên các phòng có người ở và có đồng hồ điện (đếm theo `occupied`). Đồng hồ loại `fee` không bị gắn nhãn theo loại phí nữa: nhãn là tên phí đang gắn nếu có, ngược lại "Khác".
- Lưới: nhãn "Có người ở" / "Trống" ở mỗi phòng, bộ lọc "Chỉ phòng có người ở" (mặc định bật), sắp xếp phòng có người ở lên trước, dòng tổng "Đã ghi n/m phòng có người ở".

- [ ] **Step 1: Viết test thất bại** `'bảng ghi chỉ số đánh dấu phòng có hợp đồng đang chạy và đếm tiến độ theo phòng có người ở'` (phòng trống đã ghi không làm tăng `recorded` của phòng có người).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt** theo Interfaces.
- [ ] **Step 4: Chạy** → PASS.
- [ ] **Step 5: Commit** `feat: ghi chỉ số hiện rõ phòng có người ở`

### Task 7: Tab Đồng hồ: thêm đồng hồ cho phòng

**Files:**
- Create: `src/features/meters/components/add-meter-dialog.tsx`
- Modify: `src/features/meters/components/meter-list.tsx`, `src/app/(app)/meters/page.tsx`
- Test: `tests/e2e/chi-so.spec.ts` (thêm bước; chạy ở Task 9)

**Interfaces:**
- Consumes: `addRoomMeterAction(roomId: string, input: { startReading: number; installedOn: string; serial?: string })` (Task 3).
- Produces: nút phụ "Thêm đồng hồ" ở tab Đồng hồ trong `FormDialog` (nhãn trên ô, ô cao 36px, nút chính ở footer, lỗi hiện trong hộp thoại); sau khi tạo `router.refresh()`. Không có nút xoá đồng hồ.

- [ ] **Step 1: Cài đặt** hộp thoại theo mẫu `src/components/form-dialog.tsx` và `replace-meter-dialog.tsx`.
- [ ] **Step 2: Chạy** `npm run lint` và `npx tsc --noEmit` → sạch.
- [ ] **Step 3: Commit** `feat: thêm đồng hồ cho phòng ở tab Đồng hồ`

### Task 8: Cài đặt: giá điện nước chỉ là giá tham khảo

**Files:**
- Modify: `src/features/settings/components/fee-settings.tsx`, `settings-tabs.tsx`, `src/app/(app)/settings/page.tsx` (nếu còn màn hình sửa bảng giá cơ sở thì đổi nhãn thành "Giá tham khảo", giữ ở thẻ loại phí; nếu đã bỏ thì không đổi)
- Modify: `src/server/fees/service.ts` (chỉ giữ `ensureUtilityFeeTypes`, `createRate`/`listRates` nếu còn nơi dùng)
- Test: `tests/integration/fees.test.ts` (nếu có), `tests/unit/domain/fee-price.test.ts`

- [ ] **Step 1: `rg "utilityRates|createRate|listRates" src`**; xoá code chết không còn nơi nào dùng, giữ nguyên bảng `utility_rates`.
- [ ] **Step 2: Chạy** `npm test -- fees` và `npx tsc --noEmit` → PASS / sạch.
- [ ] **Step 3: Commit** `refactor: bảng giá điện nước chỉ còn là giá tham khảo`

### Task 9: Dọn dữ liệu, kiểm tra cuối

**Files:**
- Create: `scripts/reset-contract-data.ts` (hàm `resetContractAndMeterData(db: DB): Promise<{ rooms: number }>`: xoá theo thứ tự khoá ngoại các bảng chỉ số, đồng hồ, liên kết, phí hợp đồng, hợp đồng cọc, phụ lục, hoá đơn và dòng hoá đơn, thanh toán, phí theo lần, điều chỉnh chờ, bàn giao và mục bàn giao, người ở, hợp đồng; giữ cơ sở, phòng, khách, tài sản, cài đặt, loại phí, mẫu giấy tờ, người dùng; rồi `createDefaultMeters` cho mọi phòng, `installedOn = todayVN()`)
- Create: `tests/integration/reset-contract-data.test.ts`
- Modify: `CLAUDE.md` (một dòng: phòng luôn có hai đồng hồ điện, nước mặc định không xoá được; điện nước là phí của hợp đồng gắn đồng hồ của phòng)
- Modify: `tests/e2e/chi-so.spec.ts`, `tests/e2e/invoice-templates.spec.ts` (đã sửa ở nhánh này; rà lại)

- [ ] **Step 1: Viết test thất bại** `'dọn dữ liệu xoá hợp đồng và đồng hồ cũ, giữ phòng và khách, rồi mỗi phòng có đủ hai đồng hồ mặc định'`.
- [ ] **Step 2: Chạy** → FAIL; **Step 3: Cài đặt** hàm; **Step 4: Chạy** → PASS.
- [ ] **Step 5: Chạy toàn bộ** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`; đọc kết quả.
- [ ] **Step 6: Commit** `feat: dọn dữ liệu hợp đồng, đồng hồ cũ và tạo lại đồng hồ mặc định`
- [ ] **Step 7: HỎI người dùng** trước khi (a) áp migration mới lên CSDL dùng chung, (b) chạy `resetContractAndMeterData` trên CSDL dùng chung. Chỉ làm sau khi được xác nhận trong chat ở thời điểm đó; chạy bằng `npx tsx --env-file=.env.local` từ script tạm, rồi xem trình duyệt (tạo hợp đồng chọn phí điện gắn đồng hồ, hoá đơn đầu, ghi chỉ số) và e2e (`node scripts/e2e-preflight.mjs` trước).
