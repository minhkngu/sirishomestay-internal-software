import ContractDetail from '../../contract-detail'
import { ContractDetailModal } from '@/features/contracts/components/contract-detail-modal'

export default async function InterceptedContract({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const normalizedId = id.replace(/^(?:\(\.\))+/, '')
  return <ContractDetailModal><ContractDetail id={normalizedId} /></ContractDetailModal>
}
