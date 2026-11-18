'use client'

import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function ContractDetailModal({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return <Dialog open onOpenChange={open => { if (!open) router.back() }}>
    <DialogContent className="h-[94vh] w-[96vw] max-w-none grid-rows-[auto_1fr] overflow-hidden sm:max-w-none">
      <DialogHeader><DialogTitle>Chi tiết hợp đồng</DialogTitle><DialogDescription>Thông tin và tài liệu liên quan đến hợp đồng.</DialogDescription></DialogHeader>
      <div className="overflow-y-auto pr-2">{children}</div>
    </DialogContent>
  </Dialog>
}
