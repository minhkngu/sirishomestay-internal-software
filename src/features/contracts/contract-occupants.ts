/** Người ký luôn được tính một lần; danh sách bổ sung là lựa chọn chủ động. */
export function replaceSigner(signerId: string, additionalIds: string[]): string[] {
  return [...new Set([signerId, ...additionalIds].filter(Boolean))]
}
