import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { assertCan, can } from '@/domain/access'
import { ROOM_STATUS_LABELS } from '@/domain/room-status'
import { getAccessContext } from '@/modules/platform'
import { listFacilities } from '@/modules/facilities'
import { listRoomsWithStatus } from '@/modules/leasing'
import { searchTenants, displayName } from '@/modules/tenants'
import { listFeeDefaults, listFeeTypes, listFeeUnits, listFeeTypePrices } from '@/modules/facilities'
import { getSettings } from '@/modules/platform'
import { listContractAssetOptions } from '@/modules/assets'
import { listRoomMeterOptions } from '@/modules/meters'
import { depositBalance } from '@/domain/deposit'
import type { DepositEntry } from '@/domain/types'
import { getDepositContract } from '@/modules/leasing'
import { NewContractForm } from './new-contract-form'
import { isUsableTemplate, listTemplates } from '@/modules/documents'
import { listInvoiceTemplates } from '@/modules/documents'

export type NewContractSP = { kind?: string; room?: string; tenant?: string; deposit?: string }

/** Nội dung trang tạo hợp đồng; dùng cho cả trang đầy đủ lẫn popup. */
export async function NewContract({ sp, showHeading = true }: { sp: NewContractSP; showHeading?: boolean }) {
  const ctx = await getAccessContext()
  try {
    assertCan(ctx, 'tenants_contracts')
  } catch {
    notFound()
  }
  const kind = sp.kind === 'deposit' ? 'deposit' : 'lease'
  const [facs, tenants, feeTypes, units, settings, prices, feeDefaults, templates, invoiceTemplates] =
    await Promise.all([
      listFacilities(db, ctx),
      searchTenants(db, ctx, { limit: 500 }),
      listFeeTypes(db, ctx),
      listFeeUnits(db),
      getSettings(db),
      listFeeTypePrices(db, ctx),
      listFeeDefaults(db, ctx),
      listTemplates(db, ctx, 'lease'),
      listInvoiceTemplates(db, ctx),
    ])
  const allRooms = await listRoomsWithStatus(db, ctx, {})
  const rooms = facs.flatMap((f) => allRooms.filter((r) => r.facilityId === f.id).map((r) => ({ f, r })))
  const roomIds = rooms.map(({ r }) => r.id)
  // Đồng hồ đang gắn dòng phí của hợp đồng còn hiệu lực thì không được chọn lại (busy)
  const meterRows = await listRoomMeterOptions(db, ctx, roomIds)
  const utilityLabel = { electric: 'Điện', water: 'Nước', fee: 'Khác' } as const
  const roomMeters = meterRows.map((m) => ({
    id: m.id,
    roomId: m.roomId,
    utility: m.utility as 'electric' | 'water' | 'fee',
    label: `${m.name || utilityLabel[m.utility as keyof typeof utilityLabel] || 'Đồng hồ'}${m.code ? ` · ${m.code}` : ''}${m.serial ? ` · ${m.serial}` : ''}`,
    busy: m.busy,
  }))
  const tenantOptions = tenants.map((t) => ({ id: t.id, name: displayName(t), kind: t.kind, phone: t.phone }))
  const unitName = new Map(units.map((u) => [u.id, u.name]))

  const assetOptions = await listContractAssetOptions(
    db,
    ctx,
    facs.map((f) => f.id),
  )
  const assetFacs = facs.filter((f) => can(ctx, 'assets', f.id))
  const moveTargets = {
    facilities: assetFacs.map((f) => ({
      id: f.id,
      name: f.name,
      rooms: rooms.filter((x) => x.f.id === f.id).map((x) => ({ id: x.r.id, code: x.r.code })),
    })),
  }
  let initial = {
    roomId: sp.room,
    tenantId: sp.tenant,
    depositId: undefined as string | undefined,
    rent: undefined as number | undefined,
    deposit: undefined as number | undefined,
    startDate: undefined as string | undefined,
    receivedDeposit: 0,
  }
  if (sp.deposit) {
    const d = await getDepositContract(db, ctx, sp.deposit)
    initial = {
      roomId: d.roomId,
      tenantId: d.tenantId,
      depositId: d.id,
      rent: d.agreedRent,
      deposit: d.depositAmount,
      startDate: d.expectedMoveIn,
      receivedDeposit: depositBalance(
        d.entries.map((e) => ({
          ...e,
          type: e.type as DepositEntry['type'],
          status: e.status as DepositEntry['status'],
        })),
      ),
    }
  }

  const roomOptions = (filter: (s: string) => boolean) =>
    rooms
      .filter(({ r }) => filter(r.status))
      .map(({ f, r }) => ({
        id: r.id,
        facilityId: f.id,
        facilityName: f.name,
        label: `${f.name} · ${r.code} (${ROOM_STATUS_LABELS[r.status]})`,
        roomLabel: `${r.code} (${ROOM_STATUS_LABELS[r.status]})`,
        listPrice: r.listPrice,
      }))

  const leaseFormProps = {
    invoiceTemplates: invoiceTemplates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
    templates: templates.filter(isUsableTemplate).map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
    feeDefaults,
    feeUnits: units.map((u) => ({ id: u.id, name: u.name })),
    roomMeters,
    assets: assetOptions.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      model: a.model,
      condition: a.condition,
      facilityId: a.facilityId,
      locationKind: a.locationKind,
      locationId: a.locationId,
    })),
    canManageAssets: can(ctx, 'assets'),
    moveTargets,
    rooms: roomOptions((s) => s === 'vacant' || s === 'deposited'),
    tenants: tenantOptions,
    initial,
    feeTypes: feeTypes.map((f) => ({
      id: f.id,
      name: f.name,
      unit: unitName.get(f.unitId) ?? '',
      defaultPrice: f.defaultPrice,
      prices: prices[f.id] ?? {},
      billing: f.billing,
      quantityFrom: f.quantityFrom,
    })),
    defaults: {
      proration: settings.proration,
      dueRuleLabel:
        settings.dueRule.kind === 'day_of_invoice_month'
          ? `ngày ${settings.dueRule.day} của chính tháng hoá đơn`
          : settings.dueRule.kind === 'day_of_next_month'
            ? `ngày ${settings.dueRule.day} của tháng sau`
            : `${settings.dueRule.days} ngày sau khi duyệt`,
    },
  }
  const depositFormProps = {
    rooms: roomOptions((s) => s === 'vacant' || s === 'occupied' || s === 'ending_soon'),
    tenants: tenantOptions,
    initialRoomId: sp.room,
    initialTenantId: sp.tenant,
  }

  return (
    <div className="space-y-5">
      {showHeading && (
        <div className="space-y-3">
          <Link
            href="/contracts"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Danh sách hợp đồng</span>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {kind === 'deposit' ? 'Tạo hợp đồng cọc' : 'Tạo hợp đồng thuê'}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {kind === 'deposit'
                ? 'Giữ chỗ một phòng bằng tiền cọc trước khi lập hợp đồng thuê.'
                : 'Lập hợp đồng cho một phòng trống, kèm người ở và tài sản bàn giao.'}
            </p>
          </div>
        </div>
      )}
      <NewContractForm
        kind={kind}
        embedded={!showHeading}
        facilities={facs.map((f) => ({ id: f.id, name: f.name }))}
        leaseProps={kind === 'lease' ? leaseFormProps : undefined}
        depositProps={kind === 'deposit' ? depositFormProps : undefined}
      />
    </div>
  )
}
