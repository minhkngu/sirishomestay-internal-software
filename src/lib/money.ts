/** 1500000 → "1.500.000" */
export function formatVND(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
