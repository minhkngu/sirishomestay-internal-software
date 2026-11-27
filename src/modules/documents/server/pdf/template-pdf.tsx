// Image của @react-pdf không phải thẻ <img> HTML và không có thuộc tính alt; đặt tên khác để jsx-a11y/alt-text không áp dụng nhầm.
import { Document, Image as PdfImage, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { Align, DocBlock, Inline, TemplateStyle } from '../../domain/doc-template'
import './fonts'

const BRAND = '#0F7652'
const INK = '#111413'
const MUTED = '#5F6864'
const RULE = '#E4E7E5'
const HAIR = '#ECEFED'
const MARGIN = 38

const s = StyleSheet.create({
  page: {
    paddingTop: MARGIN,
    paddingBottom: MARGIN + 10,
    paddingHorizontal: MARGIN,
    fontFamily: 'BeVietnamPro',
    fontSize: 8.6,
    color: INK,
  },
  // react-pdf tính lineHeight theo fontSize của chính đoạn chữ, không theo fontSize kế thừa từ Page: mọi đoạn chữ đặt fontSize riêng.
  // lineHeight đặt ở từng đoạn chữ, không đặt ở Page: lineHeight ở Page làm mất chân trang tuyệt đối
  para: { marginBottom: 3, fontSize: 8.6, lineHeight: 1.42 },
  row: { flexDirection: 'row' },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: MARGIN,
    right: MARGIN,
    textAlign: 'right',
    fontSize: 7.5,
    color: MUTED,
  },
})

const ALIGN: Record<Align, 'left' | 'center' | 'right' | 'justify'> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'justify',
}

const plainText = (inlines: Inline[]): string =>
  inlines
    .map((i) => ('br' in i ? ' ' : i.text))
    .join('')
    .trim()

const NUMERIC_HEADER_RE = /^(sl|số lượng|đơn giá|thành tiền|số tiền|tổng|đã trả|còn lại|chỉ số)/i
const MONEY_LABEL_RE = /^(thanh toán|tổng|còn lại|giá thuê|tiền cọc|phải trả)/i

function isSignatureTable(block: Extract<DocBlock, { type: 'table' }>): boolean {
  if (block.rows.length !== 1) return false
  const cells = block.rows[0].cells
  if (cells.length < 2 || cells.length > 3) return false
  if (cells.some((c) => c.header)) return false
  const text = cells.map((c) => plainText(c.inlines).toLowerCase()).join(' ')
  return (
    text.includes('ký') || text.includes('bên a') || text.includes('bên b') || cells.every((c) => c.align === 'center')
  )
}

function Runs({ inlines, size, color, bold }: { inlines: Inline[]; size?: number; color?: string; bold?: boolean }) {
  return (
    <>
      {inlines.map((i, k) =>
        'br' in i ? (
          <Text key={k}>{'\n'}</Text>
        ) : (
          <Text
            key={k}
            style={{
              ...(i.bold || bold ? { fontWeight: 700 } : {}),
              ...(i.italic ? { fontStyle: 'italic' as const } : {}),
              ...(i.underline ? { textDecoration: 'underline' as const } : {}),
              ...(size && { fontSize: size }),
              ...(color && { color }),
            }}
          >
            {i.text}
          </Text>
        ),
      )}
    </>
  )
}

