'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PopupLink } from '@/components/popup-link'
import { FacilityFilter } from '@/components/list/facility-filter'
import { Pager } from '@/components/list/pager'
import { setListParams, useFacilitySelection, useListParam, usePager } from '@/components/list/use-list-params'
import { formatDateVN } from '@/domain/dates'
import { matchesContractView, type ContractView } from '@/domain/list-filters'
import { formatVND } from '@/domain/money'
import type { DepositListItem, LeaseListItem } from '../../server/contracts/service'
import type { ReactNode } from 'react'
import { SignStateChip, Stat, termLabel, termProgress } from '@/components/contract-ui'

const VIEWS = [
  ['active', 'Hiệu lực'],
  ['expiring', 'Sắp hết hạn'],
  ['unsigned', 'Chưa ký'],
  ['ended', 'Kết thúc'],
  ['deposits', 'Cọc chờ'],
] as const

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
  const [query, setQuery] = useState('')
  const allowed = useMemo(() => facilities.map((f) => f.id), [facilities])
  const selected = useFacilitySelection(allowed)
  const names = useMemo(() => Object.fromEntries(facilities.map((f) => [f.id, f.name])), [facilities])

  const scopedLeases = useMemo(
    () => leases.filter((l) => selected.length === 0 || selected.includes(l.facilityId)),
    [leases, selected],
  )
  const scopedDeposits = useMemo(
    () => deposits.filter((d) => selected.length === 0 || selected.includes(d.facilityId)),
    [deposits, selected],
  )

  const counts = useMemo(
    () => ({
      active: scopedLeases.filter((l) => matchesContractView('active', l, today, warningDays)).length,
      expiring: scopedLeases.filter((l) => matchesContractView('expiring', l, today, warningDays)).length,
      unsigned: scopedLeases.filter((l) => l.signStatus !== 'signed').length,
      deposits: scopedDeposits.length,
    }),
    [scopedLeases, scopedDeposits, today, warningDays],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi')
    const hit = (parts: (string | null | undefined)[]) =>
      !q || parts.some((p) => p?.toLocaleLowerCase('vi').includes(q))
    if (view === 'deposits') {
      return {
        leases: [] as LeaseListItem[],
        deposits: scopedDeposits.filter((d) => hit([d.roomCode, d.tenantName, names[d.facilityId]])),
      }
    }
    return {
      leases: scopedLeases.filter(
        (l) =>
          matchesContractView(view as ContractView, l, today, warningDays) &&
          hit([l.code, l.roomCode, l.tenantName, l.legacyCode, names[l.facilityId]]),
      ),
      deposits: [] as DepositListItem[],
    }
  }, [scopedLeases, scopedDeposits, view, today, warningDays, query, names])

  const all = useMemo(
    () => [
      ...rows.leases.map((l) => ({ kind: 'lease' as const, l })),
      ...rows.deposits.map((c) => ({ kind: 'deposit' as const, c })),
    ],
    [rows],
  )
  const { pageRows, pager } = usePager(all, 'contracts', `${view}|${selected.join(',')}|${query}`)
  const shown = {
    leases: pageRows.flatMap((r) => (r.kind === 'lease' ? [r.l] : [])),
    deposits: pageRows.flatMap((r) => (r.kind === 'deposit' ? [r.c] : [])),
  }

  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">Hợp đồng thuê và cọc giữ chỗ tại các cơ sở bạn phụ trách.</p>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/80 bg-border/50 lg:grid-cols-4">
        <div className="bg-card">
          <Stat label="Đang hiệu lực" value={counts.active} />
        </div>
        <div className="bg-card">
          <Stat label="Sắp hết hạn" value={counts.expiring} note={`trong ${warningDays} ngày tới`} />
        </div>
        <div className="bg-card">
          <Stat label="Chưa ký" value={counts.unsigned} note="thiếu bản đã ký" />
        </div>
        <div className="bg-card">
          <Stat label="Cọc chờ" value={counts.deposits} note="chờ lên hợp đồng" />
        </div>
      </div>

      <div
        className="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border/70 sm:gap-1"
        role="group"
        aria-label="Bộ lọc trạng thái"
      >
        {VIEWS.map(([value, label]) => {
          const on = value === view
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => setListParams({ view: value === 'active' ? null : value })}
              className={`relative shrink-0 px-2 pb-2.5 pt-1.5 text-xs font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full sm:px-3 sm:text-[13px] sm:after:inset-x-3 ${
                on
                  ? 'text-foreground after:bg-primary'
                  : 'text-muted-foreground after:bg-transparent hover:text-foreground'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative min-w-52 flex-1 sm:max-w-xs">
          <span className="sr-only">Tìm hợp đồng</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã hợp đồng, khách thuê, phòng…"
            className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        <FacilityFilter facilities={facilities} align="right" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
        <table className="w-full text-[13px]">
          <caption className="sr-only">{`${pager.total} hợp đồng trong phạm vi đang chọn`}</caption>
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-normal text-muted-foreground">
              <th className="px-2.5 py-2.5 font-normal whitespace-nowrap">Thao tác</th>
              <th className="px-2.5 py-2.5 font-normal whitespace-nowrap">Mã HĐ</th>
              <th className="px-2.5 py-2.5 font-normal whitespace-nowrap">Khách thuê</th>
              <th className="px-2.5 py-2.5 font-normal whitespace-nowrap">Phòng / Toà</th>
              <th className="px-2.5 py-2.5 font-normal whitespace-nowrap">Thời hạn</th>
              <th className="px-2.5 py-2.5 text-right font-normal whitespace-nowrap">Giá thuê</th>
              <th className="px-2.5 py-2.5 font-normal whitespace-nowrap">Ký</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {shown.leases.map((l) => {
              const { left } = termProgress(l.startDate, l.endDate, today)
              return (
                <tr key={l.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-2.5 py-2.5 whitespace-nowrap">
                    <div className="flex justify-start">
                      {renderActions({
                        id: l.id,
                        kind: 'lease',
                        active: l.status === 'active',
                        canDelete: deleteFacilityIds.includes(l.facilityId),
                      })}
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 whitespace-nowrap">
                    <PopupLink
                      className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
                      href={`/contracts/${l.id}`}
                    >
                      {l.code}
                    </PopupLink>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span className="block max-w-36 truncate text-foreground">{l.tenantName}</span>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span className="block max-w-40 truncate">
                      <span className="font-medium text-foreground">Phòng {l.roomCode}</span>
                      {facilities.length > 1 && names[l.facilityId] && (
                        <span className="text-muted-foreground"> · {names[l.facilityId]}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5 whitespace-nowrap">
                    <div className="text-foreground">
                      {formatDateVN(l.startDate)} – {formatDateVN(l.endDate)}
                    </div>
                    <div
                      className={`text-xs ${l.status === 'active' && left <= 30 ? 'text-amber-800' : 'text-muted-foreground'}`}
                    >
                      {termLabel(left, l.status !== 'active')}
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-medium tabular-nums text-foreground whitespace-nowrap">
                    {formatVND(l.monthlyRent)}
                  </td>
                  <td className="px-2.5 py-2.5 whitespace-nowrap">
                    <SignStateChip status={l.signStatus} />
                  </td>
                </tr>
              )
            })}
            {shown.deposits.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-muted/30">
                <td className="px-3 py-2.5 whitespace-nowrap xl:px-4 xl:py-3">
                  <div className="flex justify-start">
                    {renderActions({
                      id: c.id,
                      kind: 'deposit',
                      active: false,
                      canDelete: deleteFacilityIds.includes(c.facilityId),
                    })}
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap xl:px-4 xl:py-3">
                  <PopupLink
                    className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
                    href={`/contracts/${c.id}`}
                  >
                    Cọc {c.roomCode}
                  </PopupLink>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap xl:px-4 xl:py-3">
                  <span className="block max-w-44 truncate text-foreground">{c.tenantName}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap xl:px-4 xl:py-3">
                  <span className="font-medium text-foreground">Phòng {c.roomCode}</span>
                  {facilities.length > 1 && names[c.facilityId] && (
                    <span className="text-muted-foreground"> · {names[c.facilityId]}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap xl:px-4 xl:py-3">
                  <span className="text-foreground">Vào ở {formatDateVN(c.expectedMoveIn)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">(Giữ chỗ)</span>
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground whitespace-nowrap xl:px-4 xl:py-3">
                  {formatVND(c.agreedRent)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap xl:px-4 xl:py-3">
                  <SignStateChip status={c.signStatus} />
                </td>
              </tr>
            ))}
            {shown.leases.length + shown.deposits.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {query ? `Không có hợp đồng nào khớp “${query}”.` : 'Không có hợp đồng nào ở trạng thái này.'}
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
