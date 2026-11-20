// Server component (không có 'use client'): được import giá trị từ index.ts.
import { usersApi } from '@/modules/users'

export default function Page() {
  return <p>{usersApi}</p>
}
