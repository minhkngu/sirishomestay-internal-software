# Menu lọc đóng khi bấm ra ngoài — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu lọc "Tất cả toà" đóng khi bấm ra ngoài hoặc nhấn `Esc`, không chặn nội dung bên dưới.

**Architecture:** Giữ nguyên `<details>` trong `FacilityFilter`; thêm `ref` và hai listener cấp `document` (`pointerdown`, `keydown`) do một `useEffect` quản lý. Không đổi giao diện, dữ liệu hay cách lọc.

**Tech Stack:** Next.js 16, React 19, TypeScript, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-19-menu-loc-dong-khi-bam-ra-ngoai-design.md`

## Global Constraints

- Giao diện và chuỗi tiếng Việt giữ nguyên.
- Không thêm thư viện.
- Không sửa các menu Base UI (`DropdownMenu`, `Popover`, `Dialog`) hay accordion nội tuyến.
- Chỉ đụng `src/components/list/facility-filter.tsx` và test e2e mới.

## Review Focus

- Bấm vào chính `<summary>` khi menu đang mở: phải đóng như hành vi native, không bị listener chặn.
- Bấm vào checkbox/nút "Tất cả toà" bên trong menu: menu phải giữ mở để chọn tiếp.
- `Esc` khi menu đang mở: đóng và đưa focus về `<summary>`.
- Component unmount khi còn mở: listener phải được gỡ, không rò rỉ.

---

### Task 1: Đóng menu lọc khi bấm ngoài và khi nhấn Esc

**Files:**
- Modify: `src/components/list/facility-filter.tsx`
- Create: `tests/e2e/facility-filter-dismiss.spec.ts`

**Interfaces:**
- Consumes: `FacilityFilter({ facilities }: { facilities: { id: string; name: string }[] })` (giữ nguyên).
- Produces: không có API mới; chỉ hành vi đóng menu.

- [ ] **Step 1: Viết e2e thất bại**

```ts
import { test, expect } from '@playwright/test'

test('menu lọc đóng khi bấm ra ngoài hoặc nhấn Esc', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/invoices?view=all')

  const details = page.locator('details').first()
  const summary = details.locator('summary')

  await summary.click()
  await expect(details).toHaveAttribute('open', '')

  await page.mouse.click(900, 600)
  await expect(details).not.toHaveAttribute('open', '')

  await summary.click()
  await expect(details).toHaveAttribute('open', '')
  await page.keyboard.press('Escape')
  await expect(details).not.toHaveAttribute('open', '')
  await expect(summary).toBeFocused()
})
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/facility-filter-dismiss.spec.ts`
Expected: FAIL — `details` vẫn còn thuộc tính `open` sau khi bấm ra ngoài.

- [ ] **Step 3: Triển khai trong `src/components/list/facility-filter.tsx`**

Thêm `useRef<HTMLDetailsElement>(null)` gắn vào `<details>`, và `useEffect` đăng ký:

- `document.addEventListener('pointerdown', handler)` (capture): nếu `detailsRef.current?.open` và `event.target` không nằm trong `detailsRef.current` thì `detailsRef.current.open = false`.
- `document.addEventListener('keydown', handler)` (capture): nếu đang mở và `event.key === 'Escape'` thì đóng và gọi `summary?.focus()`.
- Cleanup gỡ cả hai listener.

- [ ] **Step 4: Chạy test để thấy đạt**

Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/facility-filter-dismiss.spec.ts`
Expected: PASS.

- [ ] **Step 5: Kiểm tra tĩnh và commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: không lỗi TypeScript; lint không có lỗi mới.

```bash
git add src/components/list/facility-filter.tsx tests/e2e/facility-filter-dismiss.spec.ts docs/superpowers/specs/2026-11-19-menu-loc-dong-khi-bam-ra-ngoai-design.md docs/superpowers/plans/2026-11-19-menu-loc-dong-khi-bam-ra-ngoai.md
git commit -m "fix: đóng menu lọc khi bấm ra ngoài hoặc nhấn Esc"
```
