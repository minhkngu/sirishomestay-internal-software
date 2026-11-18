# Thiết kế: xử lý tài sản khi lập hợp đồng (Di chuyển / Thanh lý)

Quy mô: thay đổi nhỏ, thiết kế ngắn.

## Mục đích

Menu "Xử lý tài sản" ở phần Tài sản bàn giao đang có 3 lựa chọn (Chuyển vào kho, Thanh lý, Bỏ khỏi phòng), khó phân biệt. Nhân viên thật sự chỉ cần hai việc:

- **Di chuyển**: đưa tài sản về kho hoặc sang một phòng khác, ở bất kỳ cơ sở nào trong hệ thống.
- **Thanh lý**: loại tài sản khỏi vòng luân chuyển; không điều chuyển được nữa nhưng lịch sử vẫn xem được.

## Mục tiêu / Không phải mục tiêu

- Mục tiêu: form chỉ còn 2 lựa chọn; Di chuyển chọn được đích là kho hoặc phòng của bất kỳ cơ sở nào.
- Không làm: mở chuyển liên cơ sở ở màn Tài sản (vẫn chỉ chuyển trong một cơ sở); đổi hành vi Thanh lý; di chuyển dữ liệu cũ đang ở "Chưa xếp".
- Điều không được xảy ra: mất lịch sử di chuyển, hoặc chuyển tài sản khi người thao tác thiếu quyền.

## Các cách đã cân nhắc

1. Nới quy tắc ở tầng service, chỉ hiện trong form hợp đồng. **Đã chọn.**
2. Nới quy tắc và mở luôn ở màn Tài sản. Phạm vi rộng hơn yêu cầu.
3. Đường xử lý riêng cho form hợp đồng. Hai nơi dễ lệch quy tắc.

## Thiết kế (cách 1)

- `moveAssetsInTransaction` ([src/server/assets/service.ts](../../../src/server/assets/service.ts)) cho phép đích ở cơ sở khác: cập nhật `facilityId` của tài sản theo cơ sở đích, vẫn ghi `assetMoves` và nhật ký. Cần `assertCan(ctx, 'assets', ...)` ở cả cơ sở đi và cơ sở đến; thiếu quyền thì từ chối kèm thông báo rõ. Khóa các cơ sở liên quan theo thứ tự cố định để tránh deadlock.
- Hành động trong bàn giao ([src/server/contracts/service.ts](../../../src/server/contracts/service.ts), [lease-assets.tsx](../../../src/features/contracts/components/lease-assets.tsx)): `remove` gồm `move` (kèm đích `{ kind: 'warehouse' | 'room', id }`) và `dispose`. Bỏ `warehouse` và `unassigned` khỏi form; server không còn nhận hai giá trị đó.
- Giao diện: menu "Xử lý tài sản" có 2 mục. Chọn Di chuyển thì hiện ô chọn đích (kho hoặc phòng, nhóm theo cơ sở). Dòng tài sản hiển thị "Di chuyển → <đích>" hoặc "Thanh lý"; vẫn có "Đổi cách xử lý" và "Giữ lại".
- Danh sách đích chỉ gồm cơ sở/phòng mà người dùng có quyền `assets`.

## Để người xây quyết

- Rà các chỗ giả định `facilityId` của tài sản không đổi (danh sách, lọc theo quyền, nhật ký).
- Ngăn chuyển tài sản vào chính phòng đang lập hợp đồng; xử lý đích trùng nhau và thông báo lỗi.
- Test: chuyển liên cơ sở thành công, thiếu quyền ở cơ sở đích bị từ chối, tài sản đã thanh lý không chuyển được, e2e form hợp đồng.
