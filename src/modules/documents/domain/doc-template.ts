import { parse, HTMLElement, TextNode, type Node } from 'node-html-parser'
import { DOC_TYPE_LABELS, TEMPLATE_FIELDS, type DocType } from '@/domain/template-fields'

export type TemplateStyle = 'formal' | 'modern'
export type Align = 'left' | 'center' | 'right' | 'justify'
export type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean } | { br: true }
export type DocBlock =
  | { type: 'heading'; level: 1 | 2 | 3; align?: Align; inlines: Inline[] }
  | { type: 'paragraph'; align?: Align; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; rows: { cells: { inlines: Inline[]; header?: boolean; align?: Align }[] }[] }
  | { type: 'summary'; cells: { label: string; value: Inline[] }[] }
  | { type: 'pageBreak' }
  /** Mã QR thanh toán của hoá đơn; chỉ hiện khi hoá đơn còn tiền phải trả và có tài khoản nhận. */
  | { type: 'qr' }

type Fmt = { bold?: boolean; italic?: boolean; underline?: boolean }
type Ctx = { data: Record<string, unknown>; warnings: string[] }
type Scope = Record<string, unknown>[]

/** Giá trị của chỗ điền: tìm trong phạm vi trong cùng (phần tử của vòng lặp) trước, rồi ra ngoài; thiếu thì ghi cảnh báo. */
function lookup(key: string, scope: Scope, ctx: Ctx): string {
  for (const level of scope) {
    const v = level[key]
    if (v !== undefined && v !== null) return String(v)
  }
  if (!ctx.warnings.includes(key)) ctx.warnings.push(key)
  return ''
}

function pushText(out: Inline[], text: string, fmt: Fmt) {
  if (!text) return
  const parts = text.split('\n')
  parts.forEach((part, i) => {
    if (i > 0) out.push({ br: true })
    if (part) out.push({ text: part, ...fmt })
  })
}

function inlinesOf(nodes: Node[], scope: Scope, ctx: Ctx, fmt: Fmt = {}): Inline[] {
  const out: Inline[] = []
  for (const node of nodes) {
    if (node instanceof TextNode) {
      // khoảng trắng liên tiếp trong HTML gộp thành một khoảng trắng
      pushText(out, node.text.replace(/\s+/g, ' '), fmt)
    } else if (node instanceof HTMLElement) {
      const tag = node.tagName?.toLowerCase()
      if (node.getAttribute('data-field')) pushText(out, lookup(node.getAttribute('data-field')!, scope, ctx), fmt)
      else if (tag === 'br') out.push({ br: true })
      else {
        const next: Fmt = { ...fmt }
        if (tag === 'strong' || tag === 'b') next.bold = true
        if (tag === 'em' || tag === 'i') next.italic = true
        if (tag === 'u') next.underline = true
        out.push(...inlinesOf(node.childNodes, scope, ctx, next))
      }
    }
  }
  return trimEnds(out)
}

function trimEnds(list: Inline[]): Inline[] {
  const out = list.slice()
  const first = out[0]
  if (first && 'text' in first) {
    first.text = first.text.replace(/^\s+/, '')
    if (!first.text) out.shift()
  }
  const last = out[out.length - 1]
  if (last && 'text' in last) {
    last.text = last.text.replace(/\s+$/, '')
    if (!last.text) out.pop()
  }
  return out
}

function alignOf(el: HTMLElement): Align | undefined {
  const m = /text-align\s*:\s*(left|center|right|justify)/.exec(el.getAttribute('style') ?? '')
  const a = (m?.[1] ?? el.getAttribute('align')) as Align | undefined
  return a && ['left', 'center', 'right', 'justify'].includes(a) ? a : undefined
}

function cellInlines(cell: HTMLElement, scope: Scope, ctx: Ctx): Inline[] {
  // ô có nhiều đoạn: nối bằng xuống dòng
  const paras = cell.childNodes.filter(
    (n): n is HTMLElement => n instanceof HTMLElement && n.tagName?.toLowerCase() === 'p',
  )
  if (paras.length === 0) return inlinesOf(cell.childNodes, scope, ctx)
  const out: Inline[] = []
  paras.forEach((p, i) => {
    if (i > 0) out.push({ br: true })
    out.push(...inlinesOf(p.childNodes, scope, ctx))
  })
  return out
}

function cellAlign(cell: HTMLElement): Align | undefined {
  const direct = alignOf(cell)
  if (direct) return direct
  const firstP = cell.childNodes.find(
    (n): n is HTMLElement => n instanceof HTMLElement && n.tagName?.toLowerCase() === 'p',
  )
  return firstP ? alignOf(firstP) : undefined
}

