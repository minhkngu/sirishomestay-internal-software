# Phí dịch vụ và người ở khi lập hợp đồng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo hợp đồng với người ký là người ở mặc định, phí mặc định theo cơ sở, phí riêng hợp đồng và đồng hồ tự tạo theo phí.

**Architecture:** Phân biệt hợp đồng cũ và mới bằng phiên bản tính phí lưu bền vững; hợp đồng mới lưu snapshot từng phí và cách lấy số lượng, trong khi hợp đồng cũ giữ nhánh tính hóa đơn hiện hữu. Danh mục chung, cấu hình mặc định theo cơ sở và đồng hồ phòng dùng định danh ổn định; phí riêng không tạo loại phí chung. Tạo hợp đồng, phí và đồng hồ trong cùng transaction; hóa đơn đọc số lượng theo cấu hình và đơn giá snapshot.

**Tech Stack:** Next.js App Router 16.4.6, React 19, TypeScript, Drizzle/Postgres, Vitest/PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-phi-dich-vu-nguoi-o-hop-dong-design.md`

## Global Constraints

- Chỉ thực hiện luồng tạo hợp đồng mới; phụ lục, chuyển phòng và kết thúc hợp đồng nằm ngoài phạm vi triển khai lần này.
- Hợp đồng cũ, sổ cọc và hóa đơn đã lập giữ nguyên ý nghĩa; không suy diễn lại dịch vụ nước của chúng dựa trên cài đặt mới.
- Mọi dịch vụ được cấu hình rõ cách tính và nguồn số lượng, không suy đoán từ tên gọi: theo người, theo phòng, theo đồng hồ hoặc theo số lượng thực tế nhập mỗi kỳ.
- Mọi khoản phí dùng đơn giá ghi trong hợp đồng. Số lượng theo phương thức của dịch vụ: theo số người ở của hợp đồng, theo phòng (luôn là 1), hoặc theo lượng sử dụng thực tế.
- Phí riêng chỉ thuộc hợp đồng đang lập; không thêm vào danh mục chung. Phí mặc định theo cơ sở, không có cấu hình riêng theo phòng.
- Không tạo đồng hồ chỉ vì người dùng đang chỉnh biểu mẫu; đồng hồ chỉ được tạo khi hợp đồng tạo thành công.
- Đọc hướng dẫn tương ứng trong `node_modules/next/dist/docs/` trước khi sửa code Next.js; dùng skill `supabase-postgres-best-practices` trước khi sửa schema Postgres.
- Giữ các thay đổi giao diện đã làm: tiền đã cọc cạnh tiền cọc và khu vực thêm tài sản mở bằng dấu cộng. Không ghi đè thay đổi người dùng đang có trong workspace.
- Kiểm tra `git status --short` trước mỗi task; không stage thay đổi có sẵn không liên quan. Chạy test thất bại trước mỗi thay đổi hành vi; commit file thuộc task sau khi kiểm tra staged diff.

## Review Focus

- Đồng hồ hai phí cùng tên hoặc cùng đơn vị không được gộp nhầm; dùng định danh phí, không dùng tên. Kiểm thử Task 3.
- Hai lần tạo đồng thời cho cùng phòng và phí không tạo hai đồng hồ hoạt động; một lần thất bại phải rollback lease, invoice, deposit, handover và đồng hồ. Kiểm thử Task 3.
- Thiếu chỉ số mới hoặc số lượng nhập tay không được tự biến thành 0 và ghi hóa đơn sai; báo rõ khoản/kỳ cần nhập. Kiểm thử Task 4.
- Đổi tên, giá hoặc lưu trữ phí chung sau khi ký không được đổi hóa đơn hoặc chi tiết của hợp đồng mới đã lưu. Kiểm thử Task 2 và 4.
- Hợp đồng cũ có cờ nước true/false, có đồng hồ điện/nước và giá cơ sở tiếp tục tính như trước, không phát sinh phí hai lần. Kiểm thử Task 4.

## Cấu trúc và hợp đồng dữ liệu

- `src/db/schema/{fees,contracts,meters,invoices}.ts`, `drizzle/` và `drizzle/meta/`: phiên bản tính phí; snapshot phí; cấu hình mặc định; liên kết đồng hồ và số lượng theo kỳ. Tạo migration theo `npm run db:generate`, không sửa migration cũ.
- `src/domain/types.ts`, `src/domain/invoice-builder.ts`: biểu diễn và tính phí mới, giữ nhánh cũ. `src/server/contracts/service.ts`, `src/server/invoices/service.ts`: lưu/đọc snapshot, tính hóa đơn và kiểm soát transaction.
- `src/server/fees/{service,actions}.ts`, `src/features/settings/components/settings-tabs.tsx`, `src/app/(app)/settings/page.tsx`: danh mục, cách tính và mặc định theo cơ sở, độc lập với giá riêng.
- `src/server/meters/{service,actions}.ts`, `src/features/meters/components/reading-grid.tsx`, `src/app/(app)/meters/page.tsx`: đồng hồ theo phí bất kỳ, nhập chỉ số và giữ khả năng đọc đồng hồ cũ.
- `src/features/contracts/components/lease-wizard.tsx`, `src/app/(app)/contracts/new/page.tsx`, `src/app/(app)/contracts/[id]/page.tsx`: chọn người ở, phí mặc định/thủ công, nhập chỉ số đầu và hiển thị snapshot.
- `src/features/invoices/components/invoice-editor.tsx`, `src/server/invoices/actions.ts`, `src/server/pdf/invoice-pdf.tsx` và bộ nạp/xuất giấy tờ: nhập số lượng thực tế mỗi kỳ, hiển thị/xuất phí mới.

**Các kiểu dùng chung:**

```ts
type FeeQuantitySource = 'occupants' | 'room' | 'meter' | 'period_input'
type LeaseFeeInput = {
  feeTypeId: string | null // null: phí chỉ thuộc hợp đồng
  name: string; unit: string; quantitySource: FeeQuantitySource
  unitPrice: number; initialReading?: number
  existingMeterId?: string // chỉ cho phí riêng đã có đồng hồ của phòng
}
```

Với phí chung, server lấy tên/đơn vị/cách tính từ loại phí hợp lệ và chỉ nhận đơn giá hợp đồng đã chọn; không tin snapshot từ client. Với phí riêng, server validate và lưu snapshot trực tiếp. Đồng hồ phí chung được định danh bằng `(roomId, feeTypeId)`; phí riêng mới có định danh phí của hợp đồng và đồng hồ riêng, không suy ra liên kết bằng tên. Khi muốn dùng lại đồng hồ phí riêng, giao diện cho chọn `existingMeterId` thuộc phòng; server xác minh quyền, trạng thái, phòng và tính tương thích, không đưa phí riêng vào danh mục chung. Đồng hồ đã có giữ lịch sử và không ghi đè chỉ số đầu; chỉ yêu cầu `initialReading` khi tạo đồng hồ mới. Đây là lựa chọn kỹ thuật để thực hiện yêu cầu dùng lại mà không gộp hai phí trùng tên.

---

### Task 1: Danh mục và phí mặc định theo cơ sở

**Files:** Modify `src/db/schema/fees.ts`, `src/server/fees/service.ts`, `src/server/fees/actions.ts`, `src/app/(app)/settings/page.tsx`, `src/features/settings/components/settings-tabs.tsx`; create migration và metadata Drizzle; test `tests/integration/fees.test.ts`.

**Interfaces:** Produces `FeeQuantitySource` như trên; `listFeeDefaults(db: Pick<DB, 'select'>, ctx: AccessContext): Promise<Record<string, string[]>>` trả `facilityId → feeTypeId[]` trong phạm vi được xem; `setFeeDefault(db: DB, ctx: AccessContext, input: { facilityId: string; feeTypeId: string; enabled: boolean }): Promise<void>` yêu cầu `settings`. Đánh dấu mặc định độc lập với `feeTypePrices`; các phí cũ giữ cách tính và mặc định không bật.

- [ ] Viết test tạo các phí `Rác` và `Nước`, đánh dấu `Rác` mặc định cơ sở A nhưng không B; bật/tắt không xóa giá riêng, không tạo phí trùng, phí lưu trữ không được tự chọn; thiếu quyền settings bị từ chối.
  Các assertion cốt lõi (dùng fixture `a`, `b`, `rac` của test):

  ```ts
  expect((await listFeeDefaults(db, admin))[a]).toContain(rac.id)
  expect((await listFeeDefaults(db, admin))[b] ?? []).not.toContain(rac.id)
  await expect(setFeeDefault(db, staff, { facilityId: a, feeTypeId: rac.id, enabled: true })).rejects.toThrow(ForbiddenError)
  ```

- [ ] Chạy `npx vitest run tests/integration/fees.test.ts`; Expected: FAIL vì chưa có cấu hình mặc định/cách tính mới.
- [ ] Mở rộng schema và validation cho bốn cách lấy số lượng; tạo bảng mặc định có khóa duy nhất `(facilityId, feeTypeId)` và migration. Bổ sung action và UI Cài đặt phí dịch vụ để chọn cách tính và bật/tắt theo cơ sở, giữ giá riêng và phí theo lần hiện có.
- [ ] Chạy `npx vitest run tests/integration/fees.test.ts` và `npx tsc --noEmit`; Expected: PASS.
- [ ] Commit các file task: `feat: cấu hình phí mặc định theo cơ sở`.

### Task 2: Snapshot phí và người ký khi tạo hợp đồng

**Files:** Modify `src/db/schema/contracts.ts`, `src/domain/types.ts`, `src/server/contracts/service.ts`, `src/server/invoices/service.ts`, `src/features/contracts/components/lease-wizard.tsx`; create migration và metadata; test `tests/integration/contracts.test.ts`, `tests/integration/invoices.test.ts`.

**Interfaces:** Consumes `FeeQuantitySource`, `LeaseFeeInput` và defaults Task 1. `LeaseInput.fees?: LeaseFeeInput[]` cho hợp đồng mới; `LeaseInput` tiếp tục nhận hình dạng phí cũ của caller hiện hữu qua union có phân biệt; `leases.feeModel` là `'legacy' | 'snapshot'`, dữ liệu cũ mặc định `'legacy'`, form mới gửi `'snapshot'`. Snapshot có ID dòng phí ổn định, `feeTypeId: string | null`, tên, đơn vị, `quantitySource`, đơn giá và dữ liệu cần thiết; không dùng tên làm ID. `ContractFee` và `leaseData` trả được cả hai dạng không làm mất phí riêng.

- [ ] Viết test công ty ký được tính một người; cá nhân ký cùng hai người bổ sung tính ba người, ID trùng chỉ tính một; đổi người ký trong UI giữ người thêm chủ động và không giữ người ký cũ trừ khi đã thêm chủ động. Caller cũ vẫn tạo hợp đồng như trước.
- [ ] Viết test chọn phí chung `Giặt` giá 20.000 và phí riêng `Dọn` giá 30.000, lưu/đọc đúng; đổi tên/giá hoặc lưu trữ `Giặt` sau đó, chi tiết hợp đồng vẫn giữ snapshot; danh mục không có `Dọn`.
  Assertions cốt lõi sau khi tạo `result` bằng fixture công ty, phí chung và phí riêng:

  ```ts
  const detail = await getLease(db, admin, result.lease.id)
  expect(detail.occupantIds).toEqual([company.id])
  expect(detail.fees.map(f => [f.name, f.unitPrice])).toEqual(expect.arrayContaining([['Giặt', 20_000], ['Dọn', 30_000]]))
  expect((await listFeeTypes(db, admin)).some(f => f.name === 'Dọn')).toBe(false)
  ```

- [ ] Chạy `npx vitest run tests/integration/contracts.test.ts tests/integration/invoices.test.ts`; Expected: FAIL vì công ty và snapshot phí riêng chưa được hỗ trợ.
- [ ] Thêm cột/bảng snapshot và migration có backfill an toàn; không thay đổi dữ liệu hợp đồng cũ. Mở rộng parser, insert và các reader `contractFees`, `leasesData`, `leaseData` để đọc snapshot mà không INNER JOIN bắt buộc vào danh mục. Xác thực số nguyên không âm, cơ sở, phí hoạt động và quyền; người ký luôn có mặt một lần.
- [ ] Chạy lại hai file test và `npx tsc --noEmit`; Expected: PASS, các test cũ về phí/người ở còn PASS.
- [ ] Commit các file task: `feat: lưu phí hợp đồng và người ký mặc định`.

### Task 3: Đồng hồ theo phí và tạo nguyên tử

**Files:** Modify `src/db/schema/meters.ts`, `src/server/meters/service.ts`, `src/server/contracts/service.ts`, `src/domain/types.ts`, `src/app/(app)/meters/page.tsx`, `src/features/meters/components/reading-grid.tsx`; create migration; test `tests/integration/meters.test.ts`, `tests/integration/contracts.test.ts`.

**Interfaces:** Consumes `LeaseFeeInput` Task 2. `ensureFeeMeter(tx: DB, ctx: AccessContext, input: { roomId: string; feeTypeId: string | null; leaseFeeId: string; existingMeterId?: string; initialReading?: number; installedOn: string }): Promise<{ id: string }>` dùng transaction hiện tại, khóa phòng và ràng buộc duy nhất đồng hồ phí chung hoạt động theo phòng; không tìm theo tên. Chỉ server gọi trong tạo hợp đồng đã được cấp quyền `tenants_contracts` tại phòng; action ghi chỉ số thông thường vẫn đòi quyền `meters`. Số đầu là số nguyên không âm, bắt buộc cho đồng hồ tạo mới.

- [ ] Viết test phí chung bất kỳ `ABC` theo đồng hồ tạo meter phòng với chỉ số đầu 123; hợp đồng sau trong cùng phòng dùng lại ID và không ghi đè chỉ số. Hai phí khác ID cùng tên tạo hai meter; phí riêng không tạo danh mục và chỉ dùng lại meter phòng khi chọn ID hợp lệ.
- [ ] Viết test chỉ mở/chỉnh biểu mẫu không tạo meter; thiếu/số âm/chỉ số lẻ bị từ chối; meter thuộc phòng hoặc cơ sở khác bị từ chối. Khi mã tài sản trùng hoặc xảy ra lỗi sau tạo meter, không còn lease/invoice/deposit/handover/meter mới.
- [ ] Viết test hai giao dịch cạnh tranh tạo cùng meter chung: chỉ một meter hoạt động; giao dịch còn lại dùng lại meter đã tồn tại hoặc thất bại rõ ràng mà không để dữ liệu dở dang. Dùng Postgres thật cho kiểm thử cạnh tranh nếu PGlite không hỗ trợ hai kết nối; không giả lập kết quả bằng mock.
  Assertions cốt lõi trên fixture phòng và phí meter:

  ```ts
  expect(firstMeter.startReading).toBe(123)
  expect(nextMeter.id).toBe(firstMeter.id)
  expect(sameNameOtherFeeMeter.id).not.toBe(firstMeter.id)
  expect(await db.select().from(leases)).toHaveLength(0) // sau giao dịch lỗi, trong test rollback riêng
  ```

- [ ] Chạy `npx vitest run tests/integration/meters.test.ts tests/integration/contracts.test.ts`; Expected: FAIL vì meter hiện chỉ hỗ trợ điện/nước và chưa gắn phí.
- [ ] Mở rộng schema, reader và bảng ghi chỉ số theo danh sách phí động, giữ nguyên đồng hồ điện/nước cũ và lịch sử. Gọi `ensureFeeMeter` trong cùng transaction `insertLease` sau khi validate phí, tạo lease fee, trước khi tạo hóa đơn; không mở transaction độc lập.
- [ ] Chạy lại các test và `npx tsc --noEmit`; Expected: PASS. Nếu không có Postgres thử riêng cho test cạnh tranh, ghi rõ test chưa chạy và không tuyên bố kiểm chứng cạnh tranh.
- [ ] Commit các file task: `feat: tạo và dùng lại đồng hồ theo phí`.

### Task 4: Tính và nhập phí theo kỳ hóa đơn

**Files:** Modify `src/domain/invoice-builder.ts`, `src/domain/types.ts`, `src/server/invoices/{service,actions}.ts`, `src/features/invoices/components/invoice-editor.tsx`, `src/server/pdf/invoice-pdf.tsx` và loader xuất hợp đồng phù hợp; add schema/migration nếu cần; test `tests/unit/domain/billing.test.ts`, `tests/integration/invoices.test.ts`, `tests/integration/invoice-pdf.test.ts`.

**Interfaces:** Consumes snapshot Task 2 và meter Task 3. `buildMonthlyInvoice` nhận thêm `periodQuantities: Array<{ leaseFeeId: string; period: string; quantity: number }>` và meter/readings theo ID phí; `saveInvoiceFeeQuantities(db: DB, ctx: AccessContext, invoiceId: string, quantities: Array<{ leaseFeeId: string; quantity: number }>): Promise<void>` chỉ sửa hóa đơn nháp, kiểm tra fee thuộc lease, số nguyên không âm và quyền billing. Một dòng duy nhất theo `(invoiceId, leaseFeeId)`; nhập lại cập nhật, không nhân đôi.

- [ ] Viết test hợp đồng snapshot: không phí → không có dòng điện/nước tự sinh; phí `A` theo người giá 10.000 với 2 người = 20.000; `B` theo phòng giá 30.000 = 30.000; `C` theo meter chỉ số 100→104 giá hợp đồng 5.000 = 20.000 dù giá cơ sở khác; `D` nhập tay 3 × 7.000 = 21.000. Dùng tên tùy ý và hai phí cùng tên để chứng minh không dựa tên.
- [ ] Viết test thiếu chỉ số và thiếu số lượng nhập tay: cảnh báo đúng phí/kỳ, không tạo dòng 0; nhập 0 tường minh hợp lệ; nhập lại không tạo dòng trùng, hóa đơn đã duyệt không sửa được. Kiểm tra phí riêng hiện trong chi tiết và PDF/xuất.
- [ ] Viết test hồi quy legacy: với cùng dữ liệu điện/nước và `billWaterByMeter` true/false, kết quả hóa đơn như trước; hóa đơn đã duyệt không bị tính lại khi danh mục hoặc giá thay đổi. Kiểm tra snapshot giá giữ nguyên sau sửa/lưu trữ loại phí.
  Assertions cốt lõi trên `result.lines` của fixture snapshot:

  ```ts
  expect(result.lines.find(l => l.description.startsWith('A'))?.amount).toBe(20_000)
  expect(result.lines.find(l => l.description.startsWith('B'))?.amount).toBe(30_000)
  expect(result.lines.find(l => l.description.startsWith('C'))?.amount).toBe(20_000)
  expect(result.lines.find(l => l.description.startsWith('D'))?.amount).toBe(21_000)
  ```

- [ ] Chạy `npx vitest run tests/unit/domain/billing.test.ts tests/integration/invoices.test.ts tests/integration/invoice-pdf.test.ts`; Expected: FAIL ở các hành vi snapshot.
- [ ] Thực hiện nhánh tính `feeModel === 'snapshot'` theo ID dòng phí, lượng đo/nhập và đơn giá hợp đồng; không thêm dòng utility ngầm. Giữ nhánh legacy nguyên nghĩa, kỳ và hóa đơn đã duyệt; bổ sung UI nhập lượng còn thiếu và loader/PDF cần thiết. Các phụ lục, chuyển phòng và kết thúc hợp đồng không được mở rộng trong task này.
- [ ] Chạy lại ba file test và `npx tsc --noEmit`; Expected: PASS.
- [ ] Commit các file task: `feat: tính phí hợp đồng theo cấu hình`.

### Task 5: Biểu mẫu tạo hợp đồng và kiểm chứng toàn luồng

**Files:** Modify `src/app/(app)/contracts/new/page.tsx`, `src/features/contracts/components/lease-wizard.tsx`, `src/app/(app)/contracts/[id]/page.tsx`; tách component phí nếu cần; test `tests/e2e/contract-create-one-page.spec.ts`.

**Interfaces:** Consumes Task 1–4. Page cung cấp defaults theo cơ sở, danh mục phí hoạt động và đồng hồ hiện có trong phạm vi phòng được phép; submit `feeModel: 'snapshot'` và `LeaseFeeInput[]`. Chọn phòng nạp mặc định đúng cơ sở; thay phòng cùng cơ sở không xóa phí đã sửa/thêm. Các trường chỉ số đầu chỉ hiện cho phí meter chưa có đồng hồ; phí riêng có lựa chọn meter của phòng để tái sử dụng. Người ký là người ở mặc định; thêm người là thao tác chủ động.

- [ ] Viết Playwright test chọn phòng A với hai phí mặc định, xóa một và thêm phí danh mục không mặc định cùng phí riêng; xác nhận không có phí không chọn, giữ hai trường cọc cạnh nhau, chỉ mở thêm tài sản bằng dấu cộng và không có checkbox nước độc lập.
- [ ] Viết test tạo hợp đồng công ty + một người bổ sung, phí theo người; tạo phí meter tên tùy ý, nhập chỉ số 123, tạo thành công và xác nhận meter/phí trong chi tiết; thử nhập liệu sai giữ form và không tạo hợp đồng/meter.
- [ ] Viết test hoàn chỉnh hóa đơn: nhập số lượng phí thủ công theo kỳ, xác nhận đơn giá snapshot, dòng phí và lượng đo; hợp đồng không chọn phí không tự có tiền điện/nước. Kiểm tra desktop/mobile và chuyển từ hợp đồng cọc, retry ảnh lỗi không tạo hợp đồng trùng.
- [ ] Chạy `E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/contract-create-one-page.spec.ts`; Expected: FAIL vì UI hiện chưa có các mục mới. Chỉ dùng cơ sở dữ liệu demo, xác minh migration trước khi chạy; không reset dữ liệu.
- [ ] Thực hiện giao diện theo các interface; thêm lỗi cạnh trường, chống submit trùng, giữ dữ liệu khi lỗi và giữ các thay đổi sẵn có của workspace.
- [ ] Chạy Playwright test trên, `npm test`, `npm run lint`, `npx tsc --noEmit` và `git diff --check`; Expected: PASS, báo rõ test bỏ qua hoặc cảnh báo. Kiểm tra thủ công desktop/mobile trên môi trường demo. Không khẳng định toàn luồng đạt nếu thiếu môi trường.
- [ ] Commit các file task: `feat: tạo hợp đồng với phí theo cơ sở`.
