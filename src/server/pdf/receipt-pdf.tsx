import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatVND, numberToVietnameseWords } from '@/domain/money'
import type { ReceiptPdfData } from './types'
import './fonts'
const styles = StyleSheet.create({ page: { padding: 40, fontFamily: 'BeVietnamPro', color: '#1C2B27', fontSize: 10 }, brand: { color: '#0E9F6E', fontWeight: 700, fontSize: 12 }, title: { fontWeight: 700, fontSize: 20, marginVertical: 18 }, body: { borderTopWidth: 2, borderColor: '#0E9F6E', paddingTop: 15, lineHeight: 2 } })
export function ReceiptDocument({ data }: { data: ReceiptPdfData }) {
  return <Document><Page size="A4" style={styles.page}><Text style={styles.brand}>SIRIS · {data.facility.name}</Text><Text>{data.facility.address}</Text><Text style={styles.title}>Phiếu thu</Text><View style={styles.body}>
    <Text>Mã phiếu: {data.code}</Text><Text>Hoá đơn: {data.invoiceCode}</Text><Text>Ngày thu: {data.paidOn.split('-').reverse().join('/')}</Text><Text>Khách thuê: {data.tenant.name} · Phòng {data.room}</Text><Text>Số tiền: {formatVND(data.amount)} ₫</Text><Text>{numberToVietnameseWords(data.amount)}</Text><Text>Hình thức: {data.method}</Text><Text>Người thu: {data.receivedBy}</Text>
  </View></Page></Document>
}