function Table({ block, style }: { block: Extract<DocBlock, { type: 'table' }>; style: TemplateStyle }) {
  const modern = style === 'modern'
  if (isSignatureTable(block)) {
    const cells = block.rows[0].cells
    return (
      <View wrap={false} style={[s.row, { marginTop: 14, gap: 16 }]}>
        {cells.map((c, ci) => (
          <View key={ci} style={{ flex: 1 }}>
            <Text style={{ fontSize: 8.8, lineHeight: 1.45, textAlign: ALIGN[c.align ?? 'center'] }}>
              <Runs inlines={c.inlines} />
            </Text>
          </View>
        ))}
      </View>
    )
  }

  const last = block.rows.length - 1
  const headerRow = block.rows.length > 1 && block.rows[0].cells.every((c) => c.header)
  const colCount = block.rows[0]?.cells.length ?? 1
  const rightCols = new Set<number>()
  if (headerRow) {
    block.rows[0].cells.forEach((c, ci) => {
      if (ci > 0 && NUMERIC_HEADER_RE.test(plainText(c.inlines))) rightCols.add(ci)
    })
  }

  const colFlex = (ci: number) => {
    if (colCount >= 3 && ci === 0) return 2.3
    if (colCount === 2 && ci === 0) return 1.5
    return 1
  }

  return (
    <View style={{ marginTop: 4, marginBottom: 8 }}>
      {block.rows.map((r, ri) => {
        const isHeader = headerRow && ri === 0
        const borders = modern
          ? { borderBottomWidth: isHeader ? 0.8 : 0.45, borderBottomColor: isHeader ? INK : HAIR }
          : {
              borderTopWidth: ri === 0 ? 0.85 : 0,
              borderTopColor: INK,
              borderBottomWidth: ri === last || isHeader ? 0.85 : 0.45,
              borderBottomColor: ri === last || isHeader ? INK : RULE,
            }
        return (
          <View key={ri} wrap={false} style={[s.row, borders]}>
            {r.cells.map((c, ci) => {
              const align = c.align ?? (rightCols.has(ci) ? 'right' : 'left')
              return (
                <View
                  key={ci}
                  style={{
                    flex: colFlex(ci),
                    paddingVertical: isHeader ? 4.5 : 5,
                    paddingRight: ci === colCount - 1 ? 0 : 8,
                    paddingLeft: ci === 0 ? 0 : 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8.6,
                      lineHeight: 1.4,
                      textAlign: ALIGN[align],
                      ...(isHeader && modern ? { fontSize: 7.5, color: MUTED, fontWeight: 700 } : {}),
                      ...(isHeader && !modern ? { fontWeight: 700 } : {}),
                    }}
                  >
                    <Runs inlines={c.inlines} />
                  </Text>
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

function Summary({ block, style }: { block: Extract<DocBlock, { type: 'summary' }>; style: TemplateStyle }) {
  const modern = style === 'modern'
  return (
    <View
      wrap={false}
      style={[
        s.row,
        {
          marginTop: 5,
          marginBottom: 8,
          paddingVertical: 6,
          gap: 14,
          borderTopWidth: 0.75,
          borderTopColor: modern ? RULE : INK,
          borderBottomWidth: 0.75,
          borderBottomColor: modern ? RULE : INK,
        },
      ]}
    >
      {block.cells.map((c, i) => {
        const highlight = modern && MONEY_LABEL_RE.test(c.label)
        return (
          <View key={i} style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.2, color: MUTED, lineHeight: 1.3 }}>{c.label}</Text>
            <Text style={{ fontSize: 9.5, lineHeight: 1.35, marginTop: 2 }}>
              <Runs inlines={c.value} bold color={highlight ? BRAND : INK} />
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function PaymentWithQr({ paragraphs, qr }: { paragraphs: Extract<DocBlock, { type: 'paragraph' }>[]; qr: string }) {
  return (
    <View
      wrap={false}
      style={[
        s.row,
        {
          marginTop: 12,
          paddingTop: 10,
          borderTopWidth: 0.75,
          borderTopColor: RULE,
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        {paragraphs.map((p, i) => (
          <Text key={i} style={[s.para, { marginBottom: i === 0 ? 4 : 2.5 }]}>
            <Runs inlines={p.inlines} />
          </Text>
        ))}
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ padding: 4, borderWidth: 0.5, borderColor: RULE }}>
          <PdfImage src={qr} style={{ width: 76, height: 76 }} />
        </View>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 3 }}>Quét để chuyển khoản</Text>
      </View>
    </View>
  )
}

function Block({ block, style, qr }: { block: DocBlock; style: TemplateStyle; qr?: string | null }) {
  const modern = style === 'modern'
  if (block.type === 'qr')
    return qr ? (
      <View wrap={false} style={{ marginVertical: 6 }}>
        <PdfImage src={qr} style={{ width: 80, height: 80 }} />
      </View>
    ) : (
      <View />
    )
  if (block.type === 'heading') {
    const size = block.level === 1 ? (modern ? 16 : 13.5) : block.level === 2 ? 9.8 : 9
    const align = block.align ?? (modern ? 'left' : block.level === 1 ? 'center' : 'left')
    return (
      <View
        style={{ marginTop: block.level === 1 ? 0 : 7.5, marginBottom: block.level === 1 ? 5 : 2.5 }}
        minPresenceAhead={40}
      >
        <Text
          style={{
            fontSize: size,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: block.level === 1 && modern ? -0.3 : 0,
            textAlign: ALIGN[align],
          }}
        >
          <Runs inlines={block.inlines} />
        </Text>
      </View>
    )
  }
  if (block.type === 'paragraph')
    return block.inlines.length === 0 ? (
      <View style={{ height: 5 }} />
    ) : (
      <Text style={[s.para, { textAlign: ALIGN[block.align ?? 'left'] }]}>
        <Runs inlines={block.inlines} />
      </Text>
    )
  if (block.type === 'list')
    return (
      <View style={{ marginBottom: 4 }}>
        {block.items.map((item, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={{ width: 14, fontSize: 8.8, lineHeight: 1.45 }}>{block.ordered ? `${i + 1}.` : '•'}</Text>
            <Text style={{ flex: 1, fontSize: 8.8, lineHeight: 1.45 }}>
              <Runs inlines={item} />
            </Text>
          </View>
        ))}
      </View>
    )
  if (block.type === 'table') return <Table block={block} style={style} />
  if (block.type === 'summary') return <Summary block={block} style={style} />
  return <View break />
}

const PAYMENT_HEAD_RE = /^(thanh toán|thông tin chuyển khoản|chuyển khoản)/i

function renderBlocks(doc: DocBlock[], style: TemplateStyle, qr?: string | null): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let i = 0
  while (i < doc.length) {
    const b = doc[i]
    if (qr && b.type === 'paragraph' && PAYMENT_HEAD_RE.test(plainText(b.inlines))) {
      let j = i + 1
      while (j < doc.length && j - i <= 7 && doc[j].type === 'paragraph') j++
      if (j < doc.length && doc[j].type === 'qr') {
        const paras = doc.slice(i, j) as Extract<DocBlock, { type: 'paragraph' }>[]
        nodes.push(<PaymentWithQr key={`pay-${i}`} paragraphs={paras} qr={qr} />)
        i = j + 1
        continue
      }
    }
    nodes.push(<Block key={i} block={b} style={style} qr={qr} />)
    i++
  }
  return nodes
}

/** Dựng PDF từ cây tài liệu: A4, lề gọn, phông Be Vietnam Pro; bảng không cắt giữa một hàng. */
export async function renderTemplatePdf(
  doc: DocBlock[],
  style: TemplateStyle,
  options: { qr?: string | null } = {},
): Promise<Uint8Array> {
  return new Uint8Array(
    await renderToBuffer(
      <Document>
        <Page size="A4" style={s.page}>
          {renderBlocks(doc, style, options.qr)}
          <View style={s.footer} fixed>
            <Text render={({ pageNumber, totalPages }) => `Trang ${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      </Document>,
    ),
  )
}
