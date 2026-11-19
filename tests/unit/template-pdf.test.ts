import { describe, expect, it } from 'vitest'
import { renderTemplatePdf } from '@/server/pdf/template-pdf'
import type { DocBlock } from '@/domain/doc-template'

async function pdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const g = globalThis as { pdfjsWorker?: unknown }
  g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice() })
  const doc = await task.promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(it => ('str' in it ? it.str : '')).join(' ') + '\n'
  const pages = doc.numPages
  await task.destroy()
  return { pages, text }
}

const base: DocBlock[] = [
  { type: 'heading', level: 1, align: 'center', inlines: [{ text: 'HỢP ĐỒNG THUÊ — Đặng Thị Ỷ' }] },
  { type: 'paragraph', inlines: [{ text: 'Đậm', bold: true }, { text: ' nghiêng', italic: true }, { br: true }, { text: 'dòng sau' }] },
  { type: 'summary', cells: [{ label: 'Phòng', value: [{ text: '103' }] }, { label: 'Giá thuê', value: [{ text: '11.500.000' }] }] },
  { type: 'list', ordered: true, items: [[{ text: 'mục một' }]] },
]

describe('renderTemplatePdf', () => {
  it('ra PDF hợp lệ với chữ tiếng Việt còn nguyên dấu, cả hai kiểu', async () => {
    for (const style of ['formal', 'modern'] as const) {
      const bytes = await renderTemplatePdf(base, style)
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
      const { text } = await pdfText(bytes)
      expect(text).toContain('HỢP ĐỒNG THUÊ')
      expect(text).toContain('Đặng Thị Ỷ')
      expect(text).toContain('11.500.000')
      expect(text).toContain('Trang 1 / 1')
    }
  })
  it('bảng dài tràn sang trang sau, không mất dòng', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ cells: [{ inlines: [{ text: `Dòng ${i + 1}` }] }, { inlines: [{ text: 'Giường' }] }] }))
    const { pages, text } = await pdfText(await renderTemplatePdf([{ type: 'table', rows }], 'modern'))
    expect(pages).toBeGreaterThanOrEqual(2)
    expect(text).toContain('Dòng 1 ')
    expect(text).toContain('Dòng 120')
  })
  it('ngắt trang thật', async () => {
    const { pages } = await pdfText(await renderTemplatePdf([{ type: 'paragraph', inlines: [{ text: 'a' }] }, { type: 'pageBreak' }, { type: 'paragraph', inlines: [{ text: 'b' }] }], 'formal'))
    expect(pages).toBe(2)
  })
})
