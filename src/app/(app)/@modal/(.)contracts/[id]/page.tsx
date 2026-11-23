import { RouteModal } from '@/components/route-modal'
import ContractDetail from '../../../contracts/contract-detail'

export default async function InterceptedContract({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const normalizedId = id.replace(/^(?:\(\.\))+/, '')
  return (
    <RouteModal title="Chi tiết hợp đồng" description="Thông tin và tài liệu liên quan đến hợp đồng." size="xl">
      <ContractDetail id={normalizedId} />
    </RouteModal>
  )
}
