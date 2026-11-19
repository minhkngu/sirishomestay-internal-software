import { ValidationError } from '@/domain/errors'

const PNG_ERROR = 'Không chuyển được sang ảnh, thử lại sau'

/** Độ phân giải ảnh xuất: 150 dpi (PDF tính theo 72 điểm/inch). */
const PNG_SCALE = 150 / 72

/**
 * PDF → PNG trang đầu, vẽ ngay trên server bằng pdf.js + @napi-rs/canvas (không cần dịch vụ riêng).
 * Worker của pdf.js chạy trong cùng tiến trình: nạp sẵn vào `globalThis.pdfjsWorker` để bundler theo dõi được file.
 */
export async function convertPdfToPng(pdf: Blob): Promise<Blob> {
  try {
    const { createCanvas, DOMMatrix, Path2D } = await import('@napi-rs/canvas')
    if (!globalThis.DOMMatrix) Object.defineProperty(globalThis, 'DOMMatrix', { value: DOMMatrix, configurable: true })
    if (!globalThis.Path2D) Object.defineProperty(globalThis, 'Path2D', { value: Path2D, configurable: true })
    type Canvas = ReturnType<typeof createCanvas>
    class CanvasFactory {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height)
        return { canvas, context: canvas.getContext('2d') }
      }
      reset(pair: { canvas: Canvas }, width: number, height: number) {
        pair.canvas.width = width; pair.canvas.height = height
      }
      destroy(pair: { canvas: Canvas | null; context: unknown }) {
        if (pair.canvas) { pair.canvas.width = 0; pair.canvas.height = 0 }
        pair.canvas = null; pair.context = null
      }
      getNoAlphaContext(canvas: Canvas) { return canvas.getContext('2d', { alpha: false }) }
    }
    const g = globalThis as { pdfjsWorker?: unknown }
    g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), CanvasFactory })
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
