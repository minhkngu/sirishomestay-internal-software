# Ô nhập tiền tự thêm dấu chấm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi ô nhập tiền VND tự hiện dấu chấm hàng nghìn khi gõ/dán, vẫn gửi server số nguyên thô.

**Architecture:** Thêm hàm `parseMoneyInput` cạnh `formatVND`, và component `MoneyInput` giữ chuỗi số thô do component cha quản lý, định dạng hiển thị bằng `formatVND`, xử lý con trỏ và dán. Chỉ thay các ô tiền; hiển thị, PDF/Word và các ô số khác không đổi.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-o-nhap-tien-tu-them-dau-cham-design.md`

## Global Constraints

- Chỉ ô nhập tiền thay đổi; không đổi hiển thị, PDF/Word/Excel, ô số lượng/diện tích/chỉ số/hệ số.
- Không thêm thư viện.
- Dữ liệu gửi server là chuỗi số nguyên thô, không có dấu chấm.
- Không đổi schema, service hay quy tắc tính tiền.
- Giao diện và chuỗi tiếng Việt giữ nguyên.

## Review Focus

- Sửa giữa số: con trỏ ở đúng vị trí sau khi định dạng lại.
- Gõ thêm `0` vào `1.500` phải thành `15.000`, không thành `1,5` hay `1`.
- Dán `1.500.000`, `15,000,000`, `15000000` cho cùng kết quả; dán vào giữa chuỗi không làm mất phần còn lại.
- Ô trống vẫn trống, không tự thành `0`.
- Số âm ở ô thanh toán/hoàn tiền và đơn giá dòng điều chỉnh giữ dấu `-`.
- Ô tiền trong `<form>` gửi đúng số thô qua `name` (hidden input), không gửi chuỗi có dấu chấm.
- Validator hiện có (`/^\d+$/`, `Number(...)`, `Number.isSafeInteger`) vẫn nhận chuỗi thô.
- Các ô không phải tiền và e2e hiện có không bị ảnh hưởng.

---

### Task 1: Hàm parse tiền

**Files:**
- Modify: `src/domain/money.ts`
- Test: `tests/unit/domain/money.test.ts`

**Interfaces:**
- Produces: `parseMoneyInput(text: string): string` — trả chuỗi số nguyên thô, `''` nếu rỗng, giữ `-` đầu.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/unit/domain/money.test.ts`:

```ts
describe('parseMoneyInput', () => {
  it('bỏ dấu phân cách và phần lẻ', () => {
    expect(parseMoneyInput('15000000')).toBe('15000000')
    expect(parseMoneyInput('15.000.000')).toBe('15000000')
    expect(parseMoneyInput('15,000,000')).toBe('15000000')
    expect(parseMoneyInput('15.000.000,50')).toBe('15000000')
    expect(parseMoneyInput(' 1 500 000 ')).toBe('1500000')
  })
  it('giữ dấu âm và chuỗi rỗng', () => {
    expect(parseMoneyInput('-1.500.000')).toBe('-1500000')
    expect(parseMoneyInput('')).toBe('')
    expect(parseMoneyInput('-')).toBe('-')
    expect(parseMoneyInput('abc')).toBe('')
  })
})
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npx vitest run tests/unit/domain/money.test.ts`
Expected: FAIL — `parseMoneyInput is not a function`.

- [ ] **Step 3: Triển khai `parseMoneyInput`**

Trong `src/domain/money.ts`, thêm hàm bên cạnh `formatVND`. Cách làm: bỏ khoảng trắng; tách dấu `-` đầu; nếu có dấu `,`/`.` cuối cùng đứng trước 1–2 chữ số ở cuối thì cắt bỏ phần lẻ; bỏ mọi ký tự không phải chữ số; trả `'-' + digits` hoặc `''` nếu không còn chữ số. `'-'` đơn lẻ giữ `'-'`.

- [ ] **Step 4: Chạy test để thấy đạt**

Run: `npx vitest run tests/unit/domain/money.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/domain/money.ts tests/unit/domain/money.test.ts
git commit -m "feat: thêm parseMoneyInput cho ô nhập tiền"
```

---

### Task 2: Component `MoneyInput` và áp dụng thử ở form hợp đồng

**Files:**
- Create: `src/components/ui/money-input.tsx`
- Modify: `src/features/contracts/components/lease-wizard.tsx` (ô Giá thuê tháng, Tiền cọc, Tiền đã cọc)
- Test: `tests/e2e/money-input.spec.ts`

**Interfaces:**
- Consumes: `parseMoneyInput` (Task 1), `formatVND`.
- Produces: `MoneyInput(props)` với `value: string`, `onValueChange(raw: string): void`, `allowNegative?: boolean`, `name?: string`, và mọi props của `Input` (kể cả `ref`, `onKeyDown`, `aria-*`).

- [ ] **Step 1: Viết e2e thất bại**

Tạo `tests/e2e/money-input.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('ô tiền tự thêm dấu chấm và lưu đúng số', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/contracts/new')

  const rent = page.getByLabel('Giá thuê tháng (VND)')
  await rent.fill('15000000')
  await expect(rent).toHaveValue('15.000.000')

  await rent.press('End')
  await rent.press('0')
  await expect(rent).toHaveValue('150.000.000')

  await rent.fill('9000000')
  await rent.click()
  await rent.press('Home')
  await rent.press('ArrowRight')
  await rent.press('1')
  await expect(rent).toHaveValue('91.000.000')
})
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/money-input.spec.ts`
Expected: FAIL — giá trị vẫn là `15000000`.

- [ ] **Step 3: Triển khai `MoneyInput`**

