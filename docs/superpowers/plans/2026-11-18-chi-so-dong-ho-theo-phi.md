# Phí, chỉ số và đồng hồ khi tạo hợp đồng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hợp đồng mới gán phí kèm đồng hồ riêng cho từng dòng (bắt buộc chỉ số ban đầu); Điện và Nước là loại phí có sẵn; menu "Điện nước" thành trang Chỉ số (Ghi chỉ số, Đồng hồ); Cài đặt bỏ tab "Đơn giá điện nước".

**Architecture:** Bỏ ràng buộc một đồng hồ đang dùng cho mỗi (phòng, loại phí); `ensureFeeMeter` chỉ dùng đồng hồ được chọn rõ hoặc tạo mới; `insertLease` cho phép trùng loại phí. Trang `/meters` thêm tab `?tab=meters` render ở server từ `listMeterOverview`. Hợp đồng cũ và hóa đơn đã phát hành không đổi.

**Tech Stack:** Next.js 16 App Router, Drizzle + Postgres, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-chi-so-dong-ho-theo-phi-design.md`

## Global Constraints

- Service nhận `(db, ctx, input)`; kiểm quyền bằng `assertCan`/`can`; `features` không import `db`; một feature không import feature khác.
- Sửa `src/db/schema/` rồi `npm run db:generate`; không sửa tay `drizzle/`.
- Chuỗi giao diện, comment, commit viết tiếng Việt; commit `feat:`/`fix:`, tiêu đề tối đa 72 ký tự; không commit trên `main`, không `--no-verify`.
- Không đổi số tiền hợp đồng đang chạy và hóa đơn đã phát hành; liên kết `lease_fee_meters` đã có giữ nguyên.
- `leases.status` chỉ có `active` | `ended`; "đang hiệu lực" là `active`.
- Không làm: thanh lý, chuyển phòng, đổi/thay đồng hồ, thay đổi phí hợp đồng đang có.
- Hệ quả đã biết: bỏ tab "Đơn giá điện nước" thì không còn giao diện sửa `utility_rates`; hợp đồng cũ vẫn tính theo dữ liệu hiện có. Giữ `listRates`/`createRate` ở server.

## Review Focus

- Đồng hồ đã gắn dòng phí của hợp đồng `active` bị chọn lại → từ chối (Task 1).
- Chỉ số ban đầu của đồng hồ có sẵn thiếu hoặc nhỏ hơn chỉ số gần nhất → từ chối, hợp đồng không được tạo (Task 1).
- `existingMeterId` thuộc phòng khác, đã gỡ (`removedOn`) hoặc trùng giữa hai dòng → từ chối (Task 1).
- Nạp Điện/Nước chạy hai lần không tạo trùng và không ghi đè giá đã sửa (Task 2).
- Tab Đồng hồ không lộ đồng hồ của cơ sở ngoài phạm vi quyền (Task 4).

---

### Task 1: Đồng hồ theo dòng phí ở server

**Files:**
- Modify: `src/db/schema/meters.ts:23` (bỏ chỉ mục `meters_active_room_fee_unique`), sinh migration bằng `npm run db:generate`
- Modify: `src/server/meters/service.ts` (`ensureFeeMeter`)
- Modify: `src/server/contracts/service.ts` (kiểm trùng trong `insertLease`, ~dòng 198)
- Test: `tests/integration/contracts.test.ts` (sửa test "tạo và dùng lại đồng hồ theo định danh phí của phòng" ~dòng 293; thêm test cạnh đó)

**Interfaces:**
- Consumes: `meters`, `meterReadings` (`kind: 'monthly' | 'handover'`), `leaseFeeMeters`, `leaseFeeSnapshots`, `leases`.
- Produces: `ensureFeeMeter(tx, ctx, input: { roomId: string; feeTypeId: string | null; leaseFeeId: string; existingMeterId?: string; initialReading?: number; installedOn: string }): Promise<{ id: string }>` giữ chữ ký nhưng không tự tìm đồng hồ theo (phòng, loại phí) và luôn đòi `initialReading` (số nguyên 0..2_147_483_647, nếu không ném `ValidationError('Nhập chỉ số ban đầu hợp lệ', { initialReading: ... })`).

- [ ] **Step 1: Viết test (thất bại)** trong `tests/integration/contracts.test.ts`:
  - Sửa test cũ thành `'dùng lại đồng hồ có sẵn khi chọn rõ và ghi chỉ số bàn giao'`: hợp đồng đầu `ended`, hợp đồng hai truyền `existingMeterId: meter.id`, `initialReading: 130`; còn một đồng hồ và có `meterReadings` `{ meterId: meter.id, kind: 'handover', readOn: '2026-10-15', value: 130 }`.
  - `'hai dòng cùng loại phí có hai đồng hồ riêng'`: `fees: [fee(feePerson), fee(feePerson)]` tạo được; `meters` của phòng có 2 dòng `feeTypeId = feePerson`; `leaseFeeMeters` có 2 dòng trỏ hai đồng hồ khác nhau.
  - `'từ chối đồng hồ đã gắn dòng phí của hợp đồng đang hiệu lực'` → `ValidationError`, không có hợp đồng mới.
  - `'từ chối chỉ số ban đầu thấp hơn chỉ số gần nhất của đồng hồ có sẵn'` (có 123, nhập 100) → `ValidationError`.
  - `'từ chối đồng hồ có sẵn thiếu chỉ số ban đầu'` → `ValidationError`.
  - `'từ chối đồng hồ của phòng khác hoặc đã gỡ'` → `ValidationError`.
  - `'chuyển từ hợp đồng cọc có hai dòng cùng loại phí'`: `convertDepositToLease` tạo 2 đồng hồ.
- [ ] **Step 2: Chạy để thấy thất bại:** `npx vitest run tests/integration/contracts.test.ts -t "đồng hồ"` → FAIL.
- [ ] **Step 3: Sửa schema và sinh migration:** bỏ chỉ mục; `npm run db:generate`; tệp SQL mới chỉ chứa `DROP INDEX "meters_active_room_fee_unique"`.
- [ ] **Step 4: Sửa `ensureFeeMeter`:** bỏ nhánh tìm theo `(roomId, feeTypeId)`; kiểm `initialReading` cho mọi trường hợp; có `existingMeterId` thì yêu cầu đồng hồ cùng phòng, `removedOn` rỗng, `feeTypeId` khớp `input.feeTypeId` (hoặc cả hai rỗng và đơn vị khớp như logic hiện có), không có `lease_fee_meters` nào trỏ tới nó qua `leaseFeeSnapshots` → `leases.status = 'active'`, và `initialReading` không nhỏ hơn giá trị lớn nhất đã ghi hoặc `startReading`; ghi `meterReadings` `{ kind: 'handover', readOn: installedOn, period: installedOn.slice(0, 7), value: initialReading }`; không có `existingMeterId` thì tạo mới với `startReading = initialReading`. Giữ audit hiện có.
- [ ] **Step 5: Sửa `insertLease`:** chỉ giữ kiểm trùng `existingMeterId`; bỏ kiểm trùng `feeTypeId`.
- [ ] **Step 6: Chạy lại:** `npx vitest run tests/integration/contracts.test.ts` → PASS; `npx tsc --noEmit` sạch.
- [ ] **Step 7: Commit**
```bash
git add src/db/schema/meters.ts drizzle src/server/meters/service.ts src/server/contracts/service.ts tests/integration/contracts.test.ts
git commit -m "feat: mỗi dòng phí đồng hồ có đồng hồ riêng và chỉ số ban đầu"
```

### Task 2: Loại phí Điện và Nước có sẵn

**Files:**
- Modify: `src/server/fees/service.ts` (thêm hàm)
- Create: `scripts/ensure-utility-fees.ts`
- Modify: `scripts/seed/index.ts` (gọi hàm), `package.json` (script `db:ensure-utility-fees`)
- Test: `tests/integration/fees.test.ts`

**Interfaces:**
- Consumes: `createFeeUnit`, `createFeeType`, `setFeeTypePrice`, bảng `utilityRates`, `feeTypes`, `feeUnits`.
- Produces: `ensureUtilityFeeTypes(db: DB, ctx: AccessContext): Promise<{ electric: FeeType; water: FeeType }>` — tìm theo tên "Điện" và "Nước"; thiếu thì tạo với đơn vị `kWh` / `m³`, `quantityFrom: 'meter'`, `billing: 'per_occurrence'`, `defaultPrice` là đơn giá `utility_rates` mới nhất (theo `effectiveFrom`) của cơ sở đầu tiên có giá, kèm `fee_type_prices` cho cơ sở có giá khác mặc định; đã có thì không sửa gì. Kiểm quyền `settings`.

- [ ] **Step 1: Viết test (thất bại):** `'tạo Điện và Nước lần đầu với giá utility_rates mới nhất'` (hai giá cùng cơ sở khác `effectiveFrom` → lấy giá mới; cơ sở thứ hai giá khác → có `fee_type_prices`); `'chạy lần hai không tạo trùng và không ghi đè giá đã sửa'`; `'không có utility_rates thì giá mặc định bằng 0'`.
- [ ] **Step 2: Chạy:** `npx vitest run tests/integration/fees.test.ts -t "Điện"` → FAIL.
- [ ] **Step 3: Cài `ensureUtilityFeeTypes`** theo Interfaces, trong một giao dịch, dùng các hàm tạo hiện có để có audit.
- [ ] **Step 4: Script và seed:** `scripts/ensure-utility-fees.ts` dùng client DB và ngữ cảnh admin như `scripts/seed-admin.ts`; `"db:ensure-utility-fees": "tsx scripts/ensure-utility-fees.ts"`; `scripts/seed/index.ts` gọi hàm một lần.
- [ ] **Step 5: Chạy lại:** `npx vitest run tests/integration/fees.test.ts tests/integration/contracts.test.ts` → PASS.
- [ ] **Step 6: Commit**
```bash
git add src/server/fees/service.ts scripts package.json tests/integration/fees.test.ts
git commit -m "feat: nạp sẵn loại phí Điện và Nước tính theo đồng hồ"
```

### Task 3: Form hợp đồng chọn đồng hồ cho từng dòng phí

**Files:**
- Modify: `src/features/contracts/components/lease-fees.tsx`, `src/features/contracts/components/lease-wizard.tsx` (~dòng 98), `src/app/(app)/contracts/new/page.tsx`
- Test: `tests/e2e/contract-create-one-page.spec.ts`

**Interfaces:**
- Consumes: hành vi của Task 1.
- Produces: `RoomFeeMeter = { id: string; roomId: string; feeTypeId: string | null; name: string; unit: string; busy: boolean }` (`busy` = đang gắn dòng phí của hợp đồng `active`); `existingMeterId` dùng cho mọi dòng `meter`; `initialReading` luôn bắt buộc cho dòng `meter`.

- [ ] **Step 1: Viết e2e (thất bại)** `'hai dòng phí đồng hồ, chỉ số ban đầu bắt buộc'`: chọn phòng trống, thêm hai phí riêng tính theo đồng hồ cùng đơn vị; bấm tạo khi chưa nhập → lỗi "Nhập chỉ số ban đầu hợp lệ cho …"; nhập hai chỉ số khác nhau → tạo thành công. Theo mẫu test "công ty ký và tạo đồng hồ cho phí riêng" cùng tệp.
- [ ] **Step 2: Chạy:** `E2E_BASE_URL=http://localhost:3001 node scripts/e2e-preflight.mjs` rồi `E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/contract-create-one-page.spec.ts -g "chỉ số ban đầu bắt buộc"` → FAIL.
- [ ] **Step 3: Trang `contracts/new`:** truyền `roomMeters` kèm `busy` (kiểm `leaseFeeMeters` → `leaseFeeSnapshots` → `leases.status = 'active'`), chỉ đồng hồ đang dùng.
- [ ] **Step 4: `lease-fees.tsx`:** mọi dòng `meter` có `<select aria-label={`Đồng hồ ${name}`}>` gồm "Tạo đồng hồ mới" và các đồng hồ cùng phòng, cùng `feeTypeId` (hoặc cùng đơn vị với phí riêng), `!busy`, chưa được dòng khác trong form chọn; ô "Chỉ số ban đầu" luôn hiện (nhãn "Chỉ số hiện tại của đồng hồ" khi chọn đồng hồ có sẵn). Danh sách "Chọn phí có sẵn" không loại bỏ phí `meter` đã thêm.
- [ ] **Step 5: `lease-wizard.tsx`:** bỏ `hasMeter`; lỗi `Nhập chỉ số ban đầu hợp lệ cho ${fee.name}` áp cho mọi dòng `meter`; payload gửi `existingMeterId` và `initialReading`.
- [ ] **Step 6: Kiểm tra:** `npx tsc --noEmit`, `npm run lint` (0 lỗi), e2e hẹp → PASS, rồi cả tệp `contract-create-one-page.spec.ts` → PASS.
- [ ] **Step 7: Commit**
```bash
git add src/features/contracts "src/app/(app)/contracts/new/page.tsx" tests/e2e/contract-create-one-page.spec.ts
git commit -m "feat: form hợp đồng chọn đồng hồ và bắt buộc chỉ số ban đầu"
```

