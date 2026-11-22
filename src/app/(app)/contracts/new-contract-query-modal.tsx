'use client'

import { Suspense, type ReactNode } from 'react'
import { RouteModal } from '@/components/route-modal'

/** Popup mở bằng query `?new=lease|deposit` khi không đi qua route chặn (mở thẳng hoặc tải lại). */
export function NewContractQueryModal({
  kind,
  closeHref,
  children,
}: {
  kind: 'lease' | 'deposit'
  closeHref: string
  children: ReactNode
}) {
  return (
    <RouteModal
      title={kind === 'deposit' ? 'Tạo hợp đồng cọc' : 'Tạo hợp đồng thuê'}
      description="Điền thông tin phòng, bên thuê và điều khoản của hợp đồng."
      size="lg"
      closeHref={closeHref}
    >
      <Suspense fallback={<BodySkeleton />}>{children}</Suspense>
    </RouteModal>
  )
}

function BodySkeleton() {
  return (
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
  )
}
