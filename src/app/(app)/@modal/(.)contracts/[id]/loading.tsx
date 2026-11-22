import { RouteModal } from '@/components/route-modal'

// Hiện popup ngay khi bấm, trong lúc chi tiết hợp đồng đang tải
export default function LoadingContractModal() {
  return (
    <RouteModal title="Chi tiết hợp đồng" size="xl">
      <div className="space-y-3 py-2" aria-busy="true">
        <div className="h-8 w-1/3 rounded-lg bg-muted" />
        <div className="h-24 rounded-xl bg-muted/70" />
        <div className="h-40 rounded-xl bg-muted/70" />
      </div>
    </RouteModal>
  )
}
