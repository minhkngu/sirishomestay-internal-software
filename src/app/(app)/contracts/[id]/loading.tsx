export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-label="Đang tải hợp đồng">
      <span className="sr-only">Đang tải hợp đồng</span>
      <div aria-hidden="true" className="space-y-5">
        <div className="h-4 w-32 rounded bg-muted" />
        <section className="overflow-hidden rounded-2xl border border-border/80 bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 p-5">
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Hợp đồng</h1>
              <div className="h-4 w-56 rounded bg-muted" />
              <div className="h-3 w-44 rounded bg-muted" />
            </div>
            <div className="h-9 w-40 rounded-xl bg-muted" />
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/50 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2 bg-card px-4 py-4">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-6 w-24 rounded bg-muted" />
              </div>
            ))}
          </div>
        </section>
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-10 w-full rounded bg-muted/70" />
              <div className="h-10 w-full rounded bg-muted/70" />
              <div className="h-10 w-full rounded bg-muted/70" />
            </div>
            <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-10 w-full rounded bg-muted/70" />
              <div className="h-10 w-full rounded bg-muted/70" />
            </div>
          </div>
          <div className="space-y-5">
            <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-8 w-full rounded bg-muted/70" />
              <div className="h-8 w-full rounded bg-muted/70" />
            </div>
            <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5">
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="h-8 w-full rounded bg-muted/70" />
              <div className="h-8 w-full rounded bg-muted/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
