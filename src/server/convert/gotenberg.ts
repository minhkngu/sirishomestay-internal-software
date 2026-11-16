import { ValidationError } from '@/domain/errors'

const PDF_ERROR = 'Không chuyển được sang PDF, thử lại sau'
const PNG_ERROR = 'Không chuyển được sang ảnh, thử lại sau'

function baseUrl(): string {
  const url = process.env.GOTENBERG_URL
  if (!url) throw new ValidationError('Chưa cấu hình dịch vụ chuyển PDF')
  return url.replace(/\/+$/, '')
}

/** Word → PDF qua Gotenberg (LibreOffice). Lỗi mạng hoặc HTTP khác 2xx → thông báo tiếng Việt, không lộ chi tiết nội bộ. */
export async function convertDocxToPdf(docx: Blob): Promise<Blob> {
  const form = new FormData()
  form.append('files', docx, 'document.docx')
  let res: Response
  try { res = await fetch(`${baseUrl()}/forms/libreoffice/convert`, { method: 'POST', body: form }) } catch (e) {
    if (e instanceof ValidationError) throw e
    throw new ValidationError(PDF_ERROR)
  }
  if (!res.ok) throw new ValidationError(PDF_ERROR)
  return new Blob([await res.arrayBuffer()], { type: 'application/pdf' })
}

/** Độ phân giải ảnh xuất: 150 dpi (PDF tính theo 72 điểm/inch). */
const PNG_SCALE = 150 / 72

/**
 * PDF → PNG trang đầu, vẽ ngay trên server bằng pdf.js + @napi-rs/canvas (không cần dịch vụ riêng).
 * Worker của pdf.js chạy trong cùng tiến trình: nạp sẵn vào `globalThis.pdfjsWorker` để bundler theo dõi được file.
 */
export async function convertPdfToPng(pdf: Blob): Promise<Blob> {
  try {
    const g = globalThis as { pdfjsWorker?: unknown }
    g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) })
    const doc = await task.promise
    try {
      const page = await doc.getPage(1)
      const viewport = page.getViewport({ scale: PNG_SCALE })
      const { canvas, context } = (doc.canvasFactory as { create(w: number, h: number): { canvas: { toBuffer(mime: 'image/png'): Buffer }; context: unknown } })
        .create(Math.ceil(viewport.width), Math.ceil(viewport.height))
      await page.render({ canvas: null, canvasContext: context as CanvasRenderingContext2D, viewport, background: '#ffffff' }).promise
      return new Blob([new Uint8Array(canvas.toBuffer('image/png'))], { type: 'image/png' })
    } finally { await task.destroy() }
  } catch (e) {
    console.error('convertPdfToPng', e)
    throw new ValidationError(PNG_ERROR)
  }
}
