import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { assets, leaseFeeMeters, leaseFeeSnapshots, meters } from '@/db'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan, can } from '@/domain/access'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'
import { getAccessContext } from '@/server/session'
import { listFacilities } from '@/server/facilities/service'
import { listRoomsWithStatus } from '@/server/rooms/service'
import { searchTenants, displayName } from '@/server/tenants/service'
import { listFeeDefaults, listFeeTypes, listFeeUnits, listFeeTypePrices } from '@/server/fees/service'
import { getSettings } from '@/server/settings/service'
import { listAssets } from '@/server/assets/service'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry } from '@/domain/types'
import { getDepositContract } from '@/server/contracts/service'
import { DepositForm } from '@/features/contracts/components/deposit-form'
import { LeaseWizard } from '@/features/contracts/components/lease-wizard'
import { listTemplates } from '@/server/templates/service'
import { listInvoiceTemplates } from '@/server/invoice-templates/service'

type SP = { kind?: string; room?: string; tenant?: string; deposit?: string }

export default async function NewContractPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getAccessContext()
  try { assertCan(ctx, 'tenants_contracts') } catch { notFound() }
  const kind = sp.kind === 'deposit' ? 'deposit' : 'lease'
  const [facs, tenants, feeTypes, units, settings, prices, feeDefaults, templates, invoiceTemplates] = await Promise.all([
    listFacilities(db, ctx), searchTenants(db, ctx, { limit: 500 }), listFeeTypes(db, ctx), listFeeUnits(db, ctx), getSettings(db), listFeeTypePrices(db, ctx), listFeeDefaults(db, ctx), listTemplates(db, ctx, 'lease'), listInvoiceTemplates(db, ctx),
  ])
  const allRooms = await listRoomsWithStatus(db, ctx, {})
  const rooms = facs.flatMap((f) => allRooms.filter((r) => r.facilityId === f.id).map((r) => ({ f, r })))
  const roomIds = rooms.map(({ r }) => r.id)
  const meterRows = roomIds.length ? await db.select({ id: meters.id, roomId: meters.roomId, feeTypeId: meters.feeTypeId, name: leaseFeeSnapshots.name, unit: leaseFeeSnapshots.unit }).from(meters).innerJoin(leaseFeeMeters, eq(leaseFeeMeters.meterId, meters.id)).innerJoin(leaseFeeSnapshots, eq(leaseFeeSnapshots.id, leaseFeeMeters.leaseFeeId)).where(and(inArray(meters.roomId, roomIds), eq(meters.utility, 'fee'), isNull(meters.removedOn))) : []
  const roomMeters = [...new Map(meterRows.map(m => [m.id, m])).values()]
  const tenantOptions = tenants.map((t) => ({ id: t.id, name: displayName(t), kind: t.kind }))
  const unitName = new Map(units.map((u) => [u.id, u.name]))

  const assetOptions = can(ctx, 'assets') ? await listAssets(db, ctx, {}) : facs.length ? await db.select().from(assets).where(and(inArray(assets.facilityId, facs.map(f => f.id)), ne(assets.status, 'disposed'))) : []
  const assetFacs = facs.filter(f => can(ctx, 'assets', f.id))
  const moveTargets = { facilities: assetFacs.map(f => ({ id: f.id, name: f.name, rooms: rooms.filter(x => x.f.id === f.id).map(x => ({ id: x.r.id, code: x.r.code })) })) }
  let initial = { roomId: sp.room, tenantId: sp.tenant, depositId: undefined as string | undefined, rent: undefined as number | undefined, deposit: undefined as number | undefined, startDate: undefined as string | undefined, receivedDeposit: 0 }
  if (sp.deposit) {
    const d = await getDepositContract(db, ctx, sp.deposit)
    initial = { roomId: d.roomId, tenantId: d.tenantId, depositId: d.id, rent: d.agreedRent, deposit: d.depositAmount, startDate: d.expectedMoveIn, receivedDeposit: depositBalance(d.entries.map((e) => ({ ...e, type: e.type as DepositEntry['type'], status: e.status as DepositEntry['status'] }))) }
  }

  const roomOptions = (filter: (s: string) => boolean) => rooms.filter(({ r }) => filter(r.status)).map(({ f, r }) => ({ id: r.id, facilityId: f.id, label: `${f.name} · ${r.code} (${ROOM_STATUS_LABELS[r.status]})`, listPrice: r.listPrice }))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{kind === 'deposit' ? 'Tạo hợp đồng cọc' : 'Tạo hợp đồng thuê'}</h1>
      {kind === 'deposit'
        ? <DepositForm rooms={roomOptions((s) => s === 'vacant' || s === 'occupied' || s === 'ending_soon')} tenants={tenantOptions} initialRoomId={sp.room} initialTenantId={sp.tenant} />
        : <LeaseWizard invoiceTemplates={invoiceTemplates.map(t => ({ id: t.id, name: t.name, isDefault: t.isDefault }))} templates={templates.filter(t => t.fileId).map(t => ({ id: t.id, name: t.name, isDefault: t.isDefault }))} feeDefaults={feeDefaults} roomMeters={roomMeters} assets={assetOptions.map((a) => ({ id: a.id, code: a.code, name: a.name, model: a.model, condition: a.condition, facilityId: a.facilityId, locationKind: a.locationKind, locationId: a.locationId }))} canManageAssets={can(ctx, 'assets')} moveTargets={moveTargets} rooms={roomOptions((s) => s === 'vacant' || s === 'deposited')} tenants={tenantOptions} initial={initial}
            feeTypes={feeTypes.map((f) => ({ id: f.id, name: f.name, unit: unitName.get(f.unitId) ?? '', defaultPrice: f.defaultPrice, prices: prices[f.id] ?? {}, billing: f.billing, quantityFrom: f.quantityFrom }))}
            defaults={{ proration: settings.proration, dueRuleLabel: settings.dueRule.kind === 'day_of_next_month' ? `ngày ${settings.dueRule.day} của tháng sau` : `${settings.dueRule.days} ngày sau khi duyệt` }} />}
    </div>
  )
}
