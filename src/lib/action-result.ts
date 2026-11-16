import { ForbiddenError, NotFoundError } from '@/domain/access'

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

const UNIQUE_MESSAGES: Record<string, { message: string; field?: string }> = {
  tenants_phone_unique: { message: 'Số điện thoại đã thuộc về khách khác', field: 'phone' },
  tenants_passport_unique: { message: 'Số passport đã tồn tại', field: 'passportNumber' },
  tenants_id_number_unique: { message: 'Số CCCD đã tồn tại', field: 'idNumber' },
  tenants_tax_code_unique: { message: 'Mã số thuế đã tồn tại', field: 'taxCode' },
  rooms_facility_code_unique: { message: 'Mã phòng đã tồn tại trong cơ sở này', field: 'code' },
  facilities_code_unique: { message: 'Mã cơ sở đã tồn tại', field: 'code' },
}

/** Lỗi 23505 (trùng khoá duy nhất) do hai người lưu cùng lúc: đổi thành thông báo tiếng Việt. */
function uniqueViolation(e: unknown): { message: string; field?: string } | null {
  for (let cur = e as { code?: string; constraint?: string; message?: string; cause?: unknown } | undefined, i = 0; cur && i < 4; cur = cur.cause as typeof cur, i++) {
    if (cur.code === '23505') {
      const name = cur.constraint ?? /"([a-z_]+)"/.exec(cur.message ?? '')?.[1] ?? ''
      return UNIQUE_MESSAGES[name] ?? { message: 'Dữ liệu bị trùng với bản ghi đã có' }
    }
  }
  return null
}

/** Chạy một thao tác và đổi lỗi đã biết thành ActionResult (lỗi lạ vẫn ném tiếp). */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof NotFoundError) return { ok: false, error: 'Không tìm thấy' }
    if (e instanceof ForbiddenError) return { ok: false, error: e.message }
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors }
    const dup = uniqueViolation(e)
    if (dup) return { ok: false, error: dup.message, fieldErrors: dup.field ? { [dup.field]: dup.message } : undefined }
    throw e
  }
}
