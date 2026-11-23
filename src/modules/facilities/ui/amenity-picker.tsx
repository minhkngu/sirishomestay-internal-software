'use client'

export type AmenityOption = { id: string; name: string }

/** Nhóm ô chọn tiện ích của phòng; không có tiện ích nào thì nhắc thêm ở Cài đặt. */
export function AmenityPicker({
  options,
  value,
  onChange,
  idPrefix,
}: {
  options: AmenityOption[]
  value: string[]
  onChange: (ids: string[]) => void
  idPrefix: string
}) {
  if (options.length === 0)
    return <p className="text-xs text-muted-foreground">Chưa có tiện ích. Thêm ở Cài đặt → Tiện ích.</p>
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Tiện ích</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.id} htmlFor={`${idPrefix}-${o.id}`} className="flex items-center gap-1.5 text-sm">
            <input
              id={`${idPrefix}-${o.id}`}
              type="checkbox"
              checked={value.includes(o.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
            />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
