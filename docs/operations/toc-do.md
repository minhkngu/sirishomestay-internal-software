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

Bản preview **sau tối ưu**, commit `51fed67`, dữ liệu demo; mỗi trang mở 3 lần, bảng ghi trung vị theo mili giây. Thời gian phản ánh mạng và dữ liệu tại thời điểm đo; không so sánh trực tiếp với local.

| Trang | TTFB sau (ms) | Tải xong sau (ms) |
| --- | ---: | ---: |
| Nhắc việc | 56 | 1077 |
| Cơ sở & phòng | 55 | 1776 |
| Khách thuê | 56 | 1017 |
| Hợp đồng | 56 | 1501 |
| Điện nước | 56 | 1490 |
| Hoá đơn | 55 | 1321 |
| Tài sản | 56 | 1489 |
| Sự cố | 55 | 543 |
| Người dùng | 56 | 750 |
| Mẫu giấy tờ | 55 | 839 |
| Nhập dữ liệu | 109 | 1165 |
| Cài đặt | 56 | 1139 |
| Nhật ký | 55 | 799 |

Chưa có số đo preview **trước tối ưu** tương ứng với cùng phiên bản và dữ liệu; không thể suy ra mức cải thiện trên preview từ các số đo này.

Giới hạn pool mặc định vẫn là 3 kết nối mỗi tiến trình, phù hợp cấu hình hiện có; chưa có cơ sở để tăng trên pooler dùng chung.

Kiểm tra preview ghi nhận một lần hết giới hạn kết nối session pooler (15 kết nối); kết quả đo trên có thể thay đổi khi tải hoặc số kết nối thay đổi.
