import { ValidationError } from '@/domain/errors'
import { convertDocxToPdf, convertPdfToPng } from './gotenberg'

export type ExportFormat = 'docx' | 'pdf' | 'png'
export const FORMAT_EXT: Record<ExportFormat, { ext: string; mime: string }> = {
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  png: { ext: 'png', mime: 'image/png' },
}
/** Ảnh PNG chỉ dành cho hoá đơn (và phiếu thu); các giấy tờ khác chỉ Word / PDF. */
export function assertFormatAllowed(docType: string, format: ExportFormat) {
  if (format === 'png' && !(docType.startsWith('invoice') || docType === 'receipt')) throw new ValidationError('Chỉ hoá đơn mới xuất được ảnh')
}
export async function convertDocx(docx: Blob, format: ExportFormat): Promise<Blob> {
  if (format === 'docx') return docx
  const pdf = await convertDocxToPdf(docx)
  return format === 'pdf' ? pdf : convertPdfToPng(pdf)
}
export { convertDocxToPdf, convertPdfToPng }
