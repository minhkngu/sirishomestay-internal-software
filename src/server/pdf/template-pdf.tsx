import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { Align, DocBlock, Inline, TemplateStyle } from '@/domain/doc-template'
import './fonts'

const BRAND = '#0F6B4F'
const INK = '#16181A'
const MUTED = '#5B6269'
const RULE = '#D9DCDF'
const MARGIN = 56.7 // 2 cm

const s = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 14, paddingHorizontal: MARGIN, fontFamily: 'BeVietnamPro', fontSize: 10.5, color: INK },
  // lineHeight đặt ở từng đoạn chữ, không đặt ở Page: lineHeight ở Page làm mất chân trang tuyệt đối
  para: { marginBottom: 5, lineHeight: 1.55 },
  row: { flexDirection: 'row' },
  footer: { position: 'absolute', bottom: 28, left: MARGIN, right: MARGIN, textAlign: 'right', fontSize: 8, color: MUTED },
})

const ALIGN: Record<Align, 'left' | 'center' | 'right' | 'justify'> = { left: 'left', center: 'center', right: 'right', justify: 'justify' }

function Runs({ inlines, size, color, bold }: { inlines: Inline[]; size?: number; color?: string; bold?: boolean }) {
  return <>{inlines.map((i, k) => 'br' in i
    ? <Text key={k}>{'\n'}</Text>
    : <Text key={k} style={{ ...(i.bold || bold ? { fontWeight: 700 } : {}), ...(i.italic ? { fontStyle: 'italic' as const } : {}), ...(i.underline ? { textDecoration: 'underline' as const } : {}), ...(size && { fontSize: size }), ...(color && { color }) }}>{i.text}</Text>)}</>
}

function Table({ block, style }: { block: Extract<DocBlock, { type: 'table' }>; style: TemplateStyle }) {
  const modern = style === 'modern'
  const last = block.rows.length - 1
  const headerRow = block.rows.length > 1 && block.rows[0].cells.every(c => c.header)
  return <View style={{ marginTop: 2, marginBottom: 8 }}>{block.rows.map((r, ri) => {
    const isHeader = headerRow && ri === 0
    const borders = modern
      ? { borderBottomWidth: isHeader ? 0.8 : 0.5, borderBottomColor: isHeader ? INK : RULE }
      : { borderTopWidth: ri === 0 ? 1.1 : 0, borderTopColor: INK, borderBottomWidth: ri === last || isHeader ? 1.1 : 0.5, borderBottomColor: ri === last || isHeader ? INK : RULE }
    return <View key={ri} wrap={false} style={[s.row, borders]}>{r.cells.map((c, ci) => (
      <View key={ci} style={{ flex: 1, paddingVertical: 3.5, paddingRight: 6, paddingLeft: !modern && ci > 0 ? 4 : 0 }}>
        <Text style={{ lineHeight: 1.4, ...(isHeader && modern ? { fontSize: 8.5, color: MUTED } : {}), ...(isHeader && !modern ? { fontWeight: 700 } : {}) }}><Runs inlines={c.inlines} /></Text>
      </View>))}</View>
  })}</View>
}

function Summary({ block, style }: { block: Extract<DocBlock, { type: 'summary' }>; style: TemplateStyle }) {
  const modern = style === 'modern'
  return <View wrap={false} style={[s.row, { marginTop: 2, marginBottom: 12, borderTopWidth: modern ? 1.1 : 1.1, borderTopColor: modern ? BRAND : INK, borderBottomWidth: modern ? 0.5 : 1.1, borderBottomColor: modern ? RULE : INK }]}>
    {block.cells.map((c, i) => <View key={i} style={{ flex: 1, paddingVertical: 7, paddingLeft: i === 0 ? 0 : 9, paddingRight: 4, borderLeftWidth: i === 0 ? 0 : 0.5, borderLeftColor: RULE }}>
      <Text style={{ fontSize: 8, color: MUTED, lineHeight: 1.3 }}>{c.label}</Text>
      <Text style={{ fontSize: 11.5, lineHeight: 1.4 }}><Runs inlines={c.value} bold color={modern ? BRAND : INK} /></Text>
    </View>)}
  </View>
}

function Block({ block, style }: { block: DocBlock; style: TemplateStyle }) {
  const modern = style === 'modern'
  if (block.type === 'heading') {
    const size = block.level === 1 ? (modern ? 20 : 15) : block.level === 2 ? 12.5 : 11
    const align = block.align ?? (modern ? 'left' : block.level === 1 ? 'center' : 'left')
    return <View style={{ marginTop: block.level === 1 ? 0 : 9, marginBottom: block.level === 1 ? 8 : 3 }} minPresenceAhead={40}>
      <Text style={{ fontSize: size, fontWeight: 700, lineHeight: 1.25, textAlign: ALIGN[align] }}><Runs inlines={block.inlines} /></Text>
      {modern && block.level === 1 && <View style={{ width: 36, height: 2.2, backgroundColor: BRAND, marginTop: 7 }} />}
    </View>
  }
  if (block.type === 'paragraph') return block.inlines.length === 0 ? <View style={{ height: 8 }} /> : <Text style={[s.para, { textAlign: ALIGN[block.align ?? 'left'] }]}><Runs inlines={block.inlines} /></Text>
  if (block.type === 'list') return <View style={{ marginBottom: 5 }}>{block.items.map((item, i) => <View key={i} style={s.row} wrap={false}><Text style={{ width: 16, lineHeight: 1.55 }}>{block.ordered ? `${i + 1}.` : '•'}</Text><Text style={{ flex: 1, lineHeight: 1.55 }}><Runs inlines={item} /></Text></View>)}</View>
  if (block.type === 'table') return <Table block={block} style={style} />
  if (block.type === 'summary') return <Summary block={block} style={style} />
  return <View break />
}

/** Dựng PDF từ cây tài liệu: A4, lề 2 cm, chữ 10,5 pt, phông Be Vietnam Pro; bảng không cắt giữa một hàng. */
export async function renderTemplatePdf(doc: DocBlock[], style: TemplateStyle): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<Document><Page size="A4" style={s.page}>
    {doc.map((block, i) => <Block key={i} block={block} style={style} />)}
    <View style={s.footer} fixed><Text render={({ pageNumber, totalPages }) => `Trang ${pageNumber} / ${totalPages}`} /></View>
  </Page></Document>))
}
