'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type FormDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const SIZE: Record<FormDialogSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
  full: 'h-[94vh] w-[96vw] max-w-none sm:max-w-none',
}

/** Khung popup chung cho mọi thao tác thêm mới: tiêu đề, thân cuộn dọc, đóng bằng Esc hoặc nút đóng. */
export function FormDialog({ title, description, open, onOpenChange, size = 'md', children }: {
  title: string
  description?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  size?: FormDialogSize
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[94vh] grid-rows-[auto_1fr] overflow-hidden', SIZE[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="overflow-y-auto pr-2">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
