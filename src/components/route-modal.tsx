'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { FormDialog, type FormDialogSize } from '@/components/form-dialog'

/** Popup của route chặn (`@modal/(.)<mục>/new`): luôn mở; đóng thì quay về trang trước (giữ nguyên URL và bộ lọc). */
export function RouteModal({ title, description, size, children }: { title: string; description?: string; size?: FormDialogSize; children: ReactNode }) {
  const router = useRouter()
  return <FormDialog open title={title} description={description} size={size} onOpenChange={(open) => { if (!open) router.back() }}>{children}</FormDialog>
}
