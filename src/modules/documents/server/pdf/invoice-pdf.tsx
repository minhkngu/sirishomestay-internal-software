// Image của @react-pdf không phải thẻ <img> HTML và không có thuộc tính alt; đặt tên khác để jsx-a11y/alt-text không áp dụng nhầm.
import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatVND, numberToVietnameseWords } from '@/domain/money'
import type { InvoicePdfData } from './types'
import type { InvoiceTemplateConfig, InvoiceSection } from '../../domain/invoice-template'
import './fonts'

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 58, fontFamily: 'BeVietnamPro', fontSize: 9, color: '#1C2B27' },
  header: { borderBottomWidth: 2, borderBottomColor: '#0E9F6E', paddingBottom: 14, marginBottom: 16 },
  brand: { fontSize: 12, fontWeight: 700, color: '#0E9F6E' },
  title: { fontSize: 19, fontWeight: 700, marginTop: 14 },
  muted: { color: '#4B5E58', marginTop: 4 },
  info: { backgroundColor: '#F3F7F5', padding: 12, marginBottom: 16, lineHeight: 1.7 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E1EAE6', paddingVertical: 8 },
  description: { width: '40%' },
  quantity: { width: '20%' },
  price: { width: '20%', textAlign: 'right' },
  total: { marginTop: 16, padding: 12, backgroundColor: '#F3F7F5', fontSize: 13, fontWeight: 700, textAlign: 'right' },
  words: { marginTop: 6, fontSize: 9, fontWeight: 400, textAlign: 'right' },
  payment: { marginTop: 20, padding: 12, borderWidth: 1, borderColor: '#E1EAE6', flexDirection: 'row', gap: 14 },
  qr: { width: 96, height: 96 },
  paymentDetails: { flexGrow: 1, lineHeight: 1.7 },
  footer: { position: 'absolute', bottom: 25, left: 40, right: 40, color: '#7A8B85', fontSize: 8 },
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
      <View style={[styles.header, { borderBottomColor: template.color }]}>
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
        <View style={styles.row}>
          <Text style={styles.description}>Khoản</Text>
          <Text style={styles.quantity}>Số lượng</Text>
          <Text style={styles.price}>Đơn giá</Text>
          <Text style={styles.price}>Thành tiền</Text>
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
        <Text>Tổng cộng: {formatVND(data.total)} ₫</Text>
        <Text style={styles.words}>{numberToVietnameseWords(data.total)}</Text>
        {data.note ? <Text style={{ marginTop: 8, fontSize: 9, textAlign: 'left' }}>Ghi chú: {data.note}</Text> : null}
      </View>
    ),
    payment: data.bank && (
      <View style={styles.payment}>
        {qr && <PdfImage style={styles.qr} src={qr} />}
        <View style={styles.paymentDetails}>
          <Text>
            {sample
              ? 'Mã QR minh họa'
              : data.total < 0
                ? `Số tiền hoàn cho khách: ${formatVND(-data.total)} ₫`
                : data.total - data.paid <= 0
                  ? 'Đã thanh toán'
                  : 'Quét mã để chuyển khoản'}
          </Text>
          <Text>Ngân hàng: {data.bank.bankName}</Text>
          <Text>Số tài khoản: {data.bank.accountNumber}</Text>
          <Text>Chủ tài khoản: {data.bank.accountName}</Text>
          <Text>Nội dung: {data.code}</Text>
          {data.dueDate && <Text>Hạn thanh toán: {date(data.dueDate)}</Text>}
        </View>
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
