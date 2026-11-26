'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PopupLink } from '@/components/popup-link'
import { StatusDot } from '@/components/list/status-dot'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverTip } from '@/components/ui/tooltip'
import { diffDays, formatDateVN, todayVN } from '@/domain/dates'
import { formatPhoneDisplay } from '@/domain/phone'
import { TENANT_KIND_SHORT_LABELS } from '@/domain/tenant-kind'
import { cn } from '@/lib/utils'
import { displayName } from '../domain/tenant-name'
import { deleteTenantsAction } from '../server/tenants/actions'
import type { Tenant } from '../server/tenants/service'
import { TenantForm } from './tenant-form'

export function TenantTable({
  tenants,
  facilityNames = {},
  visaWarningDays = 30,
  roomsByTenant = {},
  depositsByTenant = {},
}: {
  tenants: Tenant[]
  facilityNames?: Record<string, string>
  visaWarningDays?: number
  roomsByTenant?: Record<string, TenantRoom[]>
  depositsByTenant?: Record<string, TenantRoom[]>
}) {
  const router = useRouter()
  const today = todayVN()
  const [checked, setChecked] = useState<string[]>([])
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [askTarget, setAskTarget] = useState<{ ids: string[]; label: string } | null>(null)
  const [pending, start] = useTransition()
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const pageIds = useMemo(() => tenants.map((t) => t.id), [tenants])
  const selectedIds = useMemo(() => {
    const idSet = new Set(pageIds)
    return checked.filter((id) => idSet.has(id))
  }, [checked, pageIds])
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id))
  const someSelected = selectedIds.length > 0 && !allSelected

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected
  }, [someSelected])

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const toggleAll = () => setChecked(allSelected ? [] : pageIds)

  const confirmDelete = (ids: string[]) =>
    start(async () => {
      const r = await deleteTenantsAction(ids)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      const count = r.data.count
      toast.success(count > 1 ? `Đã xoá ${count} khách` : 'Đã xoá khách')
      setChecked((prev) => prev.filter((id) => !ids.includes(id)))
      router.refresh()
    })

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/70 text-left">
            <tr>
              <th className="w-10 p-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  aria-label="Chọn tất cả khách"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-4 accent-primary"
                />
              </th>
              <th className="px-3 py-2.5 text-left text-[13px] font-medium text-muted-foreground whitespace-nowrap">
                Thao tác
              </th>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground">Tên</th>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Loại</th>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">
                Điện thoại
              </th>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Giấy tờ</th>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">
                Phòng / Toà
              </th>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Visa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {tenants.map((t) => {
              const name = displayName(t)
              const isChecked = selectedIds.includes(t.id)
              return (
                <tr key={t.id} className={cn('transition-colors hover:bg-muted/30', isChecked && 'bg-primary/5')}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Chọn khách ${name}`}
                      checked={isChecked}
                      onChange={() => toggle(t.id)}
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="p-3 text-left whitespace-nowrap">
                    <div className="inline-flex items-center justify-start gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={pending}
                        aria-label={`Chỉnh nhanh khách ${name}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditing(t)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={pending}
                        aria-label={`Xoá khách ${name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setAskTarget({ ids: [t.id], label: `khách ${name}` })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <PopupLink
                      className="font-semibold text-primary hover:underline underline-offset-2"
                      href={`/tenants/${t.id}`}
                    >
                      {name}
                    </PopupLink>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="inline-flex rounded-full border border-border/80 bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap shrink-0">
                      {TENANT_KIND_SHORT_LABELS[t.kind]}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-foreground whitespace-nowrap">{formatPhoneDisplay(t.phone)}</td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {t.passportNumber ?? t.idNumber ?? t.taxCode ?? '—'}
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    <RoomsCell
                      rooms={roomsByTenant[t.id]}
                      deposits={depositsByTenant[t.id]}
                      facilityNames={facilityNames}
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {t.visaExpiry ? (
                      <VisaBadge expiry={t.visaExpiry} days={diffDays(today, t.visaExpiry)} warn={visaWarningDays} />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                  Không có khách nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs shadow-lg">
          <span className="font-medium text-foreground whitespace-nowrap">Đã chọn {selectedIds.length} khách</span>
          <Button variant="ghost" size="xs" disabled={pending} onClick={() => setChecked([])}>
            Bỏ chọn
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="destructive"
            size="xs"
            disabled={pending}
            onClick={() => setAskTarget({ ids: selectedIds, label: `${selectedIds.length} khách đã chọn` })}
          >
            Xoá
          </Button>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa thông tin khách</DialogTitle>
          </DialogHeader>
          {editing && <TenantForm key={editing.id} bare tenant={editing as never} onSaved={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={askTarget !== null}
        onOpenChange={(o) => !o && setAskTarget(null)}
        title={`Xoá ${askTarget?.label ?? ''}?`}
        destructive
        description="Hồ sơ và giấy tờ của khách sẽ bị xoá vĩnh viễn. Chỉ xoá được các khách chưa gắn với hợp đồng, cọc hoặc phụ lục."
        confirmLabel="Xoá"
        onConfirm={() => {
          if (askTarget) confirmDelete(askTarget.ids)
        }}
      />
    </>
  )
}

export type TenantRoom = { code: string; facilityId: string }

/** Một phòng đại diện kèm toà; có nhiều hợp đồng thì thêm "+N", rê chuột để xem đủ phòng và toà. Nếu chưa ở thì hiện cọc chờ hoặc "Chưa ở". */
function RoomsCell({
  rooms,
  deposits,
  facilityNames,
}: {
  rooms?: TenantRoom[]
  deposits?: TenantRoom[]
  facilityNames: Record<string, string>
}) {
  if (!rooms?.length) {
    if (deposits?.length) {
      const [dep] = deposits
      return (
        <span className="inline-flex items-center gap-1">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
            Cọc {dep.code}
          </span>
          {facilityNames[dep.facilityId] && (
            <span className="text-muted-foreground">· {facilityNames[dep.facilityId]}</span>
          )}
        </span>
      )
    }
    return <span className="text-muted-foreground">Chưa ở</span>
  }
  const [first] = rooms
  const label = (r: TenantRoom) => (
    <>
      <span className="font-semibold text-foreground">{r.code}</span>
      {facilityNames[r.facilityId] && <span className="text-muted-foreground"> · {facilityNames[r.facilityId]}</span>}
    </>
  )
  if (rooms.length === 1) return <span>{label(first)}</span>
  return (
    <HoverTip
      content={
        <div>
          <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">Đang thuê {rooms.length} phòng</div>
          <ul>
            {rooms.map((r) => (
              <li
                key={`${r.facilityId}-${r.code}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
              >
                <span className="inline-flex min-w-10 justify-center rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                  {r.code}
                </span>
                <span className="text-foreground">{facilityNames[r.facilityId] ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <span tabIndex={0} className="inline-flex cursor-default items-center gap-1.5">
        <span>{label(first)}</span>
        <span className="rounded-full border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
          +{rooms.length - 1}
        </span>
      </span>
    </HoverTip>
  )
}

function VisaBadge({ expiry, days, warn }: { expiry: string; days: number; warn: number }) {
  const cls =
    days <= 7
      ? 'text-rose-600 font-semibold'
      : days <= warn
        ? 'text-amber-600 font-medium'
        : 'text-foreground font-medium'
  return (
    <StatusDot tone={days <= 7 ? 'danger' : days <= warn ? 'warn' : 'ok'}>
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className={cls}>
          {days < 0 ? `Đã hết hạn ${-days} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">({formatDateVN(expiry)})</span>
      </span>
    </StatusDot>
  )
}
