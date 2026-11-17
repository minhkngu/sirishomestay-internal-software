import { Sparkles } from 'lucide-react'

export function DemoBanner() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-200/60 bg-amber-50/80 px-4 py-1.5 text-center text-xs font-medium text-amber-800 backdrop-blur-xs"
    >
      <Sparkles className="size-3.5 text-amber-600 shrink-0" />
      <span>Môi trường thử — dữ liệu giả</span>
    </div>
  )
}
