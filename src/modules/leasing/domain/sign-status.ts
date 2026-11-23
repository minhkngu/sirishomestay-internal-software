/** Hiển thị trạng thái ký: DB giữ draft/exported/signed, giao diện chỉ phân biệt đã ký hay chưa. */
export function signStatusLabel(status: string): 'Chưa ký' | 'Đã ký' {
  return status === 'signed' ? 'Đã ký' : 'Chưa ký'
}
