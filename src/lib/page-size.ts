export const PAGE_SIZES = [15, 30, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 15

const key = (tableKey: string) => `siris:page-size:${tableKey}`

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Đọc số dòng đã nhớ của một bảng; giá trị lạ hoặc storage lỗi thì dùng mặc định. */
export function readPageSize(tableKey: string, storage?: Pick<Storage, 'getItem'> | null): number {
  try {
    const s = storage === undefined ? defaultStorage() : storage
    if (!s) return DEFAULT_PAGE_SIZE
    const n = Number(s.getItem(key(tableKey)))
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

export function writePageSize(tableKey: string, size: number, storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const s = storage === undefined ? defaultStorage() : storage
    s?.setItem(key(tableKey), String(size))
  } catch {
    // localStorage bị chặn: bỏ qua, lần sau dùng mặc định
  }
}
