# Xử lý tài sản khi lập hợp đồng (Di chuyển / Thanh lý) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu "Xử lý tài sản" trong form hợp đồng chỉ còn **Di chuyển** (về kho hoặc sang phòng, ở bất kỳ cơ sở nào người dùng có quyền) và **Thanh lý**.

**Architecture:** Nới quy tắc chuyển tài sản ở tầng service (`moveAssetsInTransaction`) để cho phép đích ở cơ sở khác và đổi `facilityId`; hành động bàn giao `remove` đổi thành `move` (kèm đích) và `dispose`; form hợp đồng nhận danh sách đích từ trang `contracts/new`. Màn Tài sản giữ nguyên.

**Tech Stack:** Next.js 16 App Router, Drizzle + Postgres, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-xu-ly-tai-san-hop-dong-design.md`

## Global Constraints

- Service nhận `(db, ctx, input)`; kiểm quyền bằng `assertCan`/`can` ở `src/domain/access.ts`.
- `features` và `components` không import `db`; chỉ `app` import `features`; một feature không import feature khác.
- Chuỗi giao diện, comment, commit viết tiếng Việt; commit dạng `feat:` / `fix:`; không commit trên `main`; không `--no-verify`.
- Thanh lý giữ nguyên hành vi: `setAssetStatusInTransaction(..., 'disposed')`, ghi `assetMoves` với reason `Thanh lý`.
- Không đổi màn Tài sản và không migrate dữ liệu cũ đang ở vị trí `unassigned`.
- Test: `tests/integration` dùng PGlite; chạy test hẹp nhất chứng minh thay đổi.

## Review Focus

- Người thao tác có quyền ở cơ sở đi nhưng không có quyền ở cơ sở đích → bị từ chối, không tài sản nào đổi (Task 1).
- Di chuyển vào chính phòng đang lập hợp đồng → báo lỗi rõ, hợp đồng không được tạo (Task 2).
- Đích là phòng/cơ sở không tồn tại → `NotFoundError`, toàn bộ hợp đồng rollback (Task 2).
- Tài sản đã thanh lý không chuyển được dù qua form hợp đồng (Task 1).
- Đổi phòng trong form phải xóa các xử lý cũ, tránh giữ đích đã lỗi thời (Task 3, e2e).

---

### Task 1: Cho phép chuyển tài sản sang cơ sở khác

**Files:**
- Modify: `src/server/assets/service.ts:116-141` (`moveAssetsInTransaction`)
- Test: `tests/integration/assets.test.ts` (thay test ở dòng 56-61 "chuyển sang phòng thuộc cơ sở khác → ValidationError")

**Interfaces:**
- Consumes: `locationFacility(tx, loc: Location): Promise<string>`, `assertCan(ctx, 'assets', facilityId)`.
- Produces: `moveAssetsInTransaction(tx, ctx, assetIds, to: Location, reason)` giữ nguyên chữ ký; khi đích ở cơ sở khác thì cập nhật `assets.facilityId` thành cơ sở đích. Các task sau dựa vào hành vi này.

- [ ] **Step 1: Viết test (thất bại)** trong `tests/integration/assets.test.ts`, thay test cũ bằng:
  - `'admin chuyển sang phòng cơ sở khác → đổi vị trí và facilityId, ghi lịch sử'`: `moveAssets(db, admin, [a.id], { kind: 'room', id: r302 }, 'x')` rồi `getAsset` có `locationKind: 'room'`, `locationId: r302`, `facilityId: fa`; `assetHistory(...).moves[0]` có `toId: r302`.
  - `'thiếu quyền ở cơ sở đích → từ chối, không đổi gì'`: `moveAssets(db, hung(), [a.id], { kind: 'room', id: r302 }, 'x')` rejects `NotFoundError` (cơ sở `fa` ngoài phạm vi của `hung()`); tài sản vẫn `locationKind: 'warehouse'`, `facilityId: fb`.
  - `'tài sản đã thanh lý không chuyển được sang cơ sở khác'`: `setAssetStatus(db, admin, a.id, 'disposed')` rồi `moveAssets` rejects `ValidationError`.
- [ ] **Step 2: Chạy để thấy thất bại:** `npx vitest run tests/integration/assets.test.ts -t "cơ sở"` → test đầu FAIL với "Không thể chuyển tài sản sang cơ sở khác".
- [ ] **Step 3: Sửa `moveAssetsInTransaction`:** tính `destFacility` bằng `locationFacility` trước khi khóa; khóa `for('update')` hợp của các cơ sở nguồn và cơ sở đích theo thứ tự đã sắp xếp (tránh deadlock); gọi `assertCan(ctx, 'assets', destFacility)` thêm cho cơ sở đích; bỏ dòng chặn `a.facilityId !== destFacility`; khi `update` đặt thêm `facilityId: destFacility`; `after` của nhật ký thêm `facilityId: destFacility`. Giữ chặn tài sản `disposed`.
- [ ] **Step 4: Chạy lại:** `npx vitest run tests/integration/assets.test.ts` → toàn bộ PASS.
- [ ] **Step 5: Commit**
```bash
git add src/server/assets/service.ts tests/integration/assets.test.ts docs/superpowers/specs/2026-11-18-xu-ly-tai-san-hop-dong-design.md docs/superpowers/plans/2026-11-18-xu-ly-tai-san-hop-dong.md
git commit -m "feat: cho phép chuyển tài sản sang cơ sở khác khi có quyền cả hai cơ sở"
```

### Task 2: Hành động bàn giao `move` / `dispose`

**Files:**
- Modify: `src/server/contracts/service.ts:147` (kiểu `handover.remove`) và `:248-252` (vòng xử lý `h.remove`)
- Test: `tests/integration/contracts.test.ts` (sửa test dòng ~184 và ~197; thêm test mới)

**Interfaces:**
- Consumes: `moveAssetsInTransaction` từ Task 1; `setAssetStatusInTransaction`.
- Produces: kiểu
  `remove: Array<{ assetId: string; action: 'dispose' } | { assetId: string; action: 'move'; to: { kind: 'warehouse' | 'room'; id: string } }>`.
  Task 3 gửi đúng dạng này. `warehouse` và `unassigned` không còn được nhận (trả `ValidationError('Cách xử lý tài sản không hợp lệ')`).

- [ ] **Step 1: Viết/sửa test (thất bại)** trong `tests/integration/contracts.test.ts`:
  - Sửa test `'áp dụng tài sản và tạo snapshot…'`: thay `action: 'warehouse'` bằng `{ action: 'move', to: { kind: 'warehouse', id: fa } }`; thêm một tài sản chuyển sang phòng cơ sở khác (`{ action: 'move', to: { kind: 'room', id: <phòng cơ sở khác> } }`) và kiểm tra `facilityId` của nó đổi theo.
  - Sửa test `'rollback toàn bộ khi mã tài sản mới trùng'`: thay `'unassigned'` bằng `action: 'move'` với đích kho.
  - Thêm `'từ chối di chuyển vào chính phòng đang lập hợp đồng'`: `remove: [{ assetId, action: 'move', to: { kind: 'room', id: r301 } }]` rejects `ValidationError`; `leases` rỗng.
  - Thêm `'từ chối đích không tồn tại và rollback'`: `to: { kind: 'room', id: crypto.randomUUID() }` rejects `NotFoundError`; `leases` và `handovers` rỗng.
  - Thêm `'từ chối hành động cũ warehouse/unassigned'`: `action: 'warehouse'` (ép kiểu `as never`) rejects `ValidationError`.
  - Thêm `'thiếu quyền ở cơ sở đích → hợp đồng không được tạo'`: ctx có `assets` + `tenants_contracts` chỉ ở cơ sở của phòng; đích là phòng cơ sở khác → rejects; `leases` rỗng.
- [ ] **Step 2: Chạy:** `npx vitest run tests/integration/contracts.test.ts -t "tài sản"` → FAIL (kiểu/hành động chưa hỗ trợ).
- [ ] **Step 3: Sửa service:** cập nhật kiểu `remove` như trên; trong vòng `for (const item of h.remove)`: `dispose` giữ nguyên; `move` kiểm tra `to.kind` thuộc `['warehouse','room']`, từ chối nếu `to.kind === 'room' && to.id === room.id` (`ValidationError('Không thể chuyển tài sản vào chính phòng đang lập hợp đồng')`), rồi gọi `moveAssetsInTransaction(tx, ctx, [item.assetId], item.to, 'Bàn giao nhận phòng')`; mọi giá trị khác ném `ValidationError('Cách xử lý tài sản không hợp lệ')`.
- [ ] **Step 4: Chạy lại** `npx vitest run tests/integration/contracts.test.ts tests/integration/assets.test.ts` → PASS. Chạy `npx tsc --noEmit` để thấy chỗ UI còn dùng kiểu cũ (sẽ sửa ở Task 3).
- [ ] **Step 5: Commit**
```bash
git add src/server/contracts/service.ts tests/integration/contracts.test.ts
git commit -m "feat: bàn giao hợp đồng xử lý tài sản bằng di chuyển hoặc thanh lý"
```

### Task 3: Menu 2 lựa chọn và chọn đích trong form hợp đồng

**Files:**
- Modify: `src/features/contracts/components/lease-assets.tsx` (kiểu `AssetChanges`, menu dòng ~51-52, props)
- Modify: `src/features/contracts/components/lease-wizard.tsx` (props, truyền `moveTargets` xuống `LeaseAssets` ở dòng ~168)
- Modify: `src/app/(app)/contracts/new/page.tsx` (dựng `moveTargets`, truyền vào `LeaseWizard`)
- Test: `tests/e2e/contract-create-one-page.spec.ts`

**Interfaces:**
- Consumes: kiểu `remove` từ Task 2.
- Produces: export từ `lease-assets.tsx`:
  `type MoveTargets = { warehouses: { facilityId: string; label: string }[]; rooms: { id: string; facilityId: string; label: string }[] }`;
  `AssetChanges.remove: ({ assetId: string; action: 'dispose' } | { assetId: string; action: 'move'; to: { kind: 'warehouse' | 'room'; id: string } })[]`;
  prop mới `moveTargets: MoveTargets` cho `LeaseAssets` và `LeaseWizard`.

- [ ] **Step 1: Viết e2e (thất bại)** trong `tests/e2e/contract-create-one-page.spec.ts`, theo mẫu và hàm hỗ trợ có sẵn trong tệp: `'di chuyển tài sản sang kho khi lập hợp đồng'` — chọn phòng có tài sản, bấm "Xử lý tài sản", thấy đúng 2 mục "Di chuyển" và "Thanh lý" (không có "Bỏ khỏi phòng"), chọn Di chuyển → chọn một kho, dòng tài sản hiện "Di chuyển → Kho …", lưu hợp đồng thành công; và `'đổi phòng xóa các xử lý đã chọn'`.
- [ ] **Step 2: Chạy preflight rồi test hẹp:** `node scripts/e2e-preflight.mjs` rồi `E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/contract-create-one-page.spec.ts -g "di chuyển"` → FAIL.
- [ ] **Step 3: Trang `contracts/new/page.tsx`:** dựng `moveTargets` từ `facs` và `rooms` đã có, chỉ giữ cơ sở có `can(ctx, 'assets', f.id)`: `warehouses` nhãn `Kho ${f.name}`, `rooms` nhãn `${f.name} · ${r.code}`; truyền `moveTargets` vào `LeaseWizard`.
- [ ] **Step 4: `lease-wizard.tsx`:** thêm prop `moveTargets: MoveTargets` và truyền xuống `LeaseAssets`; payload `handover.remove` dùng `changes.remove` như cũ.
- [ ] **Step 5: `lease-assets.tsx`:** menu còn 2 mục. "Thanh lý" thêm `{ assetId, action: 'dispose' }`. "Di chuyển" mở ô chọn đích (kho và phòng, nhóm theo cơ sở; loại trừ phòng `roomId` đang lập hợp đồng) rồi thêm `{ assetId, action: 'move', to }`. Nhãn dòng: `Thanh lý` hoặc `Di chuyển → <nhãn đích>`. Giữ "Đổi cách xử lý" và "Giữ lại". Không còn chuỗi "Chuyển vào kho" và "Bỏ khỏi phòng".
- [ ] **Step 6: Kiểm tra:** `npx tsc --noEmit` đạt; `npm run lint` không lỗi mới; chạy lại e2e hẹp → PASS; `npx vitest run tests/integration/contracts.test.ts tests/integration/assets.test.ts` → PASS.
- [ ] **Step 7: Kiểm tra thủ công** ở `http://localhost:3001/contracts/new`: chọn phòng có tài sản, thử Di chuyển (kho, phòng cùng cơ sở, phòng cơ sở khác), Thanh lý, Đổi cách xử lý, Giữ lại; xác nhận tài sản đã chuyển xuất hiện đúng ở màn Tài sản và lịch sử di chuyển.
- [ ] **Step 8: Chạy toàn bộ một lần ở cuối:** `npm test` và e2e đầy đủ một lần.
- [ ] **Step 9: Commit**
```bash
git add src/features/contracts src/app/\(app\)/contracts/new/page.tsx tests/e2e/contract-create-one-page.spec.ts
git commit -m "feat: menu xử lý tài sản chỉ còn di chuyển và thanh lý"
```
