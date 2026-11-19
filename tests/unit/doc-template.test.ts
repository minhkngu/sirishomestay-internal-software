import { describe, expect, it } from 'vitest'
import { renderTemplate, sampleTemplateHtml } from '@/domain/doc-template'
import { DOC_TYPES, sampleDataFor } from '@/domain/template-fields'

describe('renderTemplate', () => {
  it('thay chỗ điền bằng dữ liệu', () => {
    const { doc, warnings } = renderTemplate('<p>Khách: <span data-field="ten_khach">x</span></p>', {
      ten_khach: 'Nguyễn Văn A',
    })
    expect(warnings).toEqual([])
    expect(doc).toEqual([{ type: 'paragraph', inlines: [{ text: 'Khách: ' }, { text: 'Nguyễn Văn A' }] }])
  })

  it('đọc chữ đậm, nghiêng, gạch chân và xuống dòng', () => {
    const { doc } = renderTemplate('<p><strong>a</strong><em>b</em><u>c</u><br>d</p>', {})
    expect(doc[0]).toEqual({
      type: 'paragraph',
      inlines: [
        { text: 'a', bold: true },
        { text: 'b', italic: true },
        { text: 'c', underline: true },
        { br: true },
        { text: 'd' },
      ],
    })
  })

  it('giữ nguyên chữ của giá trị chứa ký tự đặc biệt và xuống dòng', () => {
    const { doc } = renderTemplate('<p><span data-field="a">x</span></p>', { a: 'a < b & {{x}}\nd' })
    expect(doc[0]).toEqual({ type: 'paragraph', inlines: [{ text: 'a < b & {{x}}' }, { br: true }, { text: 'd' }] })
  })

  const table =
    '<table><tr><td>Họ tên</td><td>Giấy tờ</td></tr><tr data-loop="nguoi_o"><td><span data-field="ho_ten">x</span></td><td><span data-field="giay_to">y</span></td></tr></table>'
  it('nhân hàng lặp theo mảng', () => {
    const { doc, warnings } = renderTemplate(table, {
      nguoi_o: [
        { ho_ten: 'A', giay_to: '1' },
        { ho_ten: 'B', giay_to: '2' },
      ],
    })
    expect(warnings).toEqual([])
    expect(doc[0]).toMatchObject({ type: 'table' })
    const rows = (doc[0] as { rows: { cells: { inlines: unknown[] }[] }[] }).rows
    expect(rows).toHaveLength(3)
    expect(rows[2].cells[0].inlines).toEqual([{ text: 'B' }])
  })
  it('mảng rỗng thì không còn hàng lặp', () => {
    const { doc } = renderTemplate(table, { nguoi_o: [] })
    expect((doc[0] as { rows: unknown[] }).rows).toHaveLength(1)
  })

  it('chỗ điền thiếu dữ liệu để trống và ghi vào warnings một lần', () => {
    const { doc, warnings } = renderTemplate('<p><span data-field="a">x</span> <span data-field="a">x</span></p>', {})
    expect(warnings).toEqual(['a'])
    expect(doc[0]).toMatchObject({ type: 'paragraph' })
  })

  it('tiêu đề, căn lề, danh sách, ngắt trang', () => {
    const { doc } = renderTemplate(
      '<h2 style="text-align:center">T</h2><ul><li>a</li></ul><ol><li>b</li></ol><hr data-page-break>',
      {},
    )
    expect(doc).toEqual([
      { type: 'heading', level: 2, align: 'center', inlines: [{ text: 'T' }] },
      { type: 'list', ordered: false, items: [[{ text: 'a' }]] },
      { type: 'list', ordered: true, items: [[{ text: 'b' }]] },
      { type: 'pageBreak' },
    ])
  })

  it('khối tóm tắt thành block summary với nhãn và giá trị đã điền', () => {
    const html =
      '<div data-role="summary"><div data-label="Phòng"><span data-field="so_phong">x</span></div><div data-label="Giá thuê"><span data-field="gia_thue">y</span></div></div>'
    const { doc } = renderTemplate(html, { so_phong: '103', gia_thue: '11.500.000' })
    expect(doc).toEqual([
      {
        type: 'summary',
        cells: [
          { label: 'Phòng', value: [{ text: '103' }] },
          { label: 'Giá thuê', value: [{ text: '11.500.000' }] },
        ],
      },
    ])
  })

  it('mẫu tối thiểu của mọi loại điền hết bằng dữ liệu mẫu, không cảnh báo', () => {
    for (const t of DOC_TYPES) expect(renderTemplate(sampleTemplateHtml(t), sampleDataFor(t)).warnings).toEqual([])
  })
})
