// Có chú thích đầu file vẫn nhận ra 'use client'.
/* chú thích khối */

'use client'

import type { User } from '@/modules/users'

export function ClientType(props: { user: User }) {
  return <p>{props.user.id}</p>
}
