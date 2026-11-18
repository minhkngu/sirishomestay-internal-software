# Cài đặt phí dịch vụ — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sắp xếp lại tab phí trong Cài đặt thành danh sách thẻ (mỗi loại phí một khối), cho tạo đơn vị ngay trong form phí, sửa được loại phí, và khôi phục được phí đã lưu trữ.

**Architecture:** Hai lớp. Server: mở rộng `createFeeType` để nhận `unitId` hoặc `newUnitName` (tạo/dùng lại đơn vị trong cùng transaction) và thêm `restoreFeeType`; không đổi schema. Giao diện: tách `src/features/settings/components/` thành `fee-options.ts` (nhãn + kiểm tra ô giá), `fee-type-form.tsx` (form dùng chung tạo/sửa), `fee-type-card.tsx` (một loại phí: sửa, mặc định, giá riêng), `fee-settings.tsx` (khung tab + mục đã lưu trữ + dải đơn vị); `settings-tabs.tsx` chỉ còn các tab.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-cai-dat-phi-dich-vu-design.md`

## Global Constraints

- Không đổi schema DB, không thêm migration.
- Không đổi cách hợp đồng / hoá đơn đọc loại phí, giá riêng, phí mặc định; `listFeeTypes`, `listFeeTypePrices`, `listFeeDefaults` giữ nguyên chữ ký và kết quả.
- Không đổi tab "Đơn giá điện nước", "Cơ sở", "Chung", "Tài khoản nhận tiền".
- Mọi thao tác ghi vẫn qua `assertCan(ctx, 'settings')` + `recordAudit`.
- `src/features/settings` chỉ gọi server action, không import `db`.
- Chuỗi giao diện tiếng Việt. Dùng `formatVND` cho tiền. Nhãn/placeholder bắt buộc giữ nguyên để e2e dùng được: `Tên loại phí`, `Đơn giá mặc định`, `Số lượng lấy từ`, `Đơn vị`, `Thêm loại phí`, `Lưu trữ`.
- Nút lưu form tạo là **"Tạo loại phí"**; nút mở form là **"+ Thêm loại phí"**.

## Review Focus

Test cho từng dòng nằm ở task ghi trong ngoặc.

1. Nhập tên đơn vị mới trùng đơn vị đã có (kể cả thừa khoảng trắng) phải dùng lại đơn vị đó, không tạo bản ghi thứ hai. (Task 1)
2. Gửi cả `unitId` lẫn `newUnitName`, hoặc không gửi cái nào, phải bị từ chối bằng lỗi tiếng Việt và không tạo phí. (Task 1)
3. Lưu trữ rồi khôi phục một loại phí phải đưa nó trở lại danh sách hoạt động, giữ nguyên dấu mặc định theo cơ sở và giá riêng. (Task 2)
4. Người không có quyền `settings` gọi khôi phục phải bị `ForbiddenError`, dữ liệu không đổi. (Task 2)
5. Ô giá riêng để trống hoặc nhập chữ phải không gửi lên server (không ghi giá 0/NaN); chỉ nhận chuỗi số nguyên không âm. (Task 4)

---

### Task 1: Tạo loại phí kèm đơn vị mới

**Files:**
- Modify: `src/server/fees/service.ts:15-24` (schema đầu vào), `:61-69` (`createFeeType`), `:71-78` (`updateFeeType` dùng schema mới)
- Test: `tests/integration/fees.test.ts`

**Interfaces:**
- Consumes: `feeUnits`, `feeTypes` tables; `parse`, `ValidationError`, `recordAudit` đã có trong file.
- Produces:
  - `createFeeType(db, ctx, input)` nhận `{ name, defaultPrice, billing, quantityFrom }` + **một trong hai**: `unitId: string` hoặc `newUnitName: string`. Trả `FeeType`.
  - `updateFeeType(db, ctx, id, input)` giữ nguyên hành vi: nhận một phần các trường trên, `unitId` tuỳ chọn.
  - Lỗi validation khi vừa/không gửi đơn vị: `'Chọn đơn vị hoặc nhập đơn vị mới'`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `describe('fees & rates')` trong `tests/integration/fees.test.ts` (import thêm `feeUnits` từ `@/db`):

```ts
it('tạo loại phí kèm đơn vị mới, hoặc dùng lại đơn vị cùng tên', async () => {
  const dien = await createFeeType(db, admin, { name: 'Điện', newUnitName: 'kWh', defaultPrice: 3500, billing: 'per_occurrence', quantityFrom: 'meter' })
  const units = await listFeeUnits(db, admin)
  expect(units.find((u) => u.name === 'kWh')?.id).toBe(dien.unitId)

  const again = await createFeeType(db, admin, { name: 'Điện dự phòng', newUnitName: '  kWh ', defaultPrice: 0, billing: 'per_occurrence', quantityFrom: 'meter' })
  expect(again.unitId).toBe(dien.unitId)
  expect(units.filter((u) => u.name === 'kWh')).toHaveLength(1)
  expect(await db.select().from(feeUnits)).toHaveLength(1)
})

