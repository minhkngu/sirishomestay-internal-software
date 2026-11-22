'use server'

import '@/modules/registrations'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { db } from '@/db/client'
import { toActionResult } from '@/lib/action-result'
import { getAccessContext } from '@/modules/platform'
import { getStorage } from '@/modules/platform'
import {
  cancelDepositContract,
  convertDepositToLease,
  createDepositContract,
  createLease,
  exportContract,
  setSignStatus,
  updateLease,
  updateDepositContract,
  deleteContract,
  cleanupPendingContractFiles,
  type DepositInput,
  type LeaseInput,
  type SignStatus,
} from './service'

const refresh = () => {
  revalidatePath('/contracts')
  revalidatePath('/facilities', 'layout')
  revalidatePath('/rooms', 'layout')
}

export async function createDepositContractAction(input: DepositInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await createDepositContract(db, ctx, input)
    refresh()
    return { id: r.contract.id, warnings: r.warnings }
  })
}
export async function cancelDepositContractAction(id: string, outcome: 'forfeit' | 'refund') {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await cancelDepositContract(db, ctx, id, outcome)
    refresh()
    return {}
  })
}
/** Tạo lại bản PDF hợp đồng và biên bản bàn giao sau khi lưu; lỗi chỉ trả về cảnh báo, không làm hỏng việc đã lưu. */
export async function refreshContractDocumentsAction(leaseId: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const { syncContractDocuments } = await import('./documents')
    const r = await syncContractDocuments(db, ctx, getStorage(), leaseId)
    revalidatePath(`/contracts/${leaseId}`)
    return r
  })
}
/** Sau khi trả lời xong, tạo bản PDF cho hợp đồng vừa lưu (không làm chậm thao tác). */
function syncAfterResponse(leaseId: string) {
  after(async () => {
    try {
      const ctx = await getAccessContext()
      const { syncContractDocuments } = await import('./documents')
      await syncContractDocuments(db, ctx, getStorage(), leaseId)
    } catch {
      /* bản PDF sẽ tạo lại ở lần lưu sau */
    }
  })
}
export async function createLeaseAction(input: LeaseInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await createLease(db, ctx, input)
    refresh()
    syncAfterResponse(r.lease.id)
    return { id: r.lease.id, code: r.lease.code, handoverItems: r.handoverItems }
  })
}
export async function convertDepositToLeaseAction(depositId: string, input: LeaseInput) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await convertDepositToLease(db, ctx, depositId, input)
    refresh()
    syncAfterResponse(r.lease.id)
    return { id: r.lease.id, code: r.lease.code, handoverItems: r.handoverItems }
  })
}
export async function setSignStatusAction(
  kind: 'lease' | 'deposit',
  id: string,
  status: SignStatus,
  signedFileId?: string,
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await setSignStatus(db, ctx, kind, id, status, signedFileId)
    refresh()
    return {}
  })
}
export async function exportContractAction(
  kind: 'lease' | 'deposit',
  id: string,
  templateId?: string,
  format: 'docx' | 'pdf' = 'docx',
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const r = await exportContract(db, ctx, getStorage(), kind, id, templateId, format)
    refresh()
    return r
  })
}

export async function updateLeaseAction(
  id: string,
  input: import('./service').LeaseEditInput,
  confirmedSigned: boolean,
) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateLease(db, ctx, id, input, confirmedSigned)
    refresh()
    revalidatePath(`/contracts/${id}`)
    return {}
  })
}
export async function updateLeaseAssetsAction(id: string, changes: import('./service').LeaseAssetChanges) {
  const ctx = await getAccessContext()
  const { updateLeaseAssets } = await import('./service')
  return toActionResult(async () => {
    await updateLeaseAssets(db, ctx, id, changes)
    refresh()
    revalidatePath(`/contracts/${id}`)
    revalidatePath('/assets')
    return {}
  })
}
export async function updateDepositContractAction(id: string, input: DepositInput, confirmedSigned: boolean) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    await updateDepositContract(db, ctx, id, input, confirmedSigned)
    refresh()
    revalidatePath(`/contracts/${id}`)
    return {}
  })
}
export async function deleteContractAction(kind: 'lease' | 'deposit', id: string, confirmed: boolean) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const result = await deleteContract(db, ctx, kind, id, confirmed, getStorage())
    refresh()
    return result
  })
}

export async function retryContractFileCleanupAction() {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const { assertCan } = await import('@/domain/access')
    assertCan(ctx, 'delete_contracts')
    const pendingFiles = await cleanupPendingContractFiles(db, getStorage(), ctx)
    refresh()
    return { pendingFiles }
  })
}

