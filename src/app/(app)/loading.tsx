export default function Loading() {
  return (
    <div className="space-y-6" role="status">
      <span className="sr-only">Đang tải…</span>
      <div aria-hidden="true" className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-10 w-72 max-w-full rounded bg-muted" />
        <div className="space-y-3 rounded border p-4">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="h-10 rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
