import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import { buildDocx } from '@/modules/documents/server/word/build-docx'
import type { DocBlock } from '@/modules/documents/domain/doc-template'

const doc: DocBlock[] = [
  { type: 'heading', level: 1, align: 'center', inlines: [{ text: 'Đặng Thị Ỷ — HỢP ĐỒNG' }] },
  { type: 'paragraph', inlines: [{ text: 'Đậm', bold: true }, { br: true }, { text: 'dòng sau' }] },
  { type: 'list', ordered: false, items: [[{ text: 'mục một' }], [{ text: 'mục hai' }]] },
  {
    type: 'summary',
    cells: [
      { label: 'Phòng', value: [{ text: '103' }] },
      { label: 'Giá thuê', value: [{ text: '11.500.000' }] },
    ],
  },
  {
    type: 'table',
    rows: [
      {
        cells: [
          { inlines: [{ text: 'Mã' }], header: true },
          { inlines: [{ text: 'Tên' }], header: true },
        ],
      },
      { cells: [{ inlines: [{ text: 'GD-1' }] }, { inlines: [{ text: 'Giường' }] }] },
    ],
  },
  { type: 'pageBreak' },
  { type: 'paragraph', inlines: [{ text: 'Trang hai' }] },
]
const xmlOf = async (style: 'formal' | 'modern') =>
  new PizZip(await buildDocx(doc, style)).file('word/document.xml')!.asText()

describe('buildDocx', () => {
  it('ra tệp .docx hợp lệ có chữ tiếng Việt, bảng, danh sách, ngắt trang và khổ A4', async () => {
    const xml = await xmlOf('formal')
    for (const t of ['Đặng Thị Ỷ — HỢP ĐỒNG', 'mục một', '11.500.000', 'Giường', 'Trang hai']) expect(xml).toContain(t)
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('w:type="page"')
    expect(xml).toContain('w:w="11906"')
  })
  it('kiểu hiện đại tô xanh Siris, kiểu trang trọng không dùng màu', async () => {
    expect(await xmlOf('modern')).toContain('0F6B4F')
    expect(await xmlOf('formal')).not.toContain('0F6B4F')
  })
})
