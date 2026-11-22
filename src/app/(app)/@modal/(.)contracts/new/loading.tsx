import { RouteModal } from '@/components/route-modal'

export default function LoadingNewContractModal() {
  return (
    <RouteModal title="Tạo hợp đồng" size="lg">
      <div className="space-y-4 py-2" aria-busy="true">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-9 rounded-xl bg-muted/70" />
            <div className="h-9 rounded-xl bg-muted/70" />
          </div>
          <div className="h-16 rounded-xl bg-muted/50" />
        </div>
        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4">
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-9 rounded-xl bg-muted/70" />
            <div className="h-9 rounded-xl bg-muted/70" />
          </div>
        </div>
      </div>
    </RouteModal>
  )
}
