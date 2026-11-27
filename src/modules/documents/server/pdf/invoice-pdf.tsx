// Image của @react-pdf không phải thẻ <img> HTML và không có thuộc tính alt; đặt tên khác để jsx-a11y/alt-text không áp dụng nhầm.
import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatVND, numberToVietnameseWords } from '@/domain/money'
import type { InvoicePdfData } from './types'
import type { InvoiceTemplateConfig, InvoiceSection } from '../../domain/invoice-template'
import './fonts'

const styles = StyleSheet.create({
  page: { padding: 42, paddingBottom: 56, fontFamily: 'BeVietnamPro', fontSize: 8.8, color: '#111413' },
  header: { borderBottomWidth: 0.75, borderBottomColor: '#E4E7E5', paddingBottom: 10, marginBottom: 12 },
  brand: { fontSize: 9, fontWeight: 700, color: '#0F7652' },
  title: { fontSize: 16, fontWeight: 700, marginTop: 8, letterSpacing: -0.3 },
  muted: { color: '#5F6864', marginTop: 2.5 },
  info: { paddingBottom: 10, marginBottom: 10, borderBottomWidth: 0.75, borderBottomColor: '#E4E7E5', lineHeight: 1.5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#ECEFED', paddingVertical: 5.5 },
  headRow: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: '#111413', paddingVertical: 4.5 },
  headText: { fontSize: 7.5, fontWeight: 700, color: '#5F6864' },
  description: { width: '44%' },
  quantity: { width: '16%', textAlign: 'right' },
  price: { width: '20%', textAlign: 'right' },
  total: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 0.75,
    borderTopColor: '#111413',
    fontSize: 11.5,
    fontWeight: 700,
    textAlign: 'right',
  },
  words: { marginTop: 3.5, fontSize: 8.5, fontWeight: 400, color: '#5F6864', textAlign: 'right' },
  payment: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 0.75,
    borderTopColor: '#E4E7E5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  qr: { width: 76, height: 76 },
  paymentDetails: { flexGrow: 1, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 22, left: 42, right: 42, color: '#5F6864', fontSize: 7.5 },
})
const date = (value: string) => value.split('-').reverse().join('/')
export function InvoiceDocument({
  data,
  qr,
  template,
  sample = false,
}: {
  data: InvoicePdfData
  qr: string | null
  template: InvoiceTemplateConfig
  sample?: boolean
}) {
  const [year, month] = data.periodStart.split('-')
  const title = data.kind === 'termination' ? 'Hoá đơn thanh lý' : `Hoá đơn tháng ${month}/${year}`
  const blocks: Record<InvoiceSection, React.ReactNode> = {
    header: (
      <View style={styles.header}>
        {template.logo && <PdfImage style={{ width: 90, height: 42, objectFit: 'contain' }} src={template.logo} />}
        <Text style={[styles.brand, { color: template.color }]}>{template.brand}</Text>
        <Text>{data.facility.name}</Text>
        <Text style={styles.muted}>{data.facility.address}</Text>
        <Text style={styles.title}>{template.title || title}</Text>
        <Text style={styles.muted}>
          {data.code} · Ngày lập: {date(data.issueDate)}
        </Text>
      </View>
    ),
    customer: (
      <View style={styles.info}>
        <Text>Khách thuê: {data.tenant.name}</Text>
        <Text>
          Phòng: {data.room} · Điện thoại: {data.tenant.phone || '—'}
        </Text>
        <Text>
          Kỳ: {date(data.periodStart)} – {date(data.periodEnd)}
        </Text>
      </View>
    ),
    charges: (
      <View>
        <View style={styles.headRow}>
          <Text style={[styles.description, styles.headText]}>Khoản</Text>
          <Text style={[styles.quantity, styles.headText]}>Số lượng</Text>
          <Text style={[styles.price, styles.headText]}>Đơn giá</Text>
          <Text style={[styles.price, styles.headText]}>Thành tiền</Text>
        </View>
        {data.lines.map((line, index) => (
          <View style={styles.row} key={index}>
            <Text style={styles.description}>{line.description}</Text>
            <Text style={styles.quantity}>
              {line.quantity} {line.unitLabel}
            </Text>
            <Text style={styles.price}>{formatVND(line.unitPrice)}</Text>
            <Text style={styles.price}>{formatVND(line.amount)}</Text>
          </View>
        ))}
      </View>
    ),
    total: (
      <View style={styles.total}>
        <Text>
          {data.total < 0
            ? `Siris hoàn trả khách: ${formatVND(-data.total)} ₫`
            : data.total > 0
              ? `Khách phải thanh toán: ${formatVND(data.total)} ₫`
              : 'Không phát sinh khoản phải thanh toán'}
        </Text>
        <Text style={styles.words}>{numberToVietnameseWords(Math.abs(data.total))}</Text>
        {data.note ? <Text style={{ marginTop: 8, fontSize: 9, textAlign: 'left' }}>Ghi chú: {data.note}</Text> : null}
      </View>
    ),
    payment: data.bank && (
      <View style={styles.payment}>
        <View style={styles.paymentDetails}>
          <Text style={{ fontWeight: 700, marginBottom: 3 }}>
            {sample
              ? 'Mã QR minh họa'
              : data.total < 0
                ? `Số tiền hoàn cho khách: ${formatVND(-data.total)} ₫`
                : data.total - data.paid <= 0
                  ? 'Đã thanh toán'
                  : 'Thanh toán chuyển khoản'}
          </Text>
          <Text>Ngân hàng: {data.bank.bankName}</Text>
          <Text>Số tài khoản: {data.bank.accountNumber}</Text>
          <Text>Chủ tài khoản: {data.bank.accountName}</Text>
          <Text>Nội dung: {data.code}</Text>
          {data.dueDate && <Text>Hạn thanh toán: {date(data.dueDate)}</Text>}
        </View>
        {qr && (
          <View style={{ alignItems: 'center' }}>
            <View style={{ padding: 4, borderWidth: 0.5, borderColor: '#E4E7E5' }}>
              <PdfImage style={styles.qr} src={qr} />
            </View>
            <Text style={{ fontSize: 7, color: '#5F6864', marginTop: 3 }}>Quét để chuyển khoản</Text>
          </View>
        )}
      </View>
    ),
    footer: template.footer ? (
      <Text style={{ marginTop: 20, color: '#7A8B85', fontSize: 8 }}>{template.footer}</Text>
    ) : null,
  }
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {template.sections
          .filter((section) => !template.hidden.includes(section))
          .map((section) => (
            <View key={section}>{blocks[section]}</View>
          ))}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${data.facility.name}${sample ? ' · DỮ LIỆU MẪU — KHÔNG THANH TOÁN' : ''} · ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
