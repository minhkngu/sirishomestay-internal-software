import type { SignStatus } from './statuses'

/** Nhãn đủ ba trạng thái ký (nháp, đã xuất, đã ký), dùng ở danh sách hợp đồng. */
export const SIGN_STATUS_LABELS: Record<SignStatus, string> = {
  draft: 'Nháp',
  exported: 'Đã xuất',
  signed: 'Đã ký',
}

/** Hiển thị trạng thái ký gọn: DB giữ draft/exported/signed, chỗ này chỉ phân biệt đã ký hay chưa. */
export function signStatusLabel(status: string): 'Chưa ký' | 'Đã ký' {
  return status === 'signed' ? 'Đã ký' : 'Chưa ký'
}
