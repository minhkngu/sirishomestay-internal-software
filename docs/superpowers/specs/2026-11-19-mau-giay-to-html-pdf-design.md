# Mẫu giấy tờ soạn trong app, xuất PDF và Word không cần Gotenberg

## Ý định
Nhân viên soạn và sửa mẫu hợp đồng, phụ lục, biên bản bàn giao ngay trong app bằng hộp soạn trực quan, chèn chỗ điền bằng nút bấm, xem trước PDF tại chỗ. Từ một mẫu duy nhất, app xuất được cả PDF lẫn Word (.docx) ngay trong app, không cần dịch vụ Gotenberg. Khi lưu hợp đồng, bản PDF của hợp đồng và biên bản được dựng tự động.

Lý do người dùng nêu: sửa trong app cho trực quan, nhân viên dễ dùng, điền thông tin nhanh hơn; kèm mục tiêu bỏ Gotenberg (hiện môi trường chưa cấu hình `GOTENBERG_URL` nên PDF hợp đồng và biên bản không ra được).

## Hiện trạng
- Tám loại giấy tờ dùng mẫu Word: `deposit_contract`, `lease`, `addendum_extension`, `addendum_transfer`, `addendum_assignment`, `addendum_termination`, `handover_check_in`, `handover_check_out` (`src/domain/template-fields.ts`).
- Mẫu là tệp `.docx` tải lên ở Cài đặt → Mẫu giấy tờ (`src/features/templates/components/templates-manager.tsx`), bảng `doc_templates` chỉ giữ tên, loại, `fileId`, `isDefault`. Chỗ điền dạng `{ten_khach}`, vòng lặp `{#nguoi_o}…{/nguoi_o}`; danh sách chỗ điền và dữ liệu mẫu nằm ở `TEMPLATE_FIELDS`, `sampleDataFor`, `buildTemplateData`.
- `exportDocument` (`src/server/templates/service.ts`) điền mẫu bằng docxtemplater (`src/lib/docx.ts`), ra Word; muốn PDF thì gửi sang Gotenberg (`src/server/convert/`).
- Hoá đơn và phiếu thu đã dựng PDF trong app bằng `@react-pdf/renderer` (`src/server/pdf/`), có phông tiếng Việt (`src/server/pdf/fonts.ts`). Không đổi.
- Các loader dữ liệu (`registerDocLoader` ở contracts, addenda, handovers) và `syncContractDocuments` (tự tạo PDF khi lưu hợp đồng) giữ nguyên; chỉ đổi cách dựng tệp.

## Mục tiêu
- Soạn mẫu trong app: thanh công cụ (đậm, nghiêng, tiêu đề, danh sách, bảng, căn lề), bảng chỗ điền để bấm chèn, hàng bảng lặp cho danh sách (người ở, phí, tài sản…), nút "Xem trước" ra PDF với dữ liệu mẫu.
- Xuất PDF và Word hợp đồng, phụ lục, biên bản từ cùng một mẫu, không cần dịch vụ ngoài; chạy được trên Vercel.
- Hai kiểu trình bày cho mỗi loại giấy tờ, chọn được: **Trang trọng** (thể thức văn bản Việt Nam: quốc hiệu, tiêu đề căn giữa, đen trắng, đường kẻ mảnh) và **Hiện đại** (căn trái, khung tóm tắt phòng/giá thuê/tiền cọc/thời hạn ở đầu trang, bảng không kẻ dọc, xanh Siris `#0F6B4F` chỉ ở một đường kẻ và các số tóm tắt). Cả hai chỉ dùng phông Be Vietnam Pro. Mô phỏng đã duyệt: https://claude.ai/artifact/6Xdp6srj4P1RSkhAnhTyZx.
- Mười sáu mẫu mặc định dựng sẵn (tám loại × hai kiểu), đủ chỗ điền để dùng được ngay; có nút "Khôi phục mẫu mặc định". Mặc định của mỗi loại là kiểu Trang trọng (lựa chọn của tôi, đổi được bằng nút đặt mặc định).
- Nút "Xem trước PDF" ở trang soạn mẫu (dữ liệu mẫu) và cạnh ô "Mẫu hợp đồng" trong popup sửa hợp đồng (dữ liệu thật của hợp đồng đang sửa, không lưu tệp).
- Kéo thả khi soạn: kéo chỗ điền từ bảng chỗ điền thả vào đúng vị trí trong mẫu; kéo chip chỗ điền đã có để dời chỗ; kéo cả nhóm vòng lặp thả vào mẫu thì tạo bảng có hàng lặp.
- Giữ nguyên: danh sách chỗ điền, cách chọn mẫu ở popup "Sửa hợp đồng", "Văn bản đã lưu", tự tạo PDF khi lưu, quyền (chỉ nhóm `settings` soạn mẫu).

