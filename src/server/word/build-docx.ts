import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  PageBreak,
  type ParagraphChild,
} from 'docx'
import type { Align, DocBlock, Inline, TemplateStyle } from '@/domain/doc-template'

const FONT = 'Be Vietnam Pro'
const BRAND = '0F6B4F'
const INK = '16181A'
const MUTED = '5B6269'
const RULE = 'D9DCDF'
const BODY = 21 // 10,5 pt (đơn vị nửa điểm)
const LINE = 372 // dòng cách 1,55

const ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}
const line = (size = 6, color = INK) => ({ style: BorderStyle.SINGLE, size, color })
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }

function runs(inlines: Inline[], opt: { size?: number; color?: string; bold?: boolean } = {}): ParagraphChild[] {
  return inlines.map((i) =>
    'br' in i
      ? new TextRun({ break: 1 })
      : new TextRun({
          text: i.text,
          bold: i.bold || opt.bold,
          italics: i.italic,
          underline: i.underline ? {} : undefined,
          size: opt.size ?? BODY,
          color: opt.color ?? INK,
          font: FONT,
        }),
  )
}

function para(
  inlines: Inline[],
  o: {
    align?: Align
    size?: number
    color?: string
    bold?: boolean
    after?: number
    before?: number
    border?: object
  } = {},
) {
  return new Paragraph({
    children: runs(inlines, o),
    alignment: o.align ? ALIGN[o.align] : undefined,
    spacing: { line: LINE, after: o.after ?? 100, before: o.before ?? 0 },
    border: o.border as never,
  })
}

function cell(
  inlines: Inline[],
  width: number,
  o: { header?: boolean; style: TemplateStyle; first: boolean; last: boolean; rows: number; row: number },
) {
  const modern = o.style === 'modern'
  const topBottom = !modern
    ? {
        top: o.row === 0 ? line(8) : none,
        bottom: o.row === o.rows - 1 ? line(8) : o.row === 0 ? line(8) : line(2, RULE),
      }
    : { top: none, bottom: o.row === 0 ? line(4) : line(2, RULE) }
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: { ...topBottom, left: none, right: none },
    margins: { top: 60, bottom: 60, left: o.first ? 0 : 80, right: 80 },
    children: [
      para(inlines, {
        bold: o.header && !modern,
        size: o.header && modern ? 17 : BODY,
        color: o.header && modern ? MUTED : INK,
        after: 0,
      }),
    ],
  })
}

function table(block: Extract<DocBlock, { type: 'table' }>, style: TemplateStyle) {
  const cols = Math.max(1, ...block.rows.map((r) => r.cells.length))
  const w = Math.floor(100 / cols)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: block.rows.map(
      (r, ri) =>
        new TableRow({
          cantSplit: true,
          children: r.cells.map((c, ci) =>
            cell(c.inlines, w, {
              header: c.header || (ri === 0 && block.rows.length > 1 && block.rows[0].cells.every((x) => x.header)),
              style,
              first: ci === 0,
              last: ci === r.cells.length - 1,
              rows: block.rows.length,
              row: ri,
            }),
          ),
        }),
    ),
  })
}

function summary(block: Extract<DocBlock, { type: 'summary' }>, style: TemplateStyle) {
  const w = Math.floor(100 / Math.max(1, block.cells.length))
  const modern = style === 'modern'
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        cantSplit: true,
        children: block.cells.map(
          (c, i) =>
            new TableCell({
              width: { size: w, type: WidthType.PERCENTAGE },
              borders: {
                top: modern ? line(10, BRAND) : line(8),
                bottom: modern ? line(2, RULE) : line(8),
                left: i === 0 ? none : line(2, RULE),
                right: none,
              },
              shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' },
              margins: { top: 100, bottom: 100, left: i === 0 ? 0 : 140, right: 80 },
              children: [
                para([{ text: c.label }], { size: 16, color: MUTED, after: 20 }),
                para(c.value, { size: 24, bold: true, color: modern ? BRAND : INK, after: 0 }),
              ],
            }),
        ),
      }),
    ],
  })
}

/** Dựng .docx từ cây tài liệu: A4, lề 2 cm, chữ 10,5 pt; kiểu `modern` tô xanh Siris ở đường kẻ tiêu đề và số tóm tắt. */
export async function buildDocx(doc: DocBlock[], style: TemplateStyle): Promise<Uint8Array> {
  const modern = style === 'modern'
  const children: (Paragraph | Table)[] = []
  for (const b of doc) {
    if (b.type === 'heading') {
      const size = b.level === 1 ? (modern ? 40 : 30) : b.level === 2 ? 26 : 23
      const align = b.align ?? (modern ? 'left' : b.level === 1 ? 'center' : 'left')
      children.push(
        para(b.inlines, {
          align,
          size,
          bold: true,
          before: b.level === 1 ? 0 : 160,
          after: b.level === 1 ? 160 : 60,
          border:
            b.level === 1 && modern
              ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 8 } }
              : undefined,
        }),
      )
    } else if (b.type === 'paragraph') children.push(para(b.inlines, { align: b.align }))
    else if (b.type === 'list')
      for (const item of b.items)
        children.push(
          new Paragraph({
            children: runs(item),
            numbering: { reference: b.ordered ? 'ordered' : 'bullet', level: 0 },
            spacing: { line: LINE, after: 40 },
          }),
        )
    else if (b.type === 'table') {
      children.push(table(b, style), para([], { after: 80 }))
    } else if (b.type === 'summary') {
      children.push(summary(b, style), para([], { after: 80 }))
    } else if (b.type === 'qr') continue
    else children.push(new Paragraph({ children: [new PageBreak()] }))
  }
  const document = new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY, color: INK } } } },
    numbering: {
      config: ['bullet', 'ordered'].map((ref) => ({
        reference: ref,
        levels: [
          {
            level: 0,
            format: ref === 'bullet' ? LevelFormat.BULLET : LevelFormat.DECIMAL,
            text: ref === 'bullet' ? '•' : '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 270 } } },
          },
        ],
      })),
    },
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children,
      },
    ],
  })
  return new Uint8Array(await Packer.toBuffer(document))
}
