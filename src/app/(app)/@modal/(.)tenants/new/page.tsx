import { RouteModal } from '@/components/route-modal'
import { NewTenant } from '../../../tenants/new-tenant'

export default function InterceptedNewTenant() {
  return <RouteModal title="Thêm khách thuê" size="lg"><NewTenant showHeading={false} /></RouteModal>
}
