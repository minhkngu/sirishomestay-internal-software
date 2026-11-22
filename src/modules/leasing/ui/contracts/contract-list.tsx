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
import { SignStateChip, Stat, TermBar, termLabel, termProgress } from '@/components/contract-ui'

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
        className="flex items-center gap-0.5 overflow-x-auto border-b border-border/70 sm:gap-1"
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:max-w-xs sm:flex-1">
          <span className="sr-only">Tìm hợp đồng</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã hợp đồng, khách thuê, phòng…"
            className="h-9 w-full rounded-xl border border-border/80 bg-card pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <FacilityFilter facilities={facilities} align="right" />
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border/80 bg-card min-[1400px]:block">
        <table className="w-full text-[13px]">
          <caption className="sr-only">{`${pager.total} hợp đồng trong phạm vi đang chọn`}</caption>
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-normal text-muted-foreground">
              <th className="px-4 py-3 font-normal">Hợp đồng</th>
              <th className="px-4 py-3 font-normal">Vị trí</th>
              <th className="px-4 py-3 font-normal">Thời hạn</th>
              <th className="px-4 py-3 text-right font-normal">Giá thuê / tháng</th>
              <th className="px-4 py-3 font-normal">Ký</th>
              <th className="px-4 py-3 text-right font-normal">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {shown.leases.map((l) => {
              const { left } = termProgress(l.startDate, l.endDate, today)
              return (
                <tr key={l.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <PopupLink
                      className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
                      href={`/contracts/${l.id}`}
                    >
                      {l.code}
                    </PopupLink>
                    <p className="mt-0.5 max-w-52 truncate text-xs text-muted-foreground">{l.tenantName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">Phòng {l.roomCode}</p>
                    {facilities.length > 1 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{names[l.facilityId]}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="whitespace-nowrap text-foreground">
                      {formatDateVN(l.startDate)} – {formatDateVN(l.endDate)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <TermBar
                        startDate={l.startDate}
                        endDate={l.endDate}
                        today={today}
                        ended={l.status !== 'active'}
                        className="w-24"
                      />
                      <span
                        className={`whitespace-nowrap text-[11px] ${left <= 30 ? 'text-amber-800' : 'text-muted-foreground'}`}
                      >
                        {termLabel(left, l.status !== 'active')}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                    {formatVND(l.monthlyRent)}
                  </td>
                  <td className="px-4 py-3">
                    <SignStateChip status={l.signStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {renderActions({
                        id: l.id,
                        kind: 'lease',
                        active: l.status === 'active',
                        canDelete: deleteFacilityIds.includes(l.facilityId),
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
            {shown.deposits.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3">
                  <PopupLink
                    className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
                    href={`/contracts/${c.id}`}
                  >
                    Cọc {c.roomCode}
                  </PopupLink>
                  <p className="mt-0.5 max-w-52 truncate text-xs text-muted-foreground">{c.tenantName}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-foreground">Phòng {c.roomCode}</p>
                  {facilities.length > 1 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{names[c.facilityId]}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="whitespace-nowrap text-foreground">Vào ở {formatDateVN(c.expectedMoveIn)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Giữ chỗ · chưa chuyển thành hợp đồng thuê</p>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                  {formatVND(c.agreedRent)}
                </td>
                <td className="px-4 py-3">
                  <SignStateChip status={c.signStatus} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    {renderActions({
                      id: c.id,
                      kind: 'deposit',
                      active: false,
                      canDelete: deleteFacilityIds.includes(c.facilityId),
                    })}
                  </div>
                </td>
              </tr>
            ))}
            {shown.leases.length + shown.deposits.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {query ? `Không có hợp đồng nào khớp “${query}”.` : 'Không có hợp đồng nào ở trạng thái này.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card min-[1400px]:hidden">
        <ul className="divide-y divide-border/60">
          {shown.leases.map((l) => (
            <li key={l.id} className="space-y-2.5 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <PopupLink className="font-medium text-foreground" href={`/contracts/${l.id}`}>
                    {l.code}
                  </PopupLink>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.tenantName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-foreground">{formatVND(l.monthlyRent)}</p>
                  <p className="text-[11px] text-muted-foreground">/ tháng</p>
                  <SignStateChip status={l.signStatus} className="mt-1.5" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>Phòng {l.roomCode}</span>
                {facilities.length > 1 && (
                  <>
                    <span>·</span>
                    <span>{names[l.facilityId]}</span>
                  </>
                )}
                <span>·</span>
                <span>
                  {formatDateVN(l.startDate)} – {formatDateVN(l.endDate)}
                </span>
              </div>
              <div className="space-y-1.5">
                <TermBar
                  startDate={l.startDate}
                  endDate={l.endDate}
                  today={today}
                  ended={l.status !== 'active'}
                  withLabel
                />
                <div className="flex justify-end">
                  {renderActions({
                    id: l.id,
                    kind: 'lease',
                    active: l.status === 'active',
                    canDelete: deleteFacilityIds.includes(l.facilityId),
                  })}
                </div>
              </div>
            </li>
          ))}
          {shown.deposits.map((c) => (
            <li key={c.id} className="space-y-2.5 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <PopupLink className="font-medium text-foreground" href={`/contracts/${c.id}`}>
                    Cọc {c.roomCode}
                  </PopupLink>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.tenantName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-foreground">{formatVND(c.agreedRent)}</p>
                  <p className="text-[11px] text-muted-foreground">/ tháng</p>
                  <SignStateChip status={c.signStatus} className="mt-1.5" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>Phòng {c.roomCode}</span>
                {facilities.length > 1 && (
                  <>
                    <span>·</span>
                    <span>{names[c.facilityId]}</span>
                  </>
                )}
                <span>·</span>
                <span>Vào ở {formatDateVN(c.expectedMoveIn)}</span>
              </div>
              <div className="flex justify-end">
                {renderActions({
                  id: c.id,
                  kind: 'deposit',
                  active: false,
                  canDelete: deleteFacilityIds.includes(c.facilityId),
                })}
              </div>
            </li>
          ))}
          {shown.leases.length + shown.deposits.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              {query ? `Không có hợp đồng nào khớp “${query}”.` : 'Không có hợp đồng nào ở trạng thái này.'}
            </li>
          )}
        </ul>
      </div>
      <Pager {...pager} />
    </>
  )
}
