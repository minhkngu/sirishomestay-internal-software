export function resolveFeePrice(
  defaultPrice: number,
  facilityPrices: Record<string, number> | undefined,
  facilityId: string | null,
): number {
  return facilityId === null ? defaultPrice : (facilityPrices?.[facilityId] ?? defaultPrice)
}
