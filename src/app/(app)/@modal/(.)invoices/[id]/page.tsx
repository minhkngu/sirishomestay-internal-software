import { RouteModal } from '@/components/route-modal'
import InvoicePage from '../../../invoices/[id]/page'

/** Sửa hoá đơn trong popup khi mở từ danh sách hoặc ngay sau khi tạo; F5 hoặc mở thẳng thì ra trang đầy đủ. */
export default function InterceptedInvoice({ params }: { params: Promise<{ id: string }> }) {
  const normalized = params.then(({ id }) => ({ id: id.replace(/^(?:\(\.\))+/, '') }))
  return <RouteModal title="Hoá đơn" description="Sửa các dòng, chỉ số, hạn thanh toán rồi lưu hoặc duyệt." size="xl"><InvoicePage params={normalized} /></RouteModal>
}
