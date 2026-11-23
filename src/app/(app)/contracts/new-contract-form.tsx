'use client'

import { useRef, useState, type ComponentProps } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LeaseWizard } from '@/features/contracts/components/lease-wizard'
import { CreateFeeTypeNow } from './create-fee-type-now'
import { DepositForm, type TenantOption } from '@/features/contracts/components/deposit-form'
import { TenantForm, type CreatedTenant } from '@/features/tenants/components/tenant-form'

type LeaseProps = Omit<ComponentProps<typeof LeaseWizard>, 'onCreatePerson'>
type DepositProps = Omit<ComponentProps<typeof DepositForm>, 'onCreatePerson'>

/** Bọc form thuê/cọc để nối nút "Tạo người mới" của ô chọn người với form khách thuê. */
export function NewContractForm({
  kind,
  embedded,
  facilities,
  leaseProps,
  depositProps,
}: {
  kind: 'lease' | 'deposit'
  embedded: boolean
  facilities: { id: string; name: string }[]
  leaseProps?: LeaseProps
  depositProps?: DepositProps
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [createFacilityId, setCreateFacilityId] = useState('')
  const [createdPeople, setCreatedPeople] = useState<TenantOption[]>([])
  const createdCallback = useRef<((person: TenantOption) => void) | null>(null)

  function openCreatePerson(facilityId: string, onCreated: (person: TenantOption) => void) {
    setCreateFacilityId(facilityId)
    createdCallback.current = onCreated
    setCreateOpen(true)
  }

  function personCreated(tenant: CreatedTenant) {
    const person: TenantOption = {
      id: tenant.id,
      name: tenant.name,
      kind: tenant.isCompany ? 'company' : 'vietnamese',
      phone: tenant.phone ?? null,
    }
    setCreatedPeople((previous) => (previous.some((item) => item.id === person.id) ? previous : [...previous, person]))
    createdCallback.current?.(person)
    createdCallback.current = null
    setCreateOpen(false)
  }

  const orderedFacilities = createFacilityId
    ? [...facilities].sort((a, b) => (a.id === createFacilityId ? -1 : b.id === createFacilityId ? 1 : 0))
    : facilities

  return (
    <>
      {kind === 'lease' && leaseProps ? (
        <LeaseWizard
          {...leaseProps}
          renderCreateFee={({ onCreated }) => <CreateFeeTypeNow units={leaseProps.feeUnits} onCreated={onCreated} />}
          embedded={embedded}
          tenants={[...leaseProps.tenants, ...createdPeople]}
          onCreatePerson={openCreatePerson}
        />
      ) : depositProps ? (
        <DepositForm
          {...depositProps}
          embedded={embedded}
          tenants={[...depositProps.tenants, ...createdPeople]}
          onCreatePerson={openCreatePerson}
        />
      ) : null}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) createdCallback.current = null
        }}
      >
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Thêm người mới</DialogTitle>
            <DialogDescription>
              Người mới được lưu vào danh sách khách thuê và chọn luôn cho hợp đồng này.
            </DialogDescription>
          </DialogHeader>
          {createOpen && <TenantForm bare facilities={orderedFacilities} onCreated={personCreated} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