export async function quickContractDataAction(kind: 'lease' | 'deposit', id: string) {
  const ctx = await getAccessContext()
  return toActionResult(async () => {
    const { getLease, getDepositContract } = await import('./service')
    const { listRooms } = await import('@/modules/facilities')
    const { searchTenants, displayName } = await import('@/modules/tenants')
    const { addendumFormData } = await import('@/server/addenda/service')
    const { listLeaseOccupants } = await import('./service')
    const contract = kind === 'lease' ? await getLease(db, ctx, id) : await getDepositContract(db, ctx, id)
    const [allRooms, allTenants, form] = await Promise.all([
      listRooms(db, ctx, { includeInactive: true }),
      searchTenants(db, ctx, { limit: null }),
      kind === 'lease' && 'status' in contract && contract.status === 'active' ? addendumFormData(db, ctx, id) : null,
    ])
    const editContract =
      kind === 'lease'
        ? (() => {
            const l = contract as Awaited<ReturnType<typeof getLease>>
            return {
              kind: 'lease' as const,
              id: l.id,
              roomId: l.roomId,
              tenantId: l.tenantId,
              depositAmount: l.depositAmount,
              signStatus: l.signStatus,
              startDate: l.startDate,
              endDate: l.endDate,
              monthlyRent: l.monthlyRent,
              note: l.note,
            }
          })()
        : (() => {
            const c = contract as Awaited<ReturnType<typeof getDepositContract>>
            return {
              kind: 'deposit' as const,
              id: c.id,
              roomId: c.roomId,
              tenantId: c.tenantId,
              depositAmount: c.depositAmount,
              signStatus: c.signStatus,
              expectedMoveIn: c.expectedMoveIn,
              agreedRent: c.agreedRent,
            }
          })()
    const occupants =
      kind === 'lease'
        ? await listLeaseOccupants(db, ctx, contract.facilityId, [
            ...new Set([contract.tenantId, ...(contract as Awaited<ReturnType<typeof getLease>>).terms.occupantIds]),
          ])
        : []
    const people = allTenants
      .filter((t) => t.homeFacilityId === contract.facilityId)
      .map((t) => ({
        id: t.id,
        name: displayName(t),
        idNumber: t.kind === 'company' ? t.taxCode : (t.idNumber ?? t.passportNumber),
        phone: t.phone,
        isCompany: t.kind === 'company',
      }))
    // Các mục sửa kèm theo hợp đồng thuê: dùng chung cho popup ở danh sách và ở trang chi tiết
    const extras =
      kind === 'lease'
        ? await (async () => {
            const l = contract as Awaited<ReturnType<typeof getLease>>
            const { can } = await import('@/domain/access')
            const { listInvoiceTemplates } = await import('@/modules/documents')
            const { listTemplates, isUsableTemplate } = await import('@/modules/documents')
            const billing = can(ctx, 'billing', l.facilityId)
            const [templates, contractTemplates] = await Promise.all([
              listInvoiceTemplates(db, ctx),
              listTemplates(db, ctx, 'lease'),
            ])
            return {
              billing,
              signStatus: l.signStatus,
              signedFileId: l.signedFileId,
              invoiceTemplateId: l.invoiceTemplateId,
              contractTemplateId: l.contractTemplateId,
              contractTemplates: contractTemplates
                .filter(isUsableTemplate)
                .map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
              invoiceTemplates: templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
              depositEntries: l.depositEntries.map((e) => ({
                id: e.id,
                date: e.date,
                type: e.type,
                amount: e.amount,
                status: e.status,
              })),
            }
          })()
        : null
    const feeData =
      kind === 'lease'
        ? await (async () => {
            const l = contract as Awaited<ReturnType<typeof getLease>>
            const { listFeeTypes, listFeeTypePrices, listFeeUnits } = await import('@/modules/facilities')
            const { resolveFeePrice } = await import('@/domain/fee-price')
            const [types, prices, units] = await Promise.all([
              listFeeTypes(db, ctx),
              listFeeTypePrices(db, ctx),
              listFeeUnits(db),
            ])
            const unitName = new Map(units.map((u) => [u.id, u.name]))
            const { meters, leaseFeeMeters, leaseFeeSnapshots, leases } = await import('@/db')
            const { and, eq, isNull } = await import('drizzle-orm')
            const meterRows = await db
              .select({
                id: meters.id,
                utility: meters.utility,
                name: meters.name,
                code: meters.code,
                serial: meters.serial,
              })
              .from(meters)
              .where(and(eq(meters.roomId, l.roomId), isNull(meters.removedOn)))
            const busyRows = await db
              .select({ meterId: leaseFeeMeters.meterId })
              .from(leaseFeeMeters)
              .innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId))
              .innerJoin(leases, eq(leases.id, leaseFeeSnapshots.leaseId))
              .where(eq(leases.status, 'active'))
            const busyIds = new Set(busyRows.map((r) => r.meterId))
            const roomMeters = meterRows.map((m) => ({
              id: m.id,
              label: `${m.name || (m.utility === 'electric' ? 'Điện' : m.utility === 'water' ? 'Nước' : 'Đồng hồ')}${m.code ? ` · ${m.code}` : ''}${m.serial ? ` · ${m.serial}` : ''}`,
            }))
            return {
              editable: true,
              units: units.map((u) => ({ id: u.id, name: u.name })),
              current: l.fees.map((f) => ({
                leaseFeeId: f.leaseFeeId ?? null,
                feeTypeId: f.feeTypeId,
                name: f.name,
                unit: f.unit,
                unitPrice: f.unitPrice,
                locked: f.quantitySource === 'meter',
              })),
              meterSupported: true,
              options: types.map((t) => ({
                id: t.id,
                name: t.name,
                unit: unitName.get(t.unitId) ?? '',
                price: resolveFeePrice(t.defaultPrice, prices[t.id] ?? {}, l.facilityId),
                meter: t.quantityFrom === 'meter',
              })),
              roomMeters: roomMeters.map((m) => ({ id: m.id, label: m.label, busy: busyIds.has(m.id) })),
            }
          })()
        : null
    const { listFacilities } = await import('@/modules/facilities')
    const facility = (await listFacilities(db, ctx)).find((f) => f.id === contract.facilityId)
    const assetData =
      kind === 'lease'
        ? await (async () => {
            const { can } = await import('@/domain/access')
            if (!can(ctx, 'assets', contract.facilityId)) return null
            const { listAssets } = await import('@/server/assets/service')
            const all = await listAssets(db, ctx, { facilityId: contract.facilityId })
            const room = (contract as Awaited<ReturnType<typeof getLease>>).roomId
            const pick = (a: (typeof all)[number]) => ({
              id: a.id,
              code: a.code,
              name: a.name,
              model: a.model,
              condition: a.condition,
              where:
                a.locationKind === 'room'
                  ? 'Phòng khác'
                  : a.locationKind === 'warehouse'
                    ? 'Kho'
                    : a.locationKind === 'common'
                      ? 'Khu chung'
                      : 'Chưa gán',
            })
            return {
              inRoom: all.filter((a) => a.locationKind === 'room' && a.locationId === room).map(pick),
              available: all.filter((a) => !(a.locationKind === 'room' && a.locationId === room)).map(pick),
            }
          })()
        : null
    return {
      assetData,
      facility: { id: contract.facilityId, name: facility?.name ?? '' },
      feeData,
      extras,
      occupants,
      people,
      contract: editContract,
      rooms: allRooms.filter((r) => r.facilityId === contract.facilityId).map((r) => ({ id: r.id, label: r.code })),
      tenants: allTenants
        .filter((t) => t.homeFacilityId === contract.facilityId)
        .map((t) => ({ id: t.id, label: displayName(t) })),
      form: form
        ? {
            endDate: form.endDate,
            today: form.today,
            meters: form.meters,
            currentRoomId: form.currentRoomId,
            freeRooms: form.freeRooms,
          }
        : null,
    }
  })
}

export async function previewContractRestoreAction(kind: 'lease' | 'deposit', id: string) {
  const ctx = await getAccessContext()
  const { previewContractRestore } = await import('./restore')
  return toActionResult(() => previewContractRestore(db, ctx, kind, id))
}

export async function restoreContractAction(kind: 'lease' | 'deposit', id: string, token: string) {
  const ctx = await getAccessContext()
  const { restoreContract } = await import('./restore')
  return toActionResult(async () => {
    const result = await restoreContract(db, ctx, kind, id, token, getStorage())
    refresh()
    return result
  })
}

export async function retryRestoredFileCleanupAction() {
  const ctx = await getAccessContext()
  const { cleanupPendingRestoredFiles } = await import('./restore')
  return toActionResult(async () => {
    const pendingFiles = await cleanupPendingRestoredFiles(db, ctx, getStorage())
    refresh()
    return { pendingFiles }
  })
}
