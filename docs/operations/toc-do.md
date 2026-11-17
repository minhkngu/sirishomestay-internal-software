# Số đo tốc độ trang

Bản production chạy trên máy, commit `60f7625`, dữ liệu demo; mỗi trang mở 3 lần, bảng ghi trung vị theo mili giây. TTFB là responseStart − requestStart; tải xong là loadEventEnd. Kết quả phụ thuộc mạng, máy và dữ liệu.

| Trang | TTFB trước (ms) | Tải xong trước (ms) |
| --- | ---: | ---: |
| Nhắc việc | 427 | 6263 |
| Cơ sở & phòng | 409 | 1299 |
| Khách thuê | 468 | 678 |
| Hợp đồng | 404 | 1216 |
| Điện nước | 405 | 1229 |
| Hoá đơn | 403 | 631 |
| Tài sản | 452 | 2256 |
| Sự cố | 405 | 1043 |
| Người dùng | 407 | 657 |
| Mẫu giấy tờ | 409 | 565 |
| Nhập dữ liệu | 427 | 457 |
| Cài đặt | 488 | 1733 |
| Nhật ký | 401 | 1946 |

Bản preview trước đây được tạo trước commit này; lần kiểm tra không xác nhận được môi trường demo, nên chưa dùng làm số đo so sánh.
