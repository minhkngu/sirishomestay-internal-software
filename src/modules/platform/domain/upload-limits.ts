const MB = 1024 * 1024

/** Ảnh (giấy tờ, ảnh hợp đồng, bàn giao, sự cố): tối đa 2 MB sau khi nén. */
export const MAX_IMAGE_BYTES = 2 * MB

/** Tệp tài liệu (hợp đồng, phụ lục đã ký, mẫu Word): tối đa 10 MB. */
export const MAX_DOCUMENT_BYTES = 10 * MB

/** Tệp xuất (Word, PDF, ảnh QR): tối đa 20 MB. */
export const MAX_EXPORT_BYTES = 20 * MB
