export function parseFacilityFilter(value: string | string[] | undefined): string[] {
  const values = (Array.isArray(value) ? value : [value ?? '']).flatMap((v) => v.split(','))
  return [
    ...new Set(
      values
        .map((v) => v.trim().toLowerCase())
        .filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)),
    ),
  ]
}
