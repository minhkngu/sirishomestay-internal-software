import { Skeleton } from '@/components/ui/skeleton'

export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Đang tải dữ liệu" className="space-y-6">
      <span className="sr-only">Đang tải dữ liệu</span>
      <div aria-hidden="true" className="space-y-5">
        <Skeleton className="h-8 w-52" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="space-y-3 rounded-xl bg-white p-4">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
