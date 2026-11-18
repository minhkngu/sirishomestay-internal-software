# Thao tác nhanh và khôi phục hợp đồng

## Mục tiêu và phạm vi

Nhân viên thao tác hợp đồng ngay tại danh sách, xem toàn bộ chi tiết trong popup gần toàn màn hình và có thể quay về trạng thái trước lần thay đổi gần nhất. Đây là phần mở rộng của chức năng sửa/xóa hợp đồng hiện có; không thay đổi quy tắc phân quyền xóa đã duyệt.

## Phương án đã cân nhắc

- Lưu nhiều mốc và cho chọn mốc khôi phục: linh hoạt nhưng phức tạp hơn khi xử lý dữ liệu phát sinh.
- Lưu trạng thái trước thay đổi và chỉ khôi phục một bước: đơn giản hơn, người dùng đã chọn phương án này. Không cung cấp giao diện chọn mốc cũ tùy ý.

## Giao diện

- Mỗi hợp đồng là một hàng trong bảng; các thao tác sửa, xóa, thanh lý, chuyển nhượng, gia hạn, khôi phục là biểu tượng có nhãn khi rê chuột và nhãn hỗ trợ truy cập bằng bàn phím. Ẩn hoặc vô hiệu hóa thao tác khi không có quyền hay không áp dụng; màn hình nhỏ phải giữ khả năng truy cập mọi thông tin và thao tác.
- Nhấn mã hợp đồng mở popup gần toàn màn hình, không xổ chi tiết xuống dưới dòng và không chuyển trang. Popup tập hợp thông tin hợp đồng, người ở, phụ lục, bàn giao, hóa đơn, tiền cọc, tài liệu và lịch sử liên quan; bỏ nút thao tác trùng lặp trong chi tiết. Có nút đóng và sử dụng được bằng bàn phím.
- Mỗi thao tác nhanh mở popup riêng để nhập thông tin và xác nhận khi cần. Các cảnh báo phải nêu rõ hệ quả trước hành động.

## Nghiệp vụ

- Sửa hợp đồng, kể cả đã ký hoặc đã có hóa đơn hay tiền cọc; hợp đồng đã ký phải được cảnh báo trước khi sửa. Hóa đơn, tiền cọc và thanh toán hiện có được giữ nguyên để nhân viên tự kiểm tra, điều chỉnh.
- Chuyển nhượng là chuyển hợp đồng cho người khác, không phải chuyển phòng. Sau khi lưu phụ lục chuyển nhượng, người nhận đứng tên và kế thừa hợp đồng hiện hữu, người cũ được đưa khỏi danh sách người ở. Giữ nguyên PDF hợp đồng cũ đã ký; lưu phụ lục làm tài liệu riêng.
- Thanh lý và gia hạn sử dụng luồng nghiệp vụ hiện có, đưa vào popup. Ký hợp đồng không tự động tạo hóa đơn.
- Trước mỗi lần sửa, thanh lý, chuyển nhượng hoặc gia hạn thành công, lưu trạng thái trước đó để khôi phục. Mỗi lần khôi phục chỉ quay lại thay đổi gần nhất, không chọn mốc tùy ý; có thể khôi phục liên tiếp từng bước nếu còn lịch sử, mỗi lần cảnh báo và xác nhận riêng. Người có quyền sửa hợp đồng được khôi phục; quản trị viên mặc định có tất cả quyền.
- Trước khi khôi phục, liệt kê rõ hóa đơn, khoản cọc, thanh toán và phụ lục phát sinh sau thay đổi sẽ bị xóa vĩnh viễn, yêu cầu xác nhận. Khôi phục dữ liệu hợp đồng và xóa các bản ghi liên quan phải nhất quán; PDF đã ký của hợp đồng trước thay đổi được giữ nguyên. Việc xử lý tệp của các bản ghi bị xóa phải theo cơ chế dọn tệp hiện có.
- Phụ lục do chính thao tác được hoàn tác tạo ra cũng bị xóa. Khi hoàn tác thanh lý, xóa biên bản trả phòng và chỉ số điện nước do lần thanh lý đó tạo ra, và nêu rõ trong cảnh báo. Nếu phòng đã có hợp đồng mới, chặn khôi phục và giải thích lý do; không thay đổi hợp đồng mới.
- Xóa hợp đồng là thao tác vĩnh viễn, không thuộc phạm vi khôi phục. Chỉ người có quyền xóa hợp đồng riêng hoặc quản trị viên được xóa. Cảnh báo, xác nhận trước khi xóa hợp đồng, hóa đơn, khoản cọc, thanh toán, phụ lục, biên bản bàn giao và tệp liên quan; hợp đồng đã ký có thêm cảnh báo.

## Quyết định kỹ thuật dành cho người triển khai

Áp dụng cấu trúc và công nghệ sẵn có; xác định cách lưu bản chụp, ranh giới giao dịch và cách nhận diện bản ghi phát sinh sao cho chính xác khi có thao tác đồng thời. Cơ chế khôi phục phải tránh xóa dữ liệu không thuộc hợp đồng; không thay đổi PDF đã ký. Nếu trạng thái hoặc dữ liệu liên quan thay đổi giữa lúc xem cảnh báo và xác nhận, kiểm tra lại và yêu cầu xác nhận trên danh sách mới thay vì xóa dữ liệu ngoài dự kiến. Lịch sử và thông tin tạo lập cần đủ để xác định hành động và đối tượng bị ảnh hưởng.

## Kiểm thử và tiêu chí hoàn thành

Kiểm tra phân quyền ở máy chủ và giao diện, admin tự có quyền, hợp đồng đã ký, chuyển nhượng và PDF gốc không đổi, các thao tác trong popup, khôi phục đúng một bước và xóa đúng dữ liệu phát sinh, cảnh báo/xác nhận, xử lý đồng thời và lỗi giao dịch/dọn tệp. Kiểm thử trên môi trường cô lập với dữ liệu minh họa và xác nhận không tự tạo hóa đơn khi ký.
