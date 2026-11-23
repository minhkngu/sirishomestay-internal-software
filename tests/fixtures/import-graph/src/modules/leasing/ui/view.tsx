// ui chỉ được import type từ index.ts của module khác.
import type { User } from '@/modules/users'
import { usersApi } from '@/modules/users'

export function View(props: { user: User }) {
  return <p>{props.user.id + usersApi}</p>
}
