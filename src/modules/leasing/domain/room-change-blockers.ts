/** Hoá đơn của hợp đồng cũ cản việc chuyển phòng: còn nháp, hoặc đã duyệt mà chưa thu đủ (period dạng MM/YYYY). */
export type RoomChangeBlockers = {
  drafts: { code: string; period: string }[]
  unpaid: { code: string; period: string; owed: number }[]
}

/** Thông báo cho người dùng; null khi không có gì cản. Hoá đơn nháp nói trước, rồi tới nợ. */
export function roomChangeBlockerMessage(b: RoomChangeBlockers): string | null {
  const periods = (list: { period: string }[]) => [...new Set(list.map((x) => x.period))].join(', ')
  if (b.drafts.length) return `Hoá đơn tháng ${periods(b.drafts)} còn nháp: duyệt và thu, hoặc xoá, rồi chuyển phòng`
  if (b.unpaid.length) {
    const total = b.unpaid.reduce((n, x) => n + x.owed, 0)
    return `Còn nợ ${total.toLocaleString('vi-VN')} ở hoá đơn tháng ${periods(b.unpaid)}: thu xong rồi chuyển phòng`
  }
  return null
}
