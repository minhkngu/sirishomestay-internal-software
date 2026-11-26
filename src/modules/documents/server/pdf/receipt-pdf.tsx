import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatVND, numberToVietnameseWords } from '@/domain/money'
import type { ReceiptPdfData } from './types'
import './fonts'
const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'BeVietnamPro', color: '#161A18', fontSize: 9 },
  brand: { color: '#0F7652', fontWeight: 700, fontSize: 10.5 },
  title: { fontWeight: 700, fontSize: 15, marginVertical: 12 },
  body: { borderTopWidth: 1.2, borderColor: '#0F7652', paddingTop: 12, lineHeight: 1.7 },
})
export function ReceiptDocument({ data }: { data: ReceiptPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>SIRIS · {data.facility.name}</Text>
        <Text>{data.facility.address}</Text>
        <Text style={styles.title}>Phiếu thu</Text>
        <View style={styles.body}>
          <Text>Mã phiếu: {data.code}</Text>
          <Text>Hoá đơn: {data.invoiceCode}</Text>
          <Text>Ngày thu: {data.paidOn.split('-').reverse().join('/')}</Text>
          <Text>
            Khách thuê: {data.tenant.name} · Phòng {data.room}
          </Text>
          <Text>Số tiền: {formatVND(data.amount)} ₫</Text>
          <Text>{numberToVietnameseWords(data.amount)}</Text>
          <Text>Hình thức: {data.method}</Text>
          <Text>Người thu: {data.receivedBy}</Text>
        </View>
      </Page>
    </Document>
  )
}