### Task 4: Trang Chỉ số với tab Đồng hồ

**Files:**
- Modify: `src/components/app-shell/nav.ts:14` (nhãn "Chỉ số"), `src/app/(app)/meters/page.tsx` (tiêu đề "Chỉ số", tab theo `?tab=`)
- Create: `src/features/meters/components/meter-list.tsx`
- Modify: `src/server/meters/service.ts` (thêm `listMeterOverview`)
- Test: `tests/integration/meters.test.ts` (tệp test đồng hồ hiện có; nếu tên khác thì dùng tệp tương ứng), `tests/e2e/chi-so.spec.ts`

**Interfaces:**
- Consumes: `meters`, `meterReadings`, `leaseFeeMeters`, `leaseFeeSnapshots`, `leases`, `rooms`.
- Produces: `listMeterOverview(db: DB, ctx: AccessContext, facilityId: string): Promise<MeterOverviewRow[]>` với `MeterOverviewRow = { meterId: string; roomId: string; roomCode: string; floor: string | null; feeName: string | null; unit: string | null; leaseCode: string | null; serial: string | null; startReading: number; installedOn: string; removedOn: string | null; readings: { period: string; kind: 'monthly' | 'handover'; readOn: string; value: number }[] }` (readings mới nhất trước); kiểm quyền `assertCan(ctx, 'meters', facilityId)`; `feeName`, `leaseCode` lấy từ dòng phí gắn với đồng hồ (hợp đồng `active` nếu có), đồng hồ cũ theo `utility` có `feeName = 'Điện' | 'Nước'` suy từ `utility` và `leaseCode = null`.

