import { RouteModal } from '@/components/route-modal'
import InvoicePage from '../../../invoices/[id]/page'

/** Sửa hoá đơn trong popup khi mở từ danh sách hoặc ngay sau khi lưu hoá đơn mới; F5 hoặc mở thẳng thì ra trang đầy đủ. */
export default async function InterceptedInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const normalizedId = id.replace(/^(?:\(\.\))+/, '')
  return (
    <RouteModal title="Hoá đơn" description="Sửa các dòng, chỉ số, hạn thanh toán rồi bấm Lưu thay đổi." size="xl">
      <InvoicePage params={Promise.resolve({ id: normalizedId })} />
    </RouteModal>
  )
}