Tạo component client dùng `Input` sẵn có:
- `display = value === '' || value === '-' ? value : formatVND(Number(value))` (nếu `Number(value)` không hữu hạn thì hiển thị `''`).
- Ô hiển thị `type="text"`, `inputMode="numeric"`, `autoComplete="off"`.
- `onKeyDown`: chặn mọi phím không phải chữ số, phím điều hướng/soạn thảo, và `-` chỉ ở vị trí đầu khi `allowNegative`; chặn `.`/`,`; ghép với `onKeyDown` của cha.
- `onChange` (bàn phím ảo/autofill): lấy giá trị đang thấy, bỏ dấu `.`, giữ `-` đầu và chữ số, rồi gọi `onValueChange`.
- `onPaste`: lấy clipboard, `parseMoneyInput`, chèn vào chuỗi thô tại vị trí con trỏ (thay vùng chọn nếu có), gọi `onValueChange`, `preventDefault`.
- Giữ con trỏ: lưu số ký tự có nghĩa (chữ số và `-`) trước con trỏ, sau render dùng `useLayoutEffect` đặt lại `setSelectionRange`.
- `onBlur`: nếu raw là `'-'` thì đổi thành `''`; gọi `onBlur` của cha.
- Có `name`: ô hiển thị không có `name`; render thêm `<input type="hidden" name={name} value={value} />`.
- Chuyển tiếp `ref` (React 19 nhận `ref` như prop) vào ô hiển thị, ghép với ref nội bộ.

- [ ] **Step 4: Thay 3 ô tiền trong `lease-wizard.tsx`**

Thay `Input` của Giá thuê tháng, Tiền cọc, Tiền đã cọc bằng `MoneyInput` với `value`/`onValueChange` tương ứng; giữ `id`, `aria-label` qua `Label`.

- [ ] **Step 5: Chạy e2e để thấy đạt**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/money-input.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/money-input.tsx src/features/contracts/components/lease-wizard.tsx tests/e2e/money-input.spec.ts
git commit -m "feat: ô nhập tiền tự thêm dấu chấm"
```

---

### Task 3: Thay các ô tiền còn lại

**Files (mỗi file: thay ô tiền bằng `MoneyInput`, giữ state chuỗi thô):**
- `src/features/settings/components/fee-type-form.tsx` — Đơn giá mặc định.
- `src/features/settings/components/fee-facilities-dialog.tsx` — giá theo cơ sở.
- `src/features/contracts/components/lease-fees.tsx` — Đơn giá từng phí, Đơn giá phí riêng.
- `src/features/contracts/components/deposit-form.tsx` — Tiền cọc giữ chỗ, Giá thuê thoả thuận.
- `src/features/contracts/components/contract-edit-actions.tsx` — Giá thuê, Tiền cọc.
- `src/features/contracts/components/transfer-wizard.tsx` — Giá thuê mới.
- `src/features/contracts/components/extension-dialog.tsx` — Giá thuê mới, Tiền cọc mới.
- `src/features/contracts/components/termination-wizard.tsx` — Số tiền mất cọc.
- `src/features/deposits/components/deposit-ledger.tsx` — Số tiền (form, `name="amount"`).
- `src/features/invoices/components/payment-dialog.tsx` — Số tiền (form, `name="amount"`, `allowNegative`).
- `src/features/charges/components/one-off-dialog.tsx` — Đơn giá (form, `name="unitPrice"`).
- `src/features/invoices/components/invoice-editor.tsx` — Đơn giá dòng (`allowNegative`).
- `src/features/handovers/components/asset-condition-row.tsx` — Tiền phạt.
- `src/features/assets/components/asset-form.tsx` — Giá trị.
- `src/features/contracts/components/lease-assets.tsx` — Giá trị tài sản mới.
- `src/features/rooms/components/room-edit-form.tsx` — Giá niêm yết (VND).
- `src/features/rooms/components/room-quick-actions.tsx` — Giá niêm yết trong popup sửa nhanh.
- `src/features/rooms/components/room-panels.tsx` — Giá niêm yết (thêm một phòng và tạo nhanh).

**Interfaces:**
- Consumes: `MoneyInput` (Task 2).
- Produces: không API mới.

- [ ] **Step 1: Thay từng ô tiền**

Với mỗi file trên: thay `Input`/`<input type="number">` của ô tiền bằng `MoneyInput`, truyền `value` hiện có, `onValueChange` gán thẳng chuỗi thô. Giữ nguyên `id`, `aria-label`, `className`, `disabled`, `required`, `placeholder`.
- Ô trong `<form>` truyền `name` để component render hidden input.
- `payment-dialog` số tiền và `invoice-editor` đơn giá dòng đặt `allowNegative`.
- Ô tiền đang `type="number"` bỏ `type`, `min`, `step` (component tự xử lý).
- Không đổi các ô số lượng, diện tích, chỉ số, hệ số, ngày, số tài khoản.

- [ ] **Step 2: Sửa chỗ đọc giá trị nếu cần**

Chỗ nào đang `Number(e.target.value)` cho ô tiền đổi sang `Number(raw)` từ `onValueChange`. Validator `/^\d+$/` vẫn dùng chuỗi thô nên giữ nguyên. Không đổi service/schema.

- [ ] **Step 3: Chạy e2e tiền và các luồng liên quan**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/money-input.spec.ts tests/e2e/contract-create-one-page.spec.ts tests/e2e/invoices.spec.ts tests/e2e/contract-quick-actions.spec.ts`
Expected: PASS.

- [ ] **Step 4: Chạy kiểm tra toàn bộ**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: test đạt; TypeScript không lỗi; lint không lỗi mới.

- [ ] **Step 5: Commit**

```bash
git add src/features
git commit -m "feat: áp dụng ô nhập tiền cho toàn bộ trường tiền"
```
