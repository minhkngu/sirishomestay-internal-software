import type { IncidentStatus } from './statuses'

export type IncidentPriority = 'high' | 'normal' | 'low'

/** Nhãn trạng thái sự cố (cơ sở, bảng sự cố, trang chi tiết, nhắc việc). */
export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  new: 'Mới',
  in_progress: 'Đang xử lý',
  done: 'Xong',
  cancelled: 'Đã huỷ',
}

/** Nhãn mức ưu tiên sự cố. Ô chọn mức độ trong form tạo sự cố cố ý ghi "Cao" cho `high`, không dùng map này. */
export const INCIDENT_PRIORITY_LABELS: Record<IncidentPriority, string> = {
  high: 'Ưu tiên cao',
  normal: 'Bình thường',
  low: 'Thấp',
}
