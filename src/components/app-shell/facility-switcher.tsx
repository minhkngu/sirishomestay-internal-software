'use client'

export type FacilityOption = { id: string; name: string }

export function FacilitySwitcher({ options, value, onChange }: { options: FacilityOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <select aria-label="Chọn cơ sở" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 max-w-44 rounded-lg border bg-background px-2 text-sm">
      <option value="">Tất cả cơ sở</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}