it('từ chối khi vừa chọn đơn vị vừa nhập đơn vị mới, hoặc thiếu cả hai', async () => {
  const unit = await createFeeUnit(db, admin, { name: 'lần' })
  const base = { name: 'X', defaultPrice: 1, billing: 'monthly_fixed', quantityFrom: 'manual' } as const
  await expect(createFeeType(db, admin, { ...base, unitId: unit.id, newUnitName: 'Y' })).rejects.toThrow('Chọn đơn vị hoặc nhập đơn vị mới')
  await expect(createFeeType(db, admin, base)).rejects.toThrow('Chọn đơn vị hoặc nhập đơn vị mới')
  expect(await listFeeTypes(db, admin)).toHaveLength(0)
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/integration/fees.test.ts`
Expected: FAIL — `newUnitName` bị bỏ qua nên `dien.unitId` là `undefined`/lỗi foreign key; hai test mới không đạt.

- [ ] **Step 3: Sửa schema và `createFeeType`**

Tách các trường chung khỏi `feeTypeInput` để `updateFeeType` vẫn `.partial()` được (không bọc `.refine` quanh object dùng cho update):

```ts
const feeTypeFields = {
  name: z.string().trim().min(1, 'Nhập tên loại phí'),
  defaultPrice: z.number().int().min(0, 'Đơn giá không hợp lệ'),
  billing: z.enum(['monthly_fixed', 'per_occurrence']),
  quantityFrom: z.enum(['manual', 'occupants', 'room', 'meter', 'period_input']),
}
const feeTypeInput = z.object({
  ...feeTypeFields,
  unitId: z.uuid('Chọn đơn vị').optional(),
  newUnitName: z.string().trim().min(1, 'Nhập tên đơn vị').optional(),
}).refine((v) => Boolean(v.unitId) !== Boolean(v.newUnitName), { message: 'Chọn đơn vị hoặc nhập đơn vị mới', path: ['unitId'] })
const feeTypeUpdateInput = z.object({ ...feeTypeFields, unitId: z.uuid('Chọn đơn vị') }).partial()
```

Trong `createFeeType`, bên trong `db.transaction`, nếu `data.newUnitName` thì `select` theo `eq(feeUnits.name, data.newUnitName)`; có thì dùng `existing.id`, chưa có thì `insert` và lấy `id`. Sau đó `insert(feeTypes).values({ name: data.name, unitId, defaultPrice: data.defaultPrice, billing: data.billing, quantityFrom: data.quantityFrom })` — không đưa `newUnitName` vào `values`. Giữ nguyên `recordAudit` với `summary: 'Tạo loại phí ${t.name}'`.

Đổi `updateFeeType` sang `parse(feeTypeUpdateInput, input)`.

- [ ] **Step 4: Chạy test để xác nhận đạt**

Run: `npx vitest run tests/integration/fees.test.ts`
Expected: PASS toàn bộ file (gồm các test cũ gọi `createFeeType` với `unitId`).

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS, không test nào bị ảnh hưởng.

- [ ] **Step 6: Commit**

```bash
git add src/server/fees/service.ts tests/integration/fees.test.ts
git commit -m "feat: tạo đơn vị mới ngay khi tạo loại phí"
```

---

### Task 2: Khôi phục loại phí đã lưu trữ

**Files:**
- Modify: `src/server/fees/service.ts` (thêm sau `archiveFeeType`, khoảng `:84-95`), `src/server/fees/actions.ts:7` (import) và cuối file (action mới)
- Test: `tests/integration/fees.test.ts`

**Interfaces:**
- Consumes: `FeeType`, `feeTypes`, `parse` không cần; `recordAudit`, `NotFoundError`.
- Produces:
  - `restoreFeeType(db: DB, ctx: AccessContext, id: string): Promise<void>` — đặt `isActive = true`, audit `'Khôi phục loại phí <tên>'`.
  - `restoreFeeTypeAction(id: string)` trong `src/server/fees/actions.ts` — gọi service, `revalidatePath('/settings')`, trả `ActionResult`.

- [ ] **Step 1: Viết test thất bại**

```ts
it('khôi phục loại phí đã lưu trữ, giữ mặc định và giá riêng', async () => {
  const unit = await createFeeUnit(db, admin, { name: 'phòng' })
  const fee = await createFeeType(db, admin, { name: 'Rác', unitId: unit.id, defaultPrice: 1000, billing: 'monthly_fixed', quantityFrom: 'room' })
  await setFeeDefault(db, admin, { facilityId: fa, feeTypeId: fee.id, enabled: true })
  await setFeeTypePrice(db, admin, { feeTypeId: fee.id, facilityId: fa, price: 2000 })
  await archiveFeeType(db, admin, fee.id)
  await restoreFeeType(db, admin, fee.id)
  expect((await listFeeTypes(db, admin)).map((f) => f.id)).toContain(fee.id)
  expect((await listFeeDefaults(db, admin))[fa]).toContain(fee.id)
  expect(await listFeeTypePrices(db, admin)).toEqual({ [fee.id]: { [fa]: 2000 } })
})

it('chỉ nhóm settings khôi phục được; phí không tồn tại báo không thấy', async () => {
  const unit = await createFeeUnit(db, admin, { name: 'lần' })
  const fee = await createFeeType(db, admin, { name: 'Giặt', unitId: unit.id, defaultPrice: 0, billing: 'per_occurrence', quantityFrom: 'manual' })
  await archiveFeeType(db, admin, fee.id)
  await expect(restoreFeeType(db, ctxOf(['billing'], [fa]), fee.id)).rejects.toThrow(ForbiddenError)
  await expect(restoreFeeType(db, admin, crypto.randomUUID())).rejects.toThrow(NotFoundError)
  expect(await listFeeTypes(db, admin)).toHaveLength(0)
})
```

Cập nhật import ở đầu file test: thêm `restoreFeeType`.

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/integration/fees.test.ts`
Expected: FAIL — `restoreFeeType` chưa được export.

- [ ] **Step 3: Viết service và action**

`restoreFeeType`: `assertCan(ctx, 'settings')`; trong `db.transaction`: `select` phí theo id, không có → `NotFoundError`; `update(feeTypes).set({ isActive: true, updatedAt: new Date() })`; audit `action: 'update'`, `summary: 'Khôi phục loại phí ' + before.name`. Không đụng `feeDefaults` / `feeTypePrices` (dữ liệu vẫn còn, chỉ bị ẩn khi phí lưu trữ).

Action mới bọc `toActionResult(async () => { await restoreFeeType(db, ctx, id); revalidatePath('/settings'); return {} })`.

- [ ] **Step 4: Chạy test để xác nhận đạt**

Run: `npx vitest run tests/integration/fees.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/fees/service.ts src/server/fees/actions.ts tests/integration/fees.test.ts
git commit -m "feat: khôi phục loại phí đã lưu trữ"
```

---

### Task 3: Nhãn dùng chung + form tạo/sửa loại phí

**Files:**
- Create: `src/features/settings/components/fee-options.ts`
- Create: `src/features/settings/components/fee-type-form.tsx`
- Modify: `src/features/settings/components/settings-tabs.tsx` — trong `FeesTab`: bỏ state `t`, bỏ khối grid "Thêm loại phí" ở đáy, thêm state `adding` + `<FeeTypeForm>` render phía trên bảng.

**Interfaces:**
- Produces:
  - `billingLabel(v: string): string`, `quantityLabel(v: string): string`
  - `BILLING_OPTIONS`, `QUANTITY_OPTIONS`: mảng `{ value: string; label: string }`
  - `export type FeeFormValues = { name: string; unitId?: string; newUnitName?: string; defaultPrice: number; billing: 'monthly_fixed' | 'per_occurrence'; quantityFrom: 'manual' | 'occupants' | 'room' | 'meter' | 'period_input' }`
  - `export type FeeFormInitial = { name?: string; unitId?: string; defaultPrice?: number; billing?: string; quantityFrom?: string }` — dùng `string` cho hai trường enum vì dữ liệu DB trả `string`; form ép kiểu khi submit.
  - `export function FeeTypeForm(props: { units: Unit[]; initial?: FeeFormInitial; allowNewUnit?: boolean; pending: boolean; error?: string | null; fieldErrors?: Record<string, string>; submitLabel: string; onSubmit: (values: FeeFormValues) => void; onCancel?: () => void })`

- [ ] **Step 1: Tạo `fee-options.ts`**

Nhãn giữ nguyên chuỗi hiện tại trừ `manual` đổi thành `'Nhập tay'`:

```ts
export const BILLING_OPTIONS = [
  { value: 'monthly_fixed', label: 'Cố định hằng tháng (trả trước)' },
  { value: 'per_occurrence', label: 'Theo lần / tiêu thụ (trả sau)' },
]
export const QUANTITY_OPTIONS = [
  { value: 'manual', label: 'Nhập tay' },
  { value: 'occupants', label: 'Theo số người ở' },
  { value: 'room', label: 'Theo phòng' },
  { value: 'meter', label: 'Theo đồng hồ' },
  { value: 'period_input', label: 'Nhập lượng mỗi kỳ' },
]
export function billingLabel(value: string) { return BILLING_OPTIONS.find((o) => o.value === value)?.label ?? value }
export function quantityLabel(value: string) { return QUANTITY_OPTIONS.find((o) => o.value === value)?.label ?? value }
```

- [ ] **Step 2: Tạo `fee-type-form.tsx`**

Client component. State cục bộ: `name`, `unitChoice` (`unitId` hoặc `'__new__'`), `newUnitName`, `price` (chuỗi), `billing`, `quantityFrom`, `localErrors: Record<string, string>`. Mặc định `unitChoice = initial?.unitId ?? units[0]?.id ?? '__new__'`, `price = String(initial?.defaultPrice ?? '')`, `billing = initial?.billing ?? 'monthly_fixed'`, `quantityFrom = initial?.quantityFrom ?? 'manual'`.

Giao diện: lưới 2 cột (`grid gap-2 sm:grid-cols-2`) gồm:
- Input placeholder `"Tên loại phí"`.
- Select `aria-label="Đơn vị"`; option `'__new__'` nhãn `"Đơn vị mới…"` chỉ hiện khi `allowNewUnit`; khi chọn `'__new__'` hiện thêm Input placeholder `"Tên đơn vị mới"`.
- Input placeholder `"Đơn giá mặc định"`, `inputMode="numeric"`.
- Select `aria-label="Kiểu phí"` từ `BILLING_OPTIONS`.
- Select `aria-label="Số lượng lấy từ"` từ `QUANTITY_OPTIONS`.
- Hàng nút: `<Button type="button">` nhãn `submitLabel` (disabled khi `pending`), và `onCancel` → nút "Huỷ" (`variant="outline"`).

Kiểm tra trước khi gọi `onSubmit` (lỗi hiện dưới ô tương ứng, không gửi server):
- `name.trim() === ''` → `"Nhập tên loại phí"`.
- `unitChoice === '__new__' && newUnitName.trim() === ''` → `"Nhập tên đơn vị"`.
- `!/^\d+$/.test(price.trim())` → `"Đơn giá không hợp lệ"`.
- `unitChoice !== '__new__' && !unitChoice` → `"Chọn đơn vị"`.

State `billing` / `quantityFrom` để kiểu `string` (khớp dữ liệu DB); khi submit ép `billing as FeeFormValues['billing']`, `quantityFrom as FeeFormValues['quantityFrom']`. Gọi `onSubmit({ name: name.trim(), ...(unitChoice === '__new__' ? { newUnitName: newUnitName.trim() } : { unitId: unitChoice }), defaultPrice: Number(price), billing: billing as FeeFormValues['billing'], quantityFrom: quantityFrom as FeeFormValues['quantityFrom'] })`. Hiện `error` của props phía trên hàng nút; `fieldErrors.name` / `fieldErrors.unitId` ưu tiên hiện dưới ô tương ứng.

- [ ] **Step 3: Nối form vào `FeesTab`**

Trong `settings-tabs.tsx`: xoá state `t` và khối `<div className="grid max-w-xl ...">Thêm loại phí</div>` ở cuối `FeesTab`. Thêm:

```tsx
const [adding, setAdding] = useState(false)
...
<Button type="button" variant="outline" onClick={() => setAdding(!adding)} aria-expanded={adding}>+ Thêm loại phí</Button>
{adding && <FeeTypeForm units={units} allowNewUnit pending={pending} error={error} submitLabel="Tạo loại phí"
  onCancel={() => setAdding(false)}
  onSubmit={(values) => run(async () => { const r = await createFeeTypeAction(values); if (r.ok) setAdding(false); return r }, 'Đã thêm loại phí')} />}
```

Bảng, các khối mặc định/giá riêng và ô thêm đơn vị ở trên giữ nguyên trong task này.

- [ ] **Step 4: Lint và build**

Run: `npm run lint && npm run build`
Expected: PASS, không cảnh báo import/biến thừa.

- [ ] **Step 5: Kiểm tra tay**

Mở `/settings` → tab phí: bấm **+ Thêm loại phí**, tạo phí mới chọn đơn vị có sẵn; tạo phí thứ hai với "Đơn vị mới…" nhập `kWh`; xác nhận phí xuất hiện trong bảng và `kWh` nằm trong dải đơn vị ở trên.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/components/fee-options.ts src/features/settings/components/fee-type-form.tsx src/features/settings/components/settings-tabs.tsx
git commit -m "feat: form tạo loại phí dùng chung, tạo đơn vị tại chỗ"
```

---

### Task 4: Thẻ loại phí thay bảng và các khối rời

**Files:**
- Create: `src/features/settings/components/use-run.ts`
- Create: `src/features/settings/components/fee-type-card.tsx`
- Modify: `src/features/settings/components/fee-options.ts` (thêm `isPriceInput`)
- Modify: `src/features/settings/components/settings-tabs.tsx` — xoá `FeeDefaults`, `FeePrices`, bảng loại phí; `FeesTab` render danh sách `FeeTypeCard`; dùng `useRun`/`Msg` từ file mới.
- Test: `tests/unit/settings/fee-options.test.ts`

**Interfaces:**
- Produces:
  - `useRun()` → `{ pending, error, ok, run }` giống hệt bản đang có trong `settings-tabs.tsx`; `Msg({ error, ok })`.
  - `isPriceInput(value: string): boolean` — `true` khi chuỗi sau trim chỉ gồm chữ số.
  - `FeeTypeCard(props: { fee: { id: string; name: string; unitId: string; defaultPrice: number; billing: string; quantityFrom: string }; unitName: string; facilities: { id: string; name: string }[]; defaultFacilityIds: string[]; prices: Record<string, number> })` — `<article aria-label={fee.name}>`; tự gọi `setFeeDefaultAction`, `setFeeTypePriceAction`, `removeFeeTypePriceAction`, `updateFeeTypeAction`, `archiveFeeTypeAction`.

- [ ] **Step 1: Viết test cho `isPriceInput`**

Tạo `tests/unit/settings/fee-options.test.ts`:

```ts
import { expect, it } from 'vitest'
import { isPriceInput } from '@/features/settings/components/fee-options'

it('chỉ nhận chuỗi số nguyên không âm cho ô giá', () => {
  expect(isPriceInput('3500')).toBe(true)
  expect(isPriceInput(' 0 ')).toBe(true)
  expect(isPriceInput('')).toBe(false)
  expect(isPriceInput('   ')).toBe(false)
  expect(isPriceInput('3,5')).toBe(false)
  expect(isPriceInput('-1')).toBe(false)
  expect(isPriceInput('12abc')).toBe(false)
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/unit/settings/fee-options.test.ts`
Expected: FAIL — `isPriceInput` chưa tồn tại.

- [ ] **Step 3: Thêm `isPriceInput`**

```ts
export function isPriceInput(value: string) { return /^\d+$/.test(value.trim()) }
```

- [ ] **Step 4: Chạy test để xác nhận đạt**

Run: `npx vitest run tests/unit/settings/fee-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Tách `use-run.ts`**

Chuyển nguyên `useRun` và `Msg` từ `settings-tabs.tsx` sang file mới, export cả hai; `settings-tabs.tsx` import lại. Hành vi không đổi (kể cả `router.refresh()` sau thành công).

- [ ] **Step 6: Tạo `fee-type-card.tsx`**

Cấu trúc thẻ:
- Đầu thẻ: tên phí (đậm) + dòng phụ `unitName · {formatVND(defaultPrice)} đ · {billingLabel(billing)}` (thêm ` · {quantityLabel(quantityFrom)}` khi khác `'manual'`); bên phải nút **Sửa** (`variant="outline"`, `aria-label={'Sửa phí ' + fee.name}`) và **Lưu trữ**.
- **Lưu trữ**: `if (!window.confirm('Lưu trữ phí ' + fee.name + '?')) return`, rồi `run(() => archiveFeeTypeAction(fee.id), 'Đã lưu trữ')`.
- **Sửa**: bật `editing`; thân thẻ thay bằng `FeeTypeForm` (`allowNewUnit={false}`, `initial` từ `fee`, `submitLabel="Lưu"`, `onCancel` tắt `editing`), submit gọi `updateFeeTypeAction(fee.id, values)` và tắt `editing` khi `ok`.
- **Mặc định cho cơ sở**: mỗi cơ sở một `<label>` chứa `<input type="checkbox" checked={...} disabled={pending}>` + tên cơ sở. State `Record<facilityId, boolean>` khởi tạo từ `defaultFacilityIds`; khi bấm, cập nhật lạc quan, gọi `setFeeDefaultAction`, lỗi thì hoàn tác và hiện lỗi (giống `FeeDefaults` hiện tại).
- **Giá riêng theo toà**: mỗi cơ sở một hàng: tên cơ sở; `Input aria-label={'Giá riêng ' + fee.name + ' tại ' + f.name}`, `inputMode="numeric"`, `placeholder={'Theo giá chung ' + formatVND(fee.defaultPrice)}`, giá trị state `values[f.id]` khởi tạo `prices[f.id] == null ? '' : String(prices[f.id])`; nút **Lưu** (`disabled={pending || !isPriceInput(values[f.id]) || Number(values[f.id]) === prices[f.id]}`) gọi `setFeeTypePriceAction({ feeTypeId, facilityId, price: Number(values[f.id]) })`; nút **Xoá** chỉ hiện khi `prices[f.id] != null`, gọi `removeFeeTypePriceAction` rồi xoá state về `''` khi thành công.
- Cuối thẻ: `<Msg error={error} ok={ok} />`.

- [ ] **Step 7: Thay bảng và các khối rời trong `FeesTab`**

Xoá component `FeeDefaults`, `FeePrices`, bảng `<table>` loại phí, và hai vòng `feeTypes.map(...)` tương ứng. `FeesTab` còn: ô thêm đơn vị (giữ tạm đến Task 5), nút + form tạo, rồi:

```tsx
<div className="space-y-3">
  {feeTypes.map((fee) => (
    <FeeTypeCard key={fee.id} fee={fee}
      unitName={unitName.get(fee.unitId) ?? ''}
      facilities={facilities}
      defaultFacilityIds={facilities.filter((f) => defaults[f.id]?.includes(fee.id)).map((f) => f.id)}
      prices={prices[fee.id] ?? {}} />
  ))}
</div>
```

Cập nhật `FeeT` thêm `isActive: boolean` (Task 5 dùng).

- [ ] **Step 8: Lint, build, test**

Run: `npm run lint && npm run build && npm test`
Expected: PASS.

- [ ] **Step 9: Kiểm tra tay**

Trên `/settings`: mỗi phí là một thẻ; sửa tên/đơn giá cập nhật ngay; bật/tắt mặc định theo cơ sở; nhập giá riêng và Xoá; lưu trữ hỏi xác nhận rồi thẻ biến mất.

- [ ] **Step 10: Commit**

```bash
git add src/features/settings/components/use-run.ts src/features/settings/components/fee-type-card.tsx src/features/settings/components/fee-options.ts src/features/settings/components/settings-tabs.tsx tests/unit/settings/fee-options.test.ts
git commit -m "feat: mỗi loại phí một thẻ trong cài đặt"
```

---

### Task 5: Khung tab Phí dịch vụ — đã lưu trữ, dải đơn vị, dữ liệu, e2e

**Files:**
- Create: `src/features/settings/components/fee-settings.tsx`
- Modify: `src/features/settings/components/settings-tabs.tsx` — xoá `FeesTab`, chỉ còn `Tabs`; tab `fees` đổi nhãn **"Phí dịch vụ"** và render `FeeSettings`.
- Modify: `src/app/(app)/settings/page.tsx:19` — gọi `listFeeTypes(db, ctx, { includeArchived: true })`.
- Modify: `tests/e2e/contract-create-one-page.spec.ts:176-210` — theo UI mới.

**Interfaces:**
- Consumes: `FeeTypeCard`, `FeeTypeForm`, `useRun`, `Msg`, `billingLabel`, `isPriceInput`.
- Produces: `FeeSettings(props: { facilities: { id: string; name: string }[]; units: { id: string; name: string }[]; feeTypes: Array<{ id: string; name: string; unitId: string; defaultPrice: number; billing: string; quantityFrom: string; isActive: boolean }>; prices: Record<string, Record<string, number>>; defaults: Record<string, string[]> })`.

- [ ] **Step 1: Tạo `fee-settings.tsx`**

Bố cục theo thứ tự:
1. Hàng tiêu đề: `<h2 className="font-semibold">Phí dịch vụ</h2>` + `<Button type="button" variant="outline" aria-expanded={adding}>+ Thêm loại phí</Button>`.
2. Khi `adding`: `FeeTypeForm` (`allowNewUnit`, `submitLabel="Tạo loại phí"`, submit qua `createFeeTypeAction`, thành công thì đóng form + `'Đã thêm loại phí'`).
3. Danh sách `feeTypes.filter((f) => f.isActive)` → `FeeTypeCard`.
4. `<details>` với `<summary>Đã lưu trữ ({archived.length})</summary>` (chỉ render khi `archived.length > 0`); mỗi dòng: tên phí + đơn vị + `<Button size="sm" variant="outline">Khôi phục</Button>` gọi `restoreFeeTypeAction(fee.id)`, kèm `Msg`.
5. Dải đơn vị: `<section>` tiêu đề "Đơn vị tính"; các chip chỉ đọc `<span className="rounded-full border px-2 py-0.5 text-xs">{u.name}</span>`; nút "+ Thêm đơn vị" mở Input placeholder `"Tên đơn vị mới"` + nút "Lưu đơn vị" gọi `createFeeUnitAction({ name })`, thành công thì xoá input.

- [ ] **Step 2: Rút gọn `settings-tabs.tsx`**

Xoá `FeesTab`, state/import không còn dùng (`createFeeTypeAction`, `setFeeDefaultAction`, `setFeeTypePriceAction`, `removeFeeTypePriceAction`, `archiveFeeTypeAction`, `createFeeUnitAction`, `createRateAction` vẫn cần cho tab đơn giá), giữ `useRun` import cho các tab khác. Tabs:

```tsx
<TabsTrigger value="fees">Phí dịch vụ</TabsTrigger>
...
<TabsContent value="fees"><FeeSettings defaults={defaults} units={units} feeTypes={feeTypes} facilities={facilities} prices={prices} /></TabsContent>
```

- [ ] **Step 3: Trang Cài đặt lấy cả phí đã lưu trữ**

Đổi dòng 19 sang `listFeeTypes(db, ctx, { includeArchived: true })`. Không đổi chỗ khác.

- [ ] **Step 4: Cập nhật e2e**

Trong `contract-create-one-page.spec.ts`, test `'phí mặc định theo cơ sở tự thêm và có thể xóa hoặc thêm lại'`:
- Cả hai chỗ `getByRole('tab', { name: 'Đơn vị & loại phí' })` (dòng 181 và 203) đổi thành `'Phí dịch vụ'`.
- Tạo: click `page.getByRole('button', { name: 'Thêm loại phí' })`, điền như cũ, rồi click `page.getByRole('button', { name: 'Tạo loại phí' })`.
- Thẻ: `const card = page.getByRole('article', { name: feeName })`; checkbox `card.getByRole('checkbox', { name: 'Thảo Điền' })`.
- Dọn dẹp: `page.on('dialog', (d) => d.accept())` trước khi tìm thẻ; thay khối `getByRole('row')` bằng `const card = page.getByRole('article', { name: feeName }); if (await card.count()) await card.getByRole('button', { name: 'Lưu trữ' }).click()`.
- Bỏ mọi phụ thuộc vào `'Mặc định theo cơ sở — '` và `getByRole('row')`.

- [ ] **Step 5: Lint, build, test**

Run: `npm run lint && npm run build && npm test`
Expected: PASS.

- [ ] **Step 6: Chạy e2e nếu có môi trường thử**

Run: `E2E_BASE_URL=<môi trường có NEXT_PUBLIC_DEMO_MODE=1> npm run test:e2e -- contract-create-one-page.spec.ts`
Expected: PASS. Nếu không có môi trường, ghi rõ trong commit/báo cáo là chưa chạy.

- [ ] **Step 7: Kiểm tra tay toàn tab**

Tạo phí mới với đơn vị mới → thấy thẻ; sửa thẻ; bật mặc định; đặt và xoá giá riêng; lưu trữ → nằm trong "Đã lưu trữ (n)"; khôi phục → về danh sách với mặc định + giá riêng còn nguyên; mở `/contracts/new`, chọn phòng cùng cơ sở → phí mặc định tự thêm, giá riêng được dùng.

- [ ] **Step 8: Commit**

```bash
git add src/features/settings/components/fee-settings.tsx src/features/settings/components/settings-tabs.tsx "src/app/(app)/settings/page.tsx" tests/e2e/contract-create-one-page.spec.ts
git commit -m "feat: gọn lại tab phí dịch vụ trong cài đặt"
```

---
