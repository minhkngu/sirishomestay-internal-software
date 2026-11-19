/** PRNG có hạt giống cố định (mulberry32) để dữ liệu giả giống hệt nhau mỗi lần nạp. */
export function createRng(seed = 20261116) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join('')
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    /** uuid v4 hợp lệ nhưng xác định theo hạt giống */
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(next() * 4)]}${hex(3)}-${hex(12)}`,
  }
}
export type Rng = ReturnType<typeof createRng>