## Không phải mục tiêu
- Không đổi hoá đơn, phiếu thu (đã là PDF trong app).
- Không còn tải mẫu `.docx` lên làm mẫu. Mẫu `.docx` nhân viên đã tải lên không tự chuyển được; họ soạn lại trong app. Xuất Word vẫn có, nhưng là Word dựng từ mẫu trong app (người nhận sửa tiếp được), không phải điền vào tệp Word riêng.
- Không làm trình soạn thảo ngang Word (cột chia, hình nổi, chữ chồng hình, đầu/chân trang tuỳ biến).

## Điều làm thất bại dù chạy được
- PDF vỡ chữ tiếng Việt (mất dấu), tràn lề, bảng bị cắt giữa chừng, lặp trang sai.
- Hộp soạn cho tạo định dạng mà bộ dựng PDF không hiểu (nhìn khác bản xem trước).
- Mất mẫu cũ mà không báo, hoặc để nhân viên chọn mẫu Word cũ rồi xuất lỗi.
- Hợp đồng đã ký bị đổi bản PDF cũ không có chủ ý.

## Ràng buộc
- Next.js 16, Postgres (Drizzle; sửa `src/db/schema/`, `npm run db:generate`, không sửa tay `drizzle/`), kiến trúc N-Layer của `CLAUDE.md` (route mỏng, giao diện ở `src/features/templates/components`, logic ở `src/server/templates`, quy tắc thuần ở `src/domain`).
- Thêm thư viện cần chấp thuận: bộ soạn (TipTap) và bộ đọc HTML (ví dụ `node-html-parser`). Dùng lại `@react-pdf/renderer`, `docx` (chuyển từ dev sang dependency) và phông đang có.
- Chuỗi giao diện, comment tiếng Việt; thao tác "thêm mới" luôn là popup.

## Các hướng đã cân nhắc
- **A. Soạn trực quan, một mô hình tài liệu, hai bộ dựng (chọn).** Mẫu lưu HTML trong database; dựng PDF bằng `@react-pdf/renderer` và dựng Word bằng thư viện `docx`. Đổi lại: chỉ hỗ trợ tập định dạng hữu hạn, và hai bản có thể lệch nhau chút về dàn trang.
- B. Markdown có xem trước: dễ làm nhất nhưng nhân viên khó dùng, bảng khó soạn. Loại.
- C. HTML dựng bằng Chromium trong app: giữ định dạng đầy đủ nhưng nặng, khởi động chậm, hay lỗi trên Vercel, thực chất cũng là dịch vụ khó chạy như Gotenberg. Loại.

## Thiết kế
**Lưu trữ.** Thêm cột `body` (text, HTML) và `style` (text, `'formal'` hoặc `'modern'`, mặc định `'formal'`) vào `doc_templates`; `style` quyết định chủ đề trình bày (cỡ chữ 10,5 pt, dòng cách 1,55, đường kẻ, màu, kiểu bảng, khối chữ ký) mà bộ dựng PDF và Word áp lên cây tài liệu; phần cấu trúc khác nhau giữa hai kiểu (quốc hiệu hay khung tóm tắt) nằm trong HTML của mẫu. Mẫu có `body` là mẫu mới; mẫu chỉ có `fileId` là "Mẫu Word cũ": hiện trong Cài đặt với nhãn cần soạn lại, không có trong danh sách chọn mẫu và không xuất được. Không xoá tệp cũ. Chỗ điền lưu là phần tử `<span data-field="ten_khach">`, vòng lặp lưu là hàng bảng `<tr data-loop="nguoi_o">` (mọi ô trong hàng dùng chỗ điền của vòng lặp), ngắt trang lưu là `<hr data-page-break>`.

