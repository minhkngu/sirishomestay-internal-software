import { RouteModal } from '@/components/route-modal'
import { NewUser } from '../../../users/new-user'

export default function InterceptedNewUser() {
  return (
    <RouteModal title="Thêm người dùng" size="md">
      <NewUser showHeading={false} />
    </RouteModal>
  )
}
