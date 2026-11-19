// Tầng 2 import tầng 3 → "tầng không thấp hơn".
import { assetsApi } from '@/modules/assets'
// import type không bị tính (nếu tính sẽ vi phạm cả tầng lẫn cổng).
import type { AssetKind } from '@/modules/assets/server/register'

export const userService: AssetKind = String(assetsApi)
