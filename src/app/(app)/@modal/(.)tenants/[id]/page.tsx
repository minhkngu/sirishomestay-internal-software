import { RouteModal } from '@/components/route-modal'
import TenantDetail from '../../../tenants/tenant-detail'

export default async function InterceptedTenant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const normalizedId = id.replace(/^(?:\(\.\))+/, '')
  return (
    <RouteModal
      title="Thông tin khách thuê"
      description="Chi tiết hồ sơ, hợp đồng và giấy tờ của khách thuê."
      size="xl"
    >
      <TenantDetail id={normalizedId} embedded />
    </RouteModal>
  )
}
