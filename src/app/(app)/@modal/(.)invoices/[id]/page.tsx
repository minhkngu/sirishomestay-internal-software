import { RouteModal } from '@/components/route-modal'
import { discardNewDraftAction } from '@/server/invoices/actions'
import InvoicePage from '../../../invoices/[id]/page'

/** Sửa hoá đơn trong popup khi mở từ danh sách hoặc ngay sau khi tạo; F5 hoặc mở thẳng thì ra trang đầy đủ. Hoá đơn vừa tạo (?new=1) mà đóng popup chưa lưu gì thì bỏ nháp. */
export default async function InterceptedInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params
  const normalizedId = id.replace(/^(?:\(\.\))+/, '')
  const isNew = (await searchParams).new === '1'
  return <RouteModal title="Hoá đơn" description="Sửa các dòng, chỉ số, hạn thanh toán rồi bấm Lưu thay đổi." size="xl" onClose={isNew ? discardNewDraftAction.bind(null, normalizedId) : undefined}><InvoicePage params={Promise.resolve({ id: normalizedId })} /></RouteModal>
}