- [ ] **Step 1: Viết test (thất bại)** `tests/integration/meters.test.ts`: `'liệt kê đồng hồ của cơ sở kèm dòng phí, hợp đồng và lịch sử chỉ số'`; `'đồng hồ cũ theo utility hiện tên Điện/Nước'`; `'người ngoài phạm vi cơ sở bị từ chối'` (`NotFoundError`); `'người thiếu quyền meters bị từ chối'` (`ForbiddenError`).
- [ ] **Step 2: Chạy:** `npx vitest run tests/integration/meters.test.ts -t "liệt kê|đồng hồ cũ|phạm vi|thiếu quyền"` → FAIL.
- [ ] **Step 3: Cài `listMeterOverview`** theo Interfaces (sắp theo mã phòng, đồng hồ đang dùng trước).
- [ ] **Step 4: Giao diện:** `nav.ts` đổi nhãn; trang `/meters` có hai liên kết tab "Ghi chỉ số" (`?tab=readings`, mặc định, giữ lưới hiện có) và "Đồng hồ" (`?tab=meters`) giữ tham số `facility`; tab Đồng hồ render `MeterList` (bảng: phòng, dòng phí, hợp đồng, số seri, chỉ số đầu, trạng thái; mỗi dòng có `<details>` "Lịch sử chỉ số"); tiêu đề trang "Chỉ số".
- [ ] **Step 5: Viết e2e (thất bại rồi đạt)** `tests/e2e/chi-so.spec.ts`: đăng nhập admin như `openForm`; menu có "Chỉ số" không còn "Điện nước"; `/meters` có hai tab; bấm tab Đồng hồ thấy bảng với cột "Dòng phí".
- [ ] **Step 6: Chạy:** test integration → PASS; `E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/chi-so.spec.ts` → PASS; `npx tsc --noEmit`, `npm run lint` sạch.
- [ ] **Step 7: Commit**
```bash
git add src/components/app-shell/nav.ts "src/app/(app)/meters" src/features/meters src/server/meters/service.ts tests/integration/meters.test.ts tests/e2e/chi-so.spec.ts
git commit -m "feat: trang Chỉ số có tab Đồng hồ theo dõi theo dòng phí"
```

