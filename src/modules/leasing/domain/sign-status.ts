import type { SignStatus } from '@/domain/statuses'

/** Thứ hạng trạng thái ký: chỉ được tiến, không lùi (draft → exported → signed). */
export const SIGN_RANK: Record<SignStatus, number> = { draft: 0, exported: 1, signed: 2 }

/** Nhãn đủ ba trạng thái ký, dùng ở danh sách hợp đồng và phụ lục. Khác `signStatusLabel` bên dưới (gộp "Đã xuất" vào "Chưa ký"). */
export const SIGN_STATUS_LABELS: Record<SignStatus, string> = {
  draft: 'Nháp',
  exported: 'Đã xuất',
  signed: 'Đã ký',
}

/** Hiển thị trạng thái ký: DB giữ draft/exported/signed, giao diện chỉ phân biệt đã ký hay chưa. */
export function signStatusLabel(status: string): 'Chưa ký' | 'Đã ký' {
  return status === 'signed' ? 'Đã ký' : 'Chưa ký'
}
