import { RouteModal } from '@/components/route-modal'
import { discardNewDraftAction } from '@/server/invoices/actions'
import { NewInvoice, type NewInvoiceParams } from '../../../invoices/new/new-invoice'

/** Popup tạo hoá đơn lẻ: bảng chọn giữ nguyên, hoá đơn nháp hiện ngay bên dưới. Đóng khi chưa lưu gì thì bỏ nháp. */
export default async function InterceptedNewInvoice({ searchParams }: { searchParams: Promise<NewInvoiceParams> }) {
  const sp = await searchParams
  const draft = /^[0-9a-f-]{36}$/.test(sp.draft ?? '') ? sp.draft! : ''
  return <RouteModal title="Tạo hoá đơn lẻ" description="Chọn toà, phòng có khách, rồi chọn tháng; hoá đơn hiện ra bên dưới để sửa và bấm Lưu thay đổi." size="xl" onClose={draft ? discardNewDraftAction.bind(null, draft) : undefined}><NewInvoice sp={sp} /></RouteModal>
}
