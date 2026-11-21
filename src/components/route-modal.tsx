'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { FormDialog, type FormDialogSize } from '@/components/form-dialog'
import { RouteModalContext } from '@/components/route-modal-context'

/** Popup của route chặn (`@modal/(.)<mục>/new`): luôn mở; đóng thì quay về trang trước (giữ nguyên URL và bộ lọc). */
export function RouteModal({ title, description, size, closeHref, onClose, children }: { title: string; description?: string; size?: FormDialogSize; /** Đóng popup bằng cách thay URL (dùng khi mở bằng query, không có trang trước để quay lại). */ closeHref?: string; /** Chạy trước khi đóng (ví dụ bỏ bản nháp chưa lưu). */ onClose?: () => Promise<unknown>; children: ReactNode }) {
  const router = useRouter()
  return <FormDialog open title={title} description={description} size={size} onOpenChange={async (open) => { if (open) return; if (onClose) await onClose().catch(() => undefined); if (closeHref) router.replace(closeHref); else router.back() }}><RouteModalContext.Provider value>{children}</RouteModalContext.Provider></FormDialog>
}
