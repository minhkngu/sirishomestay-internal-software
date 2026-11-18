"use client"

import type { ReactElement, ReactNode } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

/** Bọc cả nhóm icon: tooltip hiện ngay, và chuyển giữa các icon không bị trễ. */
function IconTipGroup({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delay={0} closeDelay={0}>{children}</TooltipPrimitive.Provider>
}

/** Gợi ý tên cho một icon (đặt trong IconTipGroup), hiện khi rê chuột hoặc focus bàn phím, khác thuộc tính title không phải chờ. */
function IconTip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="bottom" sideOffset={6} className="isolate z-50">
          <TooltipPrimitive.Popup className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md">
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { IconTip, IconTipGroup }