function tableBlock(el: HTMLElement, scope: Scope, ctx: Ctx): DocBlock {
  const rows: { cells: { inlines: Inline[]; header?: boolean; align?: Align }[] }[] = []
  const addRow = (tr: HTMLElement, s: Scope) => {
    const cells = tr.childNodes.filter(
      (n): n is HTMLElement => n instanceof HTMLElement && ['td', 'th'].includes(n.tagName?.toLowerCase() ?? ''),
    )
    rows.push({
      cells: cells.map((c) => {
        const align = cellAlign(c)
        return {
          inlines: cellInlines(c, s, ctx),
          ...(c.tagName.toLowerCase() === 'th' && { header: true }),
          ...(align && { align }),
        }
      }),
    })
  }
  for (const tr of el.querySelectorAll('tr')) {
    const loop = tr.getAttribute('data-loop')
    if (!loop) {
      addRow(tr, scope)
      continue
    }
    const items = ctx.data[loop]
    if (!Array.isArray(items)) {
      if (!ctx.warnings.includes(loop)) ctx.warnings.push(loop)
      continue
    }
    for (const item of items) addRow(tr, [item as Record<string, unknown>, ...scope])
  }
  return { type: 'table', rows }
}

const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'table', 'hr', 'div', 'section', 'article'])

function blocksOf(nodes: Node[], scope: Scope, ctx: Ctx): DocBlock[] {
  const out: DocBlock[] = []
  let pending: Node[] = []
  const flush = () => {
    const inlines = inlinesOf(pending, scope, ctx)
    if (inlines.length) out.push({ type: 'paragraph', inlines })
    pending = []
  }
  for (const node of nodes) {
    const tag = node instanceof HTMLElement ? node.tagName?.toLowerCase() : ''
    if (!(node instanceof HTMLElement) || !BLOCK_TAGS.has(tag) || node.getAttribute('data-field')) {
      pending.push(node)
      continue
    }
    flush()
    if (tag === 'h1' || tag === 'h2' || tag === 'h3')
      out.push({
        type: 'heading',
        level: Number(tag[1]) as 1 | 2 | 3,
        ...(alignOf(node) && { align: alignOf(node) }),
        inlines: inlinesOf(node.childNodes, scope, ctx),
      })
    else if (tag === 'p')
      out.push({
        type: 'paragraph',
        ...(alignOf(node) && { align: alignOf(node) }),
        inlines: inlinesOf(node.childNodes, scope, ctx),
      })
    else if (tag === 'ul' || tag === 'ol')
      out.push({
        type: 'list',
        ordered: tag === 'ol',
        items: node.querySelectorAll('li').map((li) => inlinesOf(li.childNodes, scope, ctx)),
      })
    else if (tag === 'table') out.push(tableBlock(node, scope, ctx))
    else if (tag === 'hr') {
      if (node.hasAttribute('data-page-break')) out.push({ type: 'pageBreak' })
    } else if (node.getAttribute('data-role') === 'qr') out.push({ type: 'qr' })
    else if (node.getAttribute('data-role') === 'summary') {
      out.push({
        type: 'summary',
        cells: node.childNodes
          .filter((n): n is HTMLElement => n instanceof HTMLElement)
          .map((c) => ({ label: c.getAttribute('data-label') ?? '', value: inlinesOf(c.childNodes, scope, ctx) })),
      })
    } else out.push(...blocksOf(node.childNodes, scope, ctx))
  }
  flush()
  return out
}

/** Đọc HTML của mẫu thành cây tài liệu và điền dữ liệu; chỗ điền thiếu dữ liệu để trống và ghi tên vào `warnings`. */
export function renderTemplate(html: string, data: Record<string, unknown>): { doc: DocBlock[]; warnings: string[] } {
  const ctx: Ctx = { data, warnings: [] }
  const root = parse(html)
  return { doc: blocksOf(root.childNodes, [data], ctx), warnings: ctx.warnings }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Mẫu tối thiểu: tiêu đề và mỗi chỗ điền một đoạn, vòng lặp là bảng một hàng lặp. */
export function sampleTemplateHtml(docType: DocType): string {
  const parts = [`<h1 style="text-align:center">${esc(DOC_TYPE_LABELS[docType].toUpperCase())}</h1>`]
  for (const f of TEMPLATE_FIELDS[docType]) {
    if (f.loop) {
      parts.push(`<p><strong>${esc(f.label)}:</strong></p>`)
      parts.push(
        `<table><tr data-loop="${f.loop.key}">${f.loop.fields.map((x) => `<td><span data-field="${x.key}">${esc(x.label)}</span></td>`).join('')}</tr></table>`,
      )
    } else parts.push(`<p>${esc(f.label)}: <span data-field="${f.key}">${esc(f.label)}</span></p>`)
  }
  return parts.join('')
}