**Soạn.** Hộp soạn TipTap chỉ bật đúng tập nút được dựng PDF hỗ trợ (đoạn, tiêu đề 1–3, đậm, nghiêng, gạch chân, danh sách, bảng, căn lề, ngắt trang) cộng hai thành phần riêng: chỗ điền (chip có tên tiếng Việt, ví dụ "Tên khách") và hàng lặp. Bảng chỗ điền ở cạnh hộp soạn, nhóm theo `TEMPLATE_FIELDS` của loại giấy tờ; bấm là chèn. "Xem trước" gọi server dựng PDF bằng `sampleDataFor` rồi hiện trong khung; "Xuất thử" tải PDF. Soạn mẫu mới và sửa mẫu hiện có đều ở popup rộng.

**Mô hình tài liệu chung.** Hàm thuần ở `src/domain` điền dữ liệu vào HTML (thay chỗ điền với giá trị đã escape, nhân hàng lặp theo mảng, gom chỗ điền thiếu dữ liệu vào `warnings` như cũ) rồi đọc thành một cây tài liệu nhỏ: đoạn, tiêu đề, danh sách, bảng, chữ đậm/nghiêng/gạch chân, căn lề, ngắt trang. Cả hai bộ dựng đọc cùng cây này, nên hộp soạn chỉ cần cho đúng tập đó.

**Bộ dựng PDF** (`src/server/pdf/`): cây tài liệu → phần tử `@react-pdf/renderer`, A4, lề 2 cm, chữ 12 pt, phông tiếng Việt hiện có.

**Bộ dựng Word** (`src/server/word/`): cây tài liệu → tệp `.docx` bằng thư viện `docx` (đã có ở dạng devDependency, chuyển sang dependency), cùng cỡ giấy, lề, phông; chạy trong app, không cần chuyển đổi.

**Xuất.** `exportDocument` với loại giấy tờ dùng mẫu: lấy `body` của mẫu chọn (hoặc mẫu mặc định), điền, rồi dựng PDF hoặc Word theo `format`, lưu như bây giờ (`ownerType 'export'`). `exportContract`, các action xuất phụ lục và biên bản đi cùng đường này; nút "Xuất Word" và "Xuất PDF" ở trang chi tiết giữ nguyên. `syncContractDocuments` (tự tạo khi lưu) chỉ tạo bản PDF; bản Word chỉ tạo khi người dùng bấm xuất.

**Mẫu mặc định.** Mười sáu mẫu HTML viết sẵn (tám loại × hai kiểu) trong `src/server/templates/defaults/`, tạo khi loại chưa có mẫu dùng được; nút "Khôi phục mẫu mặc định" ở Cài đặt tạo lại bản mặc định (không ghi đè mẫu đang sửa).

**Dọn.** Gỡ `src/server/convert/gotenberg.ts`, `convertDocx`, `renderDocx`, `docxtemplater`, `pizzip`, `scripts/build-sample-templates.ts` (test dùng mẫu HTML), `GOTENBERG_URL` trong `.env.example`, `docs/operations/gotenberg.md`; sửa các test và `docs/review/checklist.md` nhắc Gotenberg. PNG của hoá đơn giữ như cũ (không dùng Gotenberg).

## Để người xây quyết (đã đánh dấu là lựa chọn của tôi)
- Bộ dựng PDF và Word tự viết trên cây tài liệu (đã chốt, không dùng `react-pdf-html`): làm thử trước (spike) với một mẫu có bảng lặp và chữ có dấu để chốt cách ánh xạ bảng và danh sách trong cả hai bộ dựng.
- Cách ngắt trang và chống cắt hàng bảng giữa hai trang.
- Chi tiết nội dung tám mẫu mặc định (bố cục, câu chữ pháp lý do nhân viên duyệt sau).
- Có cần lưu phiên bản mẫu khi sửa không (không, bản PDF đã xuất tự giữ nội dung).

## Kiểm tra
- Unit: điền chỗ điền, vòng lặp, escape, chỗ điền thiếu dữ liệu vào `warnings`.
- Integration (PGlite): xuất mỗi loại ra PDF thật (đầu tệp `%PDF`) và Word thật (đọc lại bằng `pizzip`, có chữ đã điền), `syncContractDocuments` thay bản tự tạo, mẫu Word cũ bị từ chối rõ ràng. Không cần dịch vụ ngoài.
- Thử mắt: dựng PDF và Word của tám mẫu mặc định với dữ liệu mẫu, mở xem từng trang; thử trên một hợp đồng thật ở môi trường thử.
- E2E: soạn mẫu, chèn chỗ điền, xem trước, xuất PDF từ hợp đồng.
