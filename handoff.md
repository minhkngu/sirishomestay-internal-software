# Bàn giao — Siris plan 3

Cập nhật: 16/11/2026. Worktree: `/Users/minhkhoa/.codex/worktrees/9d10/siris-internal-software`.

## Trạng thái Git

Worktree này đang ở nhánh **`codex/plan-3`**, được tạo từ commit `9dcf63b`. Các commit trước đó ở đây là `5b9cc23`, `f352374`, `a950290`, `9dcf63b`. Checkout chính ở `/Users/minhkhoa/Library/Siris App/siris-internal-software` đang dùng `main` tại `f4f9615`. Task 14 đang làm dở; xem commit mới nhất và trạng thái Git trước khi tiếp tục.

Kế hoạch trong `docs/superpowers/plans/` đã được lấy từ `origin/main` và gộp với xác nhận hoàn thành điểm dừng đợt 1–2 và tiến độ ở worktree này. Bản mới chuyển kiểm thử và duyệt sang `docs/superpowers/plans/2026-11-16-kiem-thu-tong-the.md`. Tiếp tục làm **plan 3**, không tự bắt đầu các đợt sau.

## Đã thực hiện

- Task 4b: commit `f352374`; bổ sung tách điều khoản, kỳ thanh toán, trạng thái hoàn tiền và kiểm thử lõi.
- Task 13: commit `a950290`; phí phát sinh, sổ cọc, UI và migration `0003`. Trên Supabase dev `siris-pms`, migration `0003` đã áp dụng và seed thêm dần đã chạy **không dùng `--reset`**.
- Kiểm thử đầy đủ gần nhất trước Task 14: 276 test đạt; lint 0 lỗi, 8 cảnh báo có sẵn. Sau đó Task 14 bắt đầu và chưa đạt kiểm thử.
- Phí đã gắn bất kỳ hoá đơn nào hiện không được gỡ. Task 14 cần hoàn thiện để chỉ chặn hoá đơn đã duyệt, theo plan.

## Đang dở: Task 14

Các thay đổi đang làm dở gồm `drizzle/0004_dusty_thunderbolt_ross.sql`, snapshot/journal, schema invoices và thay đổi schema hợp đồng/phí, `src/server/invoices/service.ts`, `tests/integration/invoices.test.ts`. Migration `0004` **chưa áp dụng** lên Supabase dev. Service chưa đầy đủ và chưa sẵn sàng dùng thực tế.

Lần chạy gần nhất `npx vitest run tests/integration/invoices.test.ts`: 1 đạt, 1 lỗi. Gọi tạo nháp tháng 12 lần thứ hai vẫn tạo thêm hoá đơn. Kiểm tra cách `previewBatch` dùng `nextBillingPeriod` khi hợp đồng bắt đầu từ tháng 1 nhưng tháng đầu được yêu cầu là tháng 12; sửa theo spec và bảo đảm chống trùng dưới đồng thời. Sau khi thêm khoá ngoại hoá đơn trong migration `0004`, test Task 13 đang gắn `invoiceId` ngẫu nhiên cũng cần đổi sang hoá đơn thật.

Các phần Task 14 còn thiếu: hoàn thiện service và các ca lỗi, xóa/sửa dòng, thu và gỡ thanh toán, xuất phiếu thu, công nợ, phân quyền và audit, trạng thái hoá đơn, wizard hợp đồng, UI danh sách/tạo/sửa/duyệt, seed và migration dev. Hàm tính hiện truyền `addenda: []`; Task 15 phải nối phụ lục và đồng hồ của các phòng đã ở. Xem chính xác giao diện và ràng buộc tại `docs/superpowers/plans/2026-11-16-dot-3-tai-chinh.md` và spec được liên kết.

## Tiếp theo

1. Xem `git status`, đọc plan 3 và đối chiếu code Task 14 đang dở; tiếp tục từ lỗi kiểm thử nêu trên, không viết lại các commit đã hoàn tất.
2. Hoàn thiện Task 14, sau đó Task 15. Khi sửa schema, giữ RLS bật, audit trong cùng transaction và kiểm tra quyền theo cơ sở. Kiểm tra dữ liệu thật và giao dịch đồng thời trước khi coi nghiệp vụ tiền hoàn tất.
3. Task 15 phải xử lý xung đột giữa chỉ số bàn giao giữa tháng và unique `(meter_id, period)` hiện tại; không tính tiền từ chỉ số thiếu. Khi Task 14 đã có bảng hoá đơn, hoàn thiện quy tắc xóa phí nêu trên.
4. Dùng migration và seed thêm dần cho Supabase **dev**, không dùng `--reset`. File cấu hình `.env.local` của checkout chính có thể dùng qua đường dẫn tuyệt đối; không ghi giá trị bí mật vào output hoặc tài liệu.
5. Ghi tiến độ và các quyết định vào `.superpowers/sdd/2026-11-16-dot-3-tai-chinh/progress.md` (file bị Git bỏ qua; dòng đầu về Task 4b là trạng thái cũ, các dòng `complete` phía sau mới là trạng thái hiện tại). Sau khi hoàn thành plan 3, làm review theo skill `superpowers:executing-plans`; kiểm thử và duyệt tổng thể theo plan mới.

Các quyết định đã ghi trong ledger: yêu cầu chỉ số tại ngày chuyển phòng; tạm chặn xóa mọi phí đã gắn hoá đơn cho tới Task 14; ưu tiên spec rằng người dùng chọn thời điểm tạo hoá đơn đầu tiên; kiểm thử và duyệt tổng thể theo plan mới. Các quyết định này cần được kiểm tra khi hoàn thiện các task phụ thuộc.
