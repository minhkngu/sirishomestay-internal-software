'use client'

import { useMemo, useState } from 'react'
import { formatVND } from '@/domain/money'
import { cn } from '@/lib/utils'
import { AssetForm } from './asset-form'
import { AssetTable, assetState, type AssetRow } from './asset-table'
import type { Selected, TreeFacility } from './location-types'
import { StockTable, type StockRow } from './stock-table'

const TABS = [
  { id: 'assets', label: 'Tài sản' },
  { id: 'stock', label: 'Vật tư' },
] as const

function SummaryCell({ label, value, suffix, tone, className }: { label: string; value: string; suffix?: string; tone?: 'attention'; className?: string }) {
  return (
    <div className={cn('px-4 py-3.5', className)}>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl', tone === 'attention' && 'text-rose-700')}>
        {value}
        {suffix && <span className="ml-1 align-baseline text-sm font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  )
}

export function AssetsView({
  tree,
  assets,
  stock,
}: {
  tree: TreeFacility[]
  assets: AssetRow[]
  stock: StockRow[]
}) {
  const [location, setLocation] = useState<Selected>({ kind: 'all' })

  const shownAssets = useMemo(() => assets.filter((a) => {
    if (location.kind === 'all') return true
    if (location.kind === 'facility') return a.facilityId === location.id
    return a.locationKind === location.kind && a.locationId === location.id
  }), [assets, location])
  const shownStock = useMemo(() => stock.filter((r) => {
    if (location.kind === 'all') return true
    if (location.kind === 'facility') return r.facilityId === location.id
    return r.locationKind === location.kind && r.locationId === location.id
  }), [stock, location])

  const totalValue = shownAssets.reduce((sum, a) => sum + a.value, 0)
  const attention = shownAssets.filter((a) => ['Hỏng', 'Trầy xước', 'Hư'].includes(assetState(a))).length
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('assets')

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Tài sản</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi tài sản và vật tư theo từng vị trí.</p>
        </div>
        {tab === 'assets' && <AssetForm facilities={tree} />}
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border/70 bg-card lg:grid-cols-4">
        <SummaryCell label="Tài sản" value={String(shownAssets.length)} className="border-b border-border/60 lg:border-b-0 lg:border-r" />
        <SummaryCell label="Tổng giá trị" value={formatVND(totalValue)} suffix="₫" className="border-b border-l border-border/60 lg:border-b-0 lg:border-l-0 lg:border-r" />
        <SummaryCell label="Cần chú ý" value={String(attention)} suffix="món" tone={attention > 0 ? 'attention' : undefined} className="border-b border-border/60 lg:border-b-0 lg:border-r" />
        <SummaryCell label="Vật tư" value={String(shownStock.length)} suffix="dòng" className="border-l border-border/60 lg:border-l-0" />
      </div>

      <div className="flex gap-6 border-b border-border/70" role="tablist" aria-label="Tài sản và vật tư">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px flex items-baseline gap-2 border-b-2 px-0.5 pb-2.5 text-sm transition-colors',
                active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'assets'
        ? <AssetTable assets={shownAssets} facilities={tree} location={location} onLocationChange={setLocation} />
        : <StockTable facilities={tree} rows={shownStock} location={location} onLocationChange={setLocation} />}
    </div>
  )
}
