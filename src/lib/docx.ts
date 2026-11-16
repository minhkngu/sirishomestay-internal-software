import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { ValidationError } from '@/domain/errors'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Điền mẫu Word: chỗ điền dạng `{ten_truong}`, vòng lặp `{#danh_sach}…{/danh_sach}`.
 * Chỗ điền không có dữ liệu → để trống và ghi tên vào `warnings`.
 */
export function renderDocx(templateBuf: ArrayBuffer, data: Record<string, unknown>): { blob: Blob; warnings: string[] } {
  const warnings: string[] = []
  let doc: Docxtemplater
  try {
    const zip = new PizZip(templateBuf)
    doc = new Docxtemplater(zip, {
      delimiters: { start: '{', end: '}' },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter(part: { value?: string }) {
        if (part.value && !warnings.includes(part.value)) warnings.push(part.value)
        return ''
      },
    })
  } catch {
    throw new ValidationError('Mẫu Word không hợp lệ (không đọc được file .docx hoặc sai cú pháp chỗ điền)')
  }
  try {
    doc.render(data)
  } catch {
    throw new ValidationError('Mẫu Word có chỗ điền sai cú pháp, hãy kiểm tra các dấu { } và vòng lặp')
  }
  const out = doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' })
  return { blob: new Blob([out as BlobPart], { type: DOCX_MIME }), warnings }
}
