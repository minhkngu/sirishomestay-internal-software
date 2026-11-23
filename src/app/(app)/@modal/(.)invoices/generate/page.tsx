import { RouteModal } from '@/components/route-modal'
import { GenerateInvoices } from '../../../invoices/generate/generate-invoices'

export default function InterceptedGenerateInvoices() {
  return <RouteModal title="Tạo hoá đơn hàng loạt" description="Chọn toà và tháng, xem trước rồi tạo hoá đơn nháp cho mọi hợp đồng." size="md"><GenerateInvoices showHeading={false} /></RouteModal>
}
