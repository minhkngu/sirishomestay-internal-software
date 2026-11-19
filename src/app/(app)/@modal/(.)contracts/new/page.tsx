import { RouteModal } from '@/components/route-modal'
import { NewContract, type NewContractSP } from '../../../contracts/new-contract'

// Bấm "Tạo hợp đồng" từ bất kỳ trang nào thì mở popup; mở thẳng /contracts/new hoặc tải lại vẫn ra trang đầy đủ.
export default async function InterceptedNewContract({ searchParams }: { searchParams: Promise<NewContractSP> }) {
  const sp = await searchParams
  return (
    <RouteModal title={sp.kind === 'deposit' ? 'Tạo hợp đồng cọc' : 'Tạo hợp đồng thuê'} size="lg">
      <NewContract sp={sp} showHeading={false} />
    </RouteModal>
  )
}
