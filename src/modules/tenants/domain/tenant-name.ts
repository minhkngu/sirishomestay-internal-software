/** Tên hiển thị của khách: công ty dùng tên công ty, còn lại dùng họ tên. */
export function displayName(t: { kind: string; fullName: string | null; companyName: string | null }): string {
  return (t.kind === 'company' ? t.companyName : t.fullName) ?? ''
}
