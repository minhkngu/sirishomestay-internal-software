import { db } from '@/db/client'
import { RequirePermission } from '@/components/require-permission'
import { getAccessContext } from '@/server/session'
import { getSettings } from '@/server/settings/service'
import { listFacilities } from '@/server/facilities/service'
import { listFeeDefaults, listFeeTypes, listFeeUnits, listFeeTypePrices } from '@/server/fees/service'
import { SettingsTabs } from '@/features/settings/components/settings-tabs'

export default async function SettingsPage() {
  const ctx = await getAccessContext()
  return (
    <RequirePermission perm="settings">
      <Settings ctx={ctx} />
    </RequirePermission>
  )
}

async function Settings({ ctx }: { ctx: Awaited<ReturnType<typeof getAccessContext>> }) {
  const [settings, facilities, units, feeTypes, prices, defaults] = await Promise.all([getSettings(db), listFacilities(db, ctx), listFeeUnits(db, ctx), listFeeTypes(db, ctx, { includeArchived: true }), listFeeTypePrices(db, ctx), listFeeDefaults(db, ctx)])
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cài đặt</h1>
      <SettingsTabs defaults={defaults} settings={settings} units={units} feeTypes={feeTypes} prices={prices}
        facilities={facilities.map((f) => ({ id: f.id, code: f.code, name: f.name, address: f.address, expectedInvoiceDay: f.expectedInvoiceDay }))} />
    </div>
  )
}
