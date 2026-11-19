import { PDF_DOC_TYPES } from '@/domain/template-fields'
import { ValidationError } from '@/domain/errors'
import { convertPdfToPng } from './png'

export type ExportFormat = 'docx' | 'pdf' | 'png'
export const FORMAT_EXT: Record<ExportFormat, { ext: string; mime: string }> = {
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  png: { ext: 'png', mime: 'image/png' },
}
/** Ảnh PNG chỉ dành cho hoá đơn (và phiếu thu); các giấy tờ khác chỉ Word / PDF. */
export function assertFormatAllowed(docType: string, format: ExportFormat) {
  if ((PDF_DOC_TYPES as readonly string[]).includes(docType) && format === 'docx') throw new ValidationError('Hoá đơn và phiếu thu chỉ xuất PDF hoặc ảnh')
  if (format === 'png' && !(PDF_DOC_TYPES as readonly string[]).includes(docType)) throw new ValidationError('Chỉ hoá đơn mới xuất được ảnh')
}
export { convertPdfToPng }
