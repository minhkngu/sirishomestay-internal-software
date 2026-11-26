'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { deleteTenantAction } from '../server/tenants/actions'

export function TenantDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [pending, start] = useTransition()

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        className="gap-1.5 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setAsk(true)}
      >
        <Trash2 className="size-3.5" />
        <span>Xoá khách</span>
      </Button>
      <ConfirmDialog
        open={ask}
        onOpenChange={setAsk}
        title={`Xoá khách ${name}?`}
        destructive
        description="Hồ sơ và giấy tờ của khách sẽ bị xoá vĩnh viễn. Chỉ xoá được khi khách chưa gắn với hợp đồng, cọc hoặc phụ lục."
        confirmLabel="Xoá khách"
        onConfirm={() =>
          start(async () => {
            const r = await deleteTenantAction(id)
            if (!r.ok) {
              toast.error(r.error)
              return
            }
            toast.success('Đã xoá khách')
            router.push('/tenants')
            router.refresh()
          })
        }
      />
    </>
  )
}
