'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TenantForm } from './tenant-form'
import type { TenantKind } from '@/domain/tenant-kind'

export function TenantEditButton({
  tenant,
}: {
  tenant: { id: string; kind: TenantKind; homeFacilityId: string | null; note: string } & Record<string, string | null>
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        <span>Chỉnh sửa</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa thông tin khách</DialogTitle>
          </DialogHeader>
          <TenantForm bare tenant={tenant} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
