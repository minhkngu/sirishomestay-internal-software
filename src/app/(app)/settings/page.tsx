import { db } from '@/db/client'
import { RequirePermission } from '@/modules/platform'
import { getAccessContext } from '@/modules/platform'
import { getSettings } from '@/modules/platform'
import { listFacilities } from '@/modules/facilities'
import { listAmenities } from '@/modules/facilities'
import { listFeeDefaults, listFeeTypes, listFeeUnits, listFeeTypePrices } from '@/modules/facilities'
import { listMeterTypes } from '@/modules/meters'
import { SettingsTabs } from './settings-tabs'

export default async function SettingsPage() {
  const ctx = await getAccessContext()
  return (
    <RequirePermission perm="settings">
      <Settings ctx={ctx} />
    </RequirePermission>
  )
}

async function Settings({ ctx }: { ctx: Awaited<ReturnType<typeof getAccessContext>> }) {
  const [settings, facilities, units, feeTypes, prices, defaults, amenities, meterTypes] = await Promise.all([
    getSettings(db),
    listFacilities(db, ctx),
    listFeeUnits(db),
    listFeeTypes(db, ctx, { includeArchived: true }),
    listFeeTypePrices(db, ctx),
    listFeeDefaults(db, ctx),
    listAmenities(db, ctx, { includeArchived: true }),
    listMeterTypes(db),
  ])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cài đặt</h1>
      <SettingsTabs
        meterTypes={meterTypes.map((t) => ({ id: t.id, name: t.name, unit: t.unit, isSystem: t.isSystem }))}
        amenities={amenities.map((a) => ({ id: a.id, name: a.name, isActive: a.isActive }))}
        defaults={defaults}
        settings={settings}
        units={units}
        feeTypes={feeTypes}
        prices={prices}
        facilities={facilities.map((f) => ({ id: f.id, name: f.name }))}
      />
    </div>
  )
}
