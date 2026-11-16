export class NotFoundError extends Error {
  constructor(message = 'Không tìm thấy') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Bạn không có quyền thực hiện thao tác này') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/** Lỗi nghiệp vụ / dữ liệu nhập sai, có thông báo tiếng Việt và (tuỳ chọn) lỗi theo từng ô. */
export class ValidationError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'ValidationError'
  }
}
