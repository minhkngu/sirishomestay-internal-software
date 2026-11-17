> Hoá đơn và phiếu thu dựng PDF trong ứng dụng; ảnh được tạo từ PDF. Gotenberg chỉ dùng để chuyển hợp đồng, phụ lục và biên bản từ Word sang PDF.

# Gotenberg — chuyển giấy tờ Word sang PDF

Hợp đồng, phụ lục và biên bản xuất từ mẫu `.docx`; khi cần PDF, ứng dụng chuyển file qua dịch vụ Gotenberg.

## PDF
- Image: `gotenberg/gotenberg:8` (chạy như dịch vụ nhỏ hoặc Vercel container function).
- Đặt biến môi trường `GOTENBERG_URL` (ví dụ `https://gotenberg.example.com`). App gọi `POST {GOTENBERG_URL}/forms/libreoffice/convert`.
- Cài thêm font **Times New Roman** và **Arial** vào image (ví dụ `ttf-mscorefonts-installer` hoặc font tương thích Liberation) để PDF không lệch trang so với bản Word.
- Không để Gotenberg mở ra Internet không xác thực: đặt sau mạng nội bộ hoặc proxy có token.

## Ảnh PNG (chỉ hoá đơn)
Gotenberg chỉ ra PDF. Ảnh PNG được vẽ ngay trong function từ trang 1 của PDF bằng `pdfjs-dist` + `@napi-rs/canvas` (150 dpi), không cần dịch vụ hay biến môi trường thêm. Luồng hoá đơn và phiếu thu không cần `GOTENBERG_URL`.

## Lỗi
Gotenberg lỗi hoặc không trả lời → người dùng thấy "Không chuyển được sang PDF, thử lại sau"; chi tiết nằm trong log của dịch vụ.
