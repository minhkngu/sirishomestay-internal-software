# Phí dịch vụ và người ở khi lập hợp đồng

## Mục tiêu

Tạo hợp đồng với bên ký được tính mặc định là một người ở, kể cả khi bên ký là công ty. Phí dịch vụ mặc định theo cơ sở tự xuất hiện; người lập có thể xóa, chọn phí khác hoặc thêm phí chỉ dành cho hợp đồng này. Không tính tiền nước nếu hợp đồng không chọn dịch vụ nước.

## Phạm vi và các phương án

- Danh mục loại phí chung cho tất cả cơ sở, với khu vực Cài đặt phí dịch vụ. Phí mặc định được đánh dấu riêng theo cơ sở; không cấu hình riêng cho từng phòng. Chỉ thực hiện luồng tạo hợp đồng mới; phụ lục, chuyển phòng và kết thúc hợp đồng nằm ngoài phạm vi triển khai lần này.
- Đã cân nhắc mặc định chung toàn hệ thống và mặc định theo từng cơ sở. Chọn theo cơ sở vì các cơ sở cần bộ phí khác nhau. Danh mục chung vẫn cho phép chọn các phí không mặc định khi lập hợp đồng.
- Đã cân nhắc tạo loại phí ẩn trong danh mục cho khoản mới và lưu trực tiếp trong hợp đồng. Chọn lưu trực tiếp: khoản mới chỉ thuộc hợp đồng đang lập, không tự thêm vào danh mục chung.
- Người lập xóa phí mặc định trên biểu mẫu chỉ thay đổi hợp đồng đang lập, không sửa Cài đặt. Cấu hình giá riêng theo cơ sở đang có tiếp tục hoạt động.

## Người ở

- Khi chọn bên ký, mặc định thêm chính bên ký làm một người ở. Người lập có thể thêm người ở khác; mỗi người được tính một lần khi tính phí theo người. Khi đổi bên ký, cập nhật người ở mặc định theo bên ký mới và giữ những người được thêm chủ động, không tính trùng.
- Công ty là một bên thuê hợp lệ và được tính là một người ở; mã số thuế thay cho CCCD. Cho phép công ty qua kiểm tra tạo hợp đồng, đồng thời giữ nguyên các kiểm soát quyền và phạm vi cơ sở; chưa thay đổi phụ lục người ở.

## Phí và tiền nước

- Màn hình tạo hợp đồng ban đầu chỉ hiển thị phí mặc định của cơ sở phòng đã chọn. Người lập có thể xóa từng phí, chọn thêm phí từ danh mục chung hoặc nhập một phí mới chỉ cho hợp đồng này. Lưu đủ tên, đơn vị, cách tính, số lượng và đơn giá để hiển thị, lập hóa đơn và xuất tài liệu sau này; không phụ thuộc vào loại phí chung để đọc phí riêng.
- Mọi khoản phí dùng đơn giá ghi trong hợp đồng. Số lượng theo phương thức của dịch vụ: theo số người ở của hợp đồng, theo phòng (luôn là 1), hoặc theo lượng sử dụng thực tế. Với dịch vụ định lượng được cấu hình nhập tay, nhân viên nhập số lượng thực tế cho từng kỳ hóa đơn. Những giá trị cần nhập và nguồn số lượng phải rõ trong giao diện.
- Mọi dịch vụ được cấu hình rõ cách tính và nguồn số lượng, không suy đoán từ tên gọi: theo người, theo phòng, theo đồng hồ hoặc theo số lượng thực tế nhập mỗi kỳ. Hợp đồng không chọn dịch vụ nào thì không phát sinh khoản thu cho dịch vụ đó; nếu chọn, hóa đơn tính từng dịch vụ theo cấu hình và đơn giá trong hợp đồng. Ví dụ, nước theo m³, theo người và theo phòng có thể là các dịch vụ riêng; không tự tạo thêm khoản nước ngoài các dịch vụ được chọn.
- Dịch vụ tính theo đồng hồ lấy lượng dùng từ chỉ số đồng hồ gắn với phí, không dựa vào tên gọi; dịch vụ định lượng nhập tay dùng số lượng nhân viên nhập mỗi kỳ. Khi tạo thành công hợp đồng có phí theo đồng hồ, hệ thống tạo đồng hồ cho phòng nếu phòng chưa có đồng hồ của phí đó và dùng lại đồng hồ đó cho các hợp đồng sau của cùng phòng. Nhân viên nhập chỉ số ban đầu của đồng hồ mới ngay trên biểu mẫu tạo hợp đồng; chỉ lưu và tạo đồng hồ khi hợp đồng được tạo thành công. Không tạo đồng hồ chỉ vì người dùng đang chỉnh biểu mẫu. Đơn giá lấy từ hợp đồng. Bỏ ô chọn độc lập “Tính nước theo đồng hồ” ở biểu mẫu tạo hợp đồng. Điện được xử lý theo cấu hình dịch vụ đã chọn như các phí khác; hợp đồng cũ vẫn giữ quy tắc tương thích nêu dưới đây.

## Tương thích và an toàn dữ liệu

- Hợp đồng cũ, sổ cọc và hóa đơn đã lập giữ nguyên ý nghĩa; không suy diễn lại dịch vụ nước của chúng dựa trên cài đặt mới. Cần phương án dữ liệu tương thích cho cờ nước theo đồng hồ cũ và phí hiện có.
- Phí được thêm từ danh mục chung và phí riêng cần được lưu sao cho hợp đồng tiếp tục hiển thị và tính đúng nếu danh mục được sửa hoặc lưu trữ sau này. Cập nhật những nơi đọc phí, chi tiết hợp đồng, hóa đơn và xuất tài liệu cần cho hợp đồng mới; không mở rộng nghiệp vụ phụ lục hay chuyển phòng trong lần này.
- Giữ các thay đổi giao diện đã làm: tiền đã cọc cạnh tiền cọc và khu vực thêm tài sản mở bằng dấu cộng. Không ghi đè thay đổi người dùng đang có trong workspace.

## Kiểm chứng

- Tạo hợp đồng cá nhân và công ty; người ký mặc định tính một người, thêm người không trùng và phí theo người đúng số lượng. Kiểm tra đổi bên ký.
- Kiểm tra phí mặc định khác nhau theo cơ sở, chọn/xóa phí, thêm phí riêng và bảo đảm danh mục chung không thay đổi; kiểm tra lưu, đọc, hóa đơn và xuất tài liệu.
- Kiểm tra các loại phí với tên gọi bất kỳ theo người, theo phòng và theo lượng sử dụng; không chọn dịch vụ, nước theo người, theo phòng, theo khối lượng; đơn giá hợp đồng, chỉ số, trường hợp thiếu chỉ số, nhiều dịch vụ được chọn và việc nhập chỉ số ban đầu, tạo hoặc dùng lại đồng hồ theo phòng, và rollback khi tạo hợp đồng thất bại. Hợp đồng và hóa đơn cũ không đổi nghĩa.
- Kiểm tra giao diện rộng/hẹp, giữ dữ liệu khi lỗi, trường hợp không có phí mặc định, phân quyền, và chạy các kiểm thử tự động cùng E2E trên môi trường demo.
