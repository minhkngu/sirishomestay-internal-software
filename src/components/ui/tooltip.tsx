"use client"

import type { ReactElement } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

/** Gợi ý tên cho icon, hiện ngay khi rê chuột hoặc focus bàn phím (không chờ như thuộc tính title). */
function IconTip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <TooltipPrimitive.Provider delay={0} closeDelay={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger delay={0} render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side="bottom" sideOffset={6} className="isolate z-50">
            <TooltipPrimitive.Popup className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md">
              {label}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

export { IconTip }
