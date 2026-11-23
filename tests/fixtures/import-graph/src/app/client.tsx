'use client'

// Component client không import giá trị từ cổng server (index.ts); ui.ts và actions.ts thì được.
import { usersApi } from '@/modules/users'
import type { User } from '@/modules/users'

export function Client(props: { user: User }) {
  return <p>{props.user.id + usersApi}</p>
}
