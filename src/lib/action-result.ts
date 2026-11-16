import { ForbiddenError, NotFoundError } from './access'

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Lỗi nghiệp vụ có thông báo tiếng Việt hiển thị cho người dùng. */
export class UserError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'UserError'
  }
}

/** Chạy một thao tác và đổi lỗi đã biết thành ActionResult (lỗi lạ vẫn ném tiếp). */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof NotFoundError) return { ok: false, error: 'Không tìm thấy' }
    if (e instanceof ForbiddenError) return { ok: false, error: e.message }
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors }
    throw e
  }
}
