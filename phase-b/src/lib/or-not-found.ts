import { notFound } from 'next/navigation'
import { NotFoundError } from './access'

/** Dùng trong trang: lỗi NotFoundError (ngoài phạm vi / không tồn tại) → trang 404. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    throw e
  }
}
