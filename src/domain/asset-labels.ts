import type { AssetStatus } from './statuses'

/**
 * Tình trạng tài sản nhập tay (lưu nguyên chữ trong cột `condition`, nên đổi chữ là đổi dữ liệu):
 * dùng ở form tài sản và biên bản bàn giao.
 */
export const ASSET_CONDITION = { good: 'Tốt', scratched: 'Trầy xước', damaged: 'Hư' } as const
export const ASSET_CONDITIONS = [ASSET_CONDITION.good, ASSET_CONDITION.scratched, ASSET_CONDITION.damaged] as const

/** Trạng thái tài sản trong DB (đang dùng, hỏng, đã thanh lý). */
export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  in_use: 'Đang dùng',
  broken: 'Hỏng',
  disposed: 'Đã thanh lý',
}

/** Các giá trị lọc "Tình trạng" ở danh sách tài sản (tình trạng hoặc trạng thái đang hiển thị). */
export const ASSET_STATE_OPTIONS = [
  ASSET_CONDITION.good,
  ASSET_CONDITION.scratched,
  ASSET_STATUS_LABELS.broken,
  ASSET_STATUS_LABELS.disposed,
] as const
