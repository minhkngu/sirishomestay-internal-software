import type { SignStatus } from '@/domain/statuses'

/** Thứ hạng trạng thái ký: chỉ được tiến, không lùi (draft → exported → signed). Nhãn ở `src/domain/sign-labels.ts`. */
export const SIGN_RANK: Record<SignStatus, number> = { draft: 0, exported: 1, signed: 2 }
