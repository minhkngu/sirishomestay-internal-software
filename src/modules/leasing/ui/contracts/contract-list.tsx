'use client'

import { useMemo } from 'react'
import { PopupLink } from '@/components/popup-link'
import { FacilityFilter } from '@/components/list/facility-filter'
import { Pager } from '@/components/list/pager'
import { ParamChips } from '@/components/list/param-chips'
import { useFacilitySelection, useListParam, usePager } from '@/components/list/use-list-params'
import { formatDateVN } from '@/domain/dates'
import { matchesContractView, type ContractView } from '@/domain/list-filters'
import { formatVND } from '@/domain/money'
import type { DepositListItem, LeaseListItem } from '../../server/contracts/service'
import type { ReactNode } from 'react'

const VIEWS = [
  ['active', 'Đang hiệu lực'],
  ['expiring', 'Sắp hết hạn'],
  ['unsigned', 'Chưa ký'],
  ['ended', 'Đã kết thúc'],
  ['deposits', 'Cọc chờ'],
] as const
const SIGN = { draft: 'Nháp', exported: 'Đã xuất', signed: 'Đã ký' } as const

export function ContractList({
  leases,
  deposits,
  facilities,
  today,
  warningDays,
  deleteFacilityIds,
  renderActions,
}: {
  leases: LeaseListItem[]
  deposits: DepositListItem[]
  facilities: { id: string; name: string }[]
  today: string
  warningDays: number
  deleteFacilityIds: string[]
  /** Cột thao tác của từng dòng; do tầng route cấp để dùng chung một popup sửa với trang chi tiết. */
  renderActions: (row: { id: string; kind: 'lease' | 'deposit'; active: boolean; canDelete: boolean }) => ReactNode
}) {
  const rawView = useListParam('view') ?? 'active'
  const view = VIEWS.some(([k]) => k === rawView) ? rawView : 'active'
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const names = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])

  const rows = useMemo(() => {
    const inScope = (facilityId: string) => selected.length === 0 || selected.includes(facilityId)
    if (view === 'deposits') {
      return { leases: [] as LeaseListItem[], deposits: deposits.filter((d) => inScope(d.facilityId)) }
    }
    return {
      leases: leases.filter(
        (l) => inScope(l.facilityId) && matchesContractView(view as ContractView, l, today, warningDays),
      ),
      deposits: [] as DepositListItem[],
    }
  }, [leases, deposits, view, selected, today, warningDays])

  const all = useMemo(
    () => [
      ...rows.leases.map((l) => ({ kind: 'lease' as const, l })),
      ...rows.deposits.map((c) => ({ kind: 'deposit' as const, c })),
    ],
    [rows],
  )
  const { pageRows, pager } = usePager(all, 'contracts', `${view}|${selected.join(',')}`)
  const shown = {
    leases: pageRows.flatMap((r) => (r.kind === 'lease' ? [r.l] : [])),
    deposits: pageRows.flatMap((r) => (r.kind === 'deposit' ? [r.c] : [])),
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ParamChips param="view" defaultValue="active" items={VIEWS.map(([value, label]) => ({ value, label }))} />
        <FacilityFilter facilities={facilities} align="right" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs">
        <table className="w-full min-w-max text-xs">
          <thead className="border-b border-border/60 bg-muted/40 text-left">
            <tr>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Mã</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Thao tác</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Phòng</th>
              {facilities.length > 1 && (
                <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Toà</th>
              )}
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Bên thuê</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Thời hạn</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Giá thuê</th>
              <th className="p-3 font-semibold uppercase tracking-wider text-muted-foreground">Ký</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {shown.leases.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-muted/30">
                <td className="p-3">
                  <PopupLink
                    className="font-semibold text-primary hover:underline underline-offset-2"
                    href={`/contracts/${l.id}`}
                  >
                    {l.code}
                  </PopupLink>
                </td>
                <td className="p-3">
                  {renderActions({
                    id: l.id,
                    kind: 'lease',
                    active: l.status === 'active',
                    canDelete: deleteFacilityIds.includes(l.facilityId),
                  })}
                </td>
                <td className="p-3 font-medium text-foreground">{l.roomCode}</td>
                {facilities.length > 1 && <td className="p-3 text-muted-foreground">{names[l.facilityId]}</td>}
                <td className="p-3 font-medium text-foreground">{l.tenantName}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {formatDateVN(l.startDate)} – {formatDateVN(l.endDate)}
                </td>
                <td className="p-3 font-medium text-foreground tabular-nums">{formatVND(l.monthlyRent)}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      l.signStatus === 'signed'
                        ? 'border border-emerald-200/60 bg-emerald-50 text-emerald-700'
                        : l.signStatus === 'exported'
                          ? 'border border-amber-200/60 bg-amber-50 text-amber-700'
                          : 'border border-border/80 bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {SIGN[l.signStatus as keyof typeof SIGN]}
                  </span>
                </td>
              </tr>
            ))}
            {shown.deposits.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-muted/30">
                <td className="p-3">
                  <PopupLink
                    className="font-semibold text-primary hover:underline underline-offset-2"
                    href={`/contracts/${c.id}`}
                  >
                    Cọc {c.roomCode}
                  </PopupLink>
                </td>
                <td className="p-3">
                  {renderActions({
                    id: c.id,
                    kind: 'deposit',
                    active: false,
                    canDelete: deleteFacilityIds.includes(c.facilityId),
                  })}
                </td>
                <td className="p-3 font-medium text-foreground">{c.roomCode}</td>
                {facilities.length > 1 && <td className="p-3 text-muted-foreground">{names[c.facilityId]}</td>}
                <td className="p-3 font-medium text-foreground">{c.tenantName}</td>
                <td className="p-3 text-muted-foreground">Vào ở dự kiến {formatDateVN(c.expectedMoveIn)}</td>
                <td className="p-3 font-medium text-foreground tabular-nums">{formatVND(c.agreedRent)}</td>
                <td className="p-3">
                  <span className="inline-flex rounded-full border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {SIGN[c.signStatus as keyof typeof SIGN]}
                  </span>
                </td>
              </tr>
            ))}
            {shown.leases.length + shown.deposits.length === 0 && (
              <tr>
                <td colSpan={facilities.length > 1 ? 8 : 7} className="p-8 text-center text-xs text-muted-foreground">
                  Không có hợp đồng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </>
  )
}
