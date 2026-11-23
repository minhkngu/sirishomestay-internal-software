import { RouteModal } from '@/components/route-modal'
import { NewInvoice, type NewInvoiceParams } from '../../../invoices/new/new-invoice'

/** Popup tạo hoá đơn lẻ: bảng chọn giữ nguyên, bản xem trước hiện ngay bên dưới. Chưa tạo gì cho tới khi bấm Lưu thay đổi. */
export default async function InterceptedNewInvoice({ searchParams }: { searchParams: Promise<NewInvoiceParams> }) {
  return (
    <RouteModal
      title="Tạo hoá đơn lẻ"
      description="Chọn toà, phòng có khách, rồi chọn tháng; hoá đơn hiện ra bên dưới. Bấm Lưu thay đổi để tạo."
      size="xl"
    >
      <NewInvoice sp={await searchParams} />
    </RouteModal>
  )
}
