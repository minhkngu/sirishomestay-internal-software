# Số đo tốc độ trang

Bản production chạy trên máy, commit `60f7625`, dữ liệu demo; mỗi trang mở 3 lần, bảng ghi trung vị theo mili giây. TTFB là responseStart − requestStart; tải xong là loadEventEnd. Kết quả phụ thuộc mạng, máy và dữ liệu.

| Trang | TTFB trước (ms) | Tải xong trước (ms) | TTFB sau (ms) | Tải xong sau (ms) |
| --- | ---: | ---: | ---: | ---: |
| Nhắc việc | 427 | 6263 | 422 | 6019 |
| Cơ sở & phòng | 409 | 1299 | 412 | 1556 |
| Khách thuê | 468 | 678 | 456 | 791 |
| Hợp đồng | 404 | 1216 | 410 | 1627 |
| Điện nước | 405 | 1229 | 394 | 1171 |
| Hoá đơn | 403 | 631 | 404 | 749 |
| Tài sản | 452 | 2256 | 450 | 2084 |
| Sự cố | 405 | 1043 | 391 | 1233 |
| Người dùng | 407 | 657 | 466 | 651 |
| Mẫu giấy tờ | 409 | 565 | 390 | 645 |
| Nhập dữ liệu | 427 | 457 | 393 | 429 |
| Cài đặt | 488 | 1733 | 423 | 1626 |
| Nhật ký | 401 | 1946 | 399 | 1986 |

Bản preview trước đây được tạo trước commit này; lần kiểm tra không xác nhận được môi trường demo, nên chưa dùng làm số đo so sánh.

Giới hạn pool mặc định vẫn là 3 kết nối mỗi tiến trình, phù hợp cấu hình hiện có; chưa có cơ sở để tăng trên pooler dùng chung.
