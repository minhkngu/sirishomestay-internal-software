// Import nhiều dòng tới file trong của module khác → "không qua cổng công khai".
import {
  userService,
} from '@/modules/users/server/service'

// Qua cổng index bằng đường dẫn tương đối: hợp lệ.
export { usersApi } from '../../users'

export async function load() {
  // Import động vẫn bị tính.
  const m = await import('@/modules/assets/server/register')
  return [userService, m.registered]
}
