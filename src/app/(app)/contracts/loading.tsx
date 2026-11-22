export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-label="Đang tải danh sách hợp đồng">
      <span className="sr-only">Đang tải danh sách hợp đồng</span>
      <div aria-hidden="true" className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Hợp đồng</h1>
          <div className="h-4 w-72 max-w-full rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/80 bg-border/50 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 bg-card px-4 py-4">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-6 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="flex gap-6 border-b border-border/70 pb-3">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-3.5 w-16 rounded bg-muted" />)}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div className="h-9 w-full max-w-xs rounded-xl bg-muted" />
          <div className="h-9 w-28 rounded-xl bg-muted" />
        </div>
        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-12 w-full rounded bg-muted/70" />)}
        </div>
      </div>
    </div>
  )
}
