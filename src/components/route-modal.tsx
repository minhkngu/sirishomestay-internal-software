'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { FormDialog, type FormDialogSize } from '@/components/form-dialog'
import { RouteModalContext } from '@/components/route-modal-context'

/** Popup của route chặn (`@modal/(.)<mục>/new`): luôn mở; đóng thì quay về trang trước (giữ nguyên URL và bộ lọc). */
export function RouteModal({ title, description, size, closeHref, children }: { title: string; description?: string; size?: FormDialogSize; /** Đóng popup bằng cách thay URL (dùng khi mở bằng query, không có trang trước để quay lại). */ closeHref?: string; children: ReactNode }) {
  const router = useRouter()
  return <FormDialog open title={title} description={description} size={size} onOpenChange={(open) => { if (!open) closeHref ? router.replace(closeHref) : router.back() }}><RouteModalContext.Provider value>{children}</RouteModalContext.Provider></FormDialog>
}