### Task 5: Cài đặt bỏ tab đơn giá điện nước

**Files:**
- Modify: `src/features/settings/components/settings-tabs.tsx` (xóa `RatesTab`, tab "Đơn giá điện nước", prop `rates`; sắp thứ tự tab), `src/app/(app)/settings/page.tsx` (bỏ `listRates`, `rates`), `src/server/fees/actions.ts` (xóa `createRateAction` nếu không còn nơi dùng)
- Test: `tests/e2e/chi-so.spec.ts` (thêm bài)

**Interfaces:**
- Consumes: không.
- Produces: thứ tự tab Cài đặt: `general` (Chung), `facilities` (Cơ sở), `fees` (Phí dịch vụ), `bank` (Tài khoản nhận tiền).

- [ ] **Step 1: Viết e2e (thất bại)** `'tab Cài đặt theo thứ tự và không còn Đơn giá điện nước'` trong `tests/e2e/chi-so.spec.ts`: `/settings` có `role=tab` theo thứ tự Chung, Cơ sở, Phí dịch vụ, Tài khoản nhận tiền; không có tab "Đơn giá điện nước".
- [ ] **Step 2: Chạy:** `E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/chi-so.spec.ts -g "tab Cài đặt"` → FAIL.
- [ ] **Step 3: Sửa** `settings-tabs.tsx`, `page.tsx`, `actions.ts` theo Files; giữ `listRates`/`createRate` ở `src/server/fees/service.ts`.
- [ ] **Step 4: Kiểm tra:** `npx tsc --noEmit`, `npm run lint` (0 lỗi), e2e `chi-so.spec.ts` → PASS, `npx vitest run tests/integration/fees.test.ts tests/unit/settings` → PASS.
- [ ] **Step 5: Kiểm tra thủ công** ở `http://localhost:3001/settings` và `/meters`: thứ tự tab, Điện và Nước hiện trong Phí dịch vụ, tab Đồng hồ.
- [ ] **Step 6: Chạy toàn bộ một lần ở cuối:** `npm test`; rồi e2e đầy đủ một lần.
- [ ] **Step 7: Commit**
```bash
git add src/features/settings "src/app/(app)/settings/page.tsx" src/server/fees/actions.ts tests/e2e/chi-so.spec.ts
git commit -m "feat: bỏ tab đơn giá điện nước, sắp lại thứ tự tab cài đặt"
```
