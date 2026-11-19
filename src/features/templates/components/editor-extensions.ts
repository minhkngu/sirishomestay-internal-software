import { Node } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'

/** Chỗ điền: nút nhỏ trong dòng chữ, lưu thành `<span data-field="khoá">nhãn</span>` (cùng quy ước với `renderTemplate`). */
export const FieldChip = Node.create({
  name: 'fieldChip',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes() { return { key: { default: '' }, label: { default: '' } } },
  parseHTML() {
    return [{ tag: 'span[data-field]', getAttrs: (el) => { const e = el as HTMLElement; const key = e.getAttribute('data-field') ?? ''; return { key, label: e.textContent || key } } }]
  },
  renderHTML({ node }) { return ['span', { 'data-field': node.attrs.key, class: 'field-chip' }, node.attrs.label] },
})

/** Ngắt trang: `<hr data-page-break>`. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'hr[data-page-break]', priority: 200 }] },
  renderHTML() { return ['hr', { 'data-page-break': '', class: 'page-break' }] },
})

/** Khối tóm tắt của kiểu Hiện đại: `<div data-role="summary"><div data-label="Phòng">…</div>…</div>`. */
export const SummaryItem = Node.create({
  name: 'summaryItem',
  content: 'inline*',
  defining: true,
  addAttributes() { return { label: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? '' } } },
  parseHTML() { return [{ tag: 'div[data-label]' }] },
  renderHTML({ node }) { return ['div', { 'data-label': node.attrs.label, class: 'summary-item' }, 0] },
})
export const Summary = Node.create({
  name: 'summary',
  group: 'block',
  content: 'summaryItem+',
  defining: true,
  isolating: true,
  parseHTML() { return [{ tag: 'div[data-role="summary"]', priority: 200 }] },
  renderHTML() { return ['div', { 'data-role': 'summary', class: 'summary-block' }, 0] },
})

/** Hàng bảng có thể lặp theo danh sách: `<tr data-loop="khoá">`. */
export const LoopRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      loop: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-loop'), renderHTML: (a: Record<string, unknown>) => (a.loop ? { 'data-loop': a.loop as string } : {}) },
    }
  },
})

export function editorExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, horizontalRule: false, code: false, codeBlock: false, blockquote: false, strike: false, link: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table, LoopRow, TableHeader, TableCell,
    FieldChip, PageBreak, Summary, SummaryItem,
  ]
}
