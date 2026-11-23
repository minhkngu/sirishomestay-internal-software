'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string }

const MONTH_OPTIONS: Option[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: `Tháng ${i + 1}` })),
]

function FilterField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(String(next ?? ''))} items={options} disabled={disabled}>
      <SelectTrigger aria-label={label} className="h-9 w-full justify-between bg-card text-[13px] font-normal">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || '__all__'} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RoomFilter({ value, rooms, onChange }: { value: string; rooms: Option[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = rooms.find((room) => room.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Phòng"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card pl-3 pr-2.5 text-[13px] font-normal whitespace-nowrap text-foreground shadow-2xs outline-none transition-all hover:border-input/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        }
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.label ?? 'Tất cả phòng'}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput autoFocus placeholder="Tìm phòng…" />
          <CommandList>
            <CommandEmpty>Không tìm thấy phòng.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Tất cả phòng"
                onSelect={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Tất cả phòng
                {!value && <Check className="ml-auto size-4 text-primary" />}
              </CommandItem>
              {rooms.map((room) => (
                <CommandItem
                  key={room.value}
                  value={room.label}
                  onSelect={() => {
                    onChange(room.value)
                    setOpen(false)
                  }}
                >
                  {room.label}
                  {room.value === value && <Check className="ml-auto size-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Bộ lọc Toà → Phòng → Đồng hồ (và kỳ ghi) của trang Chỉ số; mỗi lựa chọn ghi vào URL để giữ khi đổi tab. */
export function MeterFilters({
  facilities,
  facilityId,
  rooms,
  roomId,
  meters,
  meter,
  periodOptions,
  period,
  showPeriod,
  range,
  yearOptions,
  year,
  month,
}: {
  facilities: Option[]
  facilityId: string
  rooms: Option[]
  roomId: string
  meters: Option[]
  meter: string
  periodOptions: Option[]
  period: string
  showPeriod: boolean
  /** Chế độ lịch sử: lọc từ tháng – đến tháng thay cho ô Kỳ ghi. */
  range?: { from: string; to: string }
  /** Lọc Năm → Tháng (thay ô Kỳ ghi): '' là 15 lần chốt mới nhất, 'all' là tất cả. */
  yearOptions?: Option[]
  year?: string
  month?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, start] = useTransition()

  function update(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    start(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  const active = Boolean(roomId || meter || year || month)

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2.5 transition-opacity sm:flex sm:flex-wrap sm:items-end',
        pending && 'opacity-70',
      )}
      aria-busy={pending}
    >
      <FilterField label="Toà" className="sm:w-44">
        <FilterSelect
          label="Toà"
          value={facilityId}
          options={facilities}
          onChange={(value) => update({ facility: value, room: null, meter: null })}
        />
      </FilterField>
      <FilterField label="Phòng" className="sm:w-36">
        <RoomFilter value={roomId} rooms={rooms} onChange={(value) => update({ room: value || null, meter: null })} />
      </FilterField>
      <FilterField label="Đồng hồ" className="sm:w-40">
        <FilterSelect
          label="Đồng hồ"
          value={meter}
          options={meters}
          onChange={(value) => update({ meter: value || null })}
        />
      </FilterField>
      {range && (
        <>
          <FilterField label="Từ tháng" className="sm:w-40">
            <input
              type="month"
              aria-label="Từ tháng"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && update({ from: e.target.value })}
              className="h-9 w-full rounded-xl border border-input bg-card px-3 text-[13px]"
            />
          </FilterField>
          <FilterField label="Đến tháng" className="sm:w-40">
            <input
              type="month"
              aria-label="Đến tháng"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && update({ to: e.target.value })}
              className="h-9 w-full rounded-xl border border-input bg-card px-3 text-[13px]"
            />
          </FilterField>
        </>
      )}
      {yearOptions && (
        <>
          <FilterField label="Năm" className="sm:w-40">
            <FilterSelect
              label="Năm"
              value={year ?? ''}
              options={yearOptions}
              placeholder="Năm"
              onChange={(value) => update({ year: value || null, month: null })}
            />
          </FilterField>
          <FilterField label="Tháng" className="sm:w-36">
            <FilterSelect
              label="Tháng"
              value={month ?? ''}
              options={MONTH_OPTIONS}
              placeholder="Tháng"
              disabled={!/^\d{4}$/.test(year ?? '')}
              onChange={(value) => update({ month: value || null })}
            />
          </FilterField>
        </>
      )}
      {showPeriod && !range && (
        <FilterField label="Kỳ ghi" className="sm:w-40">
          <FilterSelect
            label="Kỳ ghi"
            value={period}
            options={periodOptions}
            onChange={(value) => update({ period: value })}
          />
        </FilterField>
      )}
      {active && (
        <button
          type="button"
          className="pb-2 text-xs font-medium text-primary hover:underline hover:underline-offset-2"
          onClick={() => update({ room: null, meter: null, year: null, month: null })}
        >
          Xoá lọc
        </button>
      )}
    </div>
  )
}
