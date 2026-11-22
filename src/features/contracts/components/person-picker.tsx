'use client'

import { useState, type ReactElement } from 'react'
import { UserPlus } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatPhoneDisplay } from '@/domain/phone'
import type { TenantOption } from './deposit-form'

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

/**
 * Tìm người theo tên hoặc số điện thoại. Dùng cho ô "Thêm người" của hợp đồng và ô "Bên thuê" của hợp đồng cọc.
 */
export function PersonPicker({
  people,
  excludeIds = [],
  includeCompanies = true,
  onPick,
  onCreateNew,
  trigger,
  align = 'start',
}: {
  people: TenantOption[]
  excludeIds?: string[]
  includeCompanies?: boolean
  onPick: (id: string) => void
  /** Nếu có, cuối danh sách hiện nút tạo người mới (mở form khách thuê). */
  onCreateNew?: () => void
  trigger: ReactElement
  align?: 'start' | 'center' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const available = people.filter((person) => !excludeIds.includes(person.id) && (includeCompanies || person.kind !== 'company'))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} className="w-80 p-0">
        <Command
          filter={(value, search) => {
            const query = search.trim().toLowerCase()
            if (!query) return 1
            if (value.toLowerCase().includes(query)) return 1
            const digits = query.replace(/\D/g, '')
            if (digits && value.replace(/\D/g, '').includes(digits)) return 1
            return 0
          }}
        >
          <CommandInput autoFocus placeholder="Tìm theo tên hoặc số điện thoại…" />
          <CommandList>
            <CommandEmpty>Không tìm thấy người phù hợp.</CommandEmpty>
            <CommandGroup>
              {available.map((person) => (
                <CommandItem
                  key={person.id}
                  value={`${person.name} ${person.phone ?? ''}`}
                  data-name={person.name}
                  onSelect={() => { onPick(person.id); setOpen(false) }}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                    {initials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{person.name}</span>
                    <span className="block text-xs text-muted-foreground">{person.phone ? formatPhoneDisplay(person.phone) : 'Chưa có số điện thoại'}</span>
                  </span>
                  {person.kind === 'company' && <span className="shrink-0 rounded-full border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">Công ty</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {onCreateNew && (
            <div className="border-t border-border/60 p-1">
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-primary transition-colors hover:bg-primary/5" onClick={() => { setOpen(false); onCreateNew() }}>
                <UserPlus className="size-4" />
                Tạo người mới
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
