import { eq } from 'drizzle-orm'
import { feeTypes, feeUnits } from '@/db'
import type { SeedModule } from './types'

const UNITS = ['người', 'xe', 'phòng', 'kg', 'lần']
const FEES: {
  name: string
  unit: string
  price: number
  billing: 'monthly_fixed' | 'per_occurrence'
  from: 'period_input' | 'occupants'
}[] = [
  { name: 'Phí dịch vụ', unit: 'người', price: 200_000, billing: 'monthly_fixed', from: 'occupants' },
  { name: 'Gửi xe máy', unit: 'xe', price: 100_000, billing: 'monthly_fixed', from: 'period_input' },
  { name: 'Internet', unit: 'phòng', price: 150_000, billing: 'monthly_fixed', from: 'period_input' },
  { name: 'Giặt ủi', unit: 'kg', price: 25_000, billing: 'per_occurrence', from: 'period_input' },
  { name: 'Dọn phòng thêm', unit: 'lần', price: 150_000, billing: 'per_occurrence', from: 'period_input' },
  { name: 'Nước theo người', unit: 'người', price: 80_000, billing: 'monthly_fixed', from: 'occupants' },
]

export const settingsSeed: SeedModule = {
  name: 'settings',
  async isSeeded({ db }) {
    return (await db.select({ id: feeTypes.id }).from(feeTypes).where(eq(feeTypes.isDemo, true)).limit(1)).length > 0
  },
  async run({ db, state }) {
    const unitIds: Record<string, string> = {}
    for (const name of UNITS) {
      const [u] = await db.insert(feeUnits).values({ name, isDemo: true }).returning()
      unitIds[name] = u.id
    }
    const typeIds: Record<string, string> = {}
    for (const f of FEES) {
      const [t] = await db
        .insert(feeTypes)
        .values({
          name: f.name,
          unitId: unitIds[f.unit],
          defaultPrice: f.price,
          billing: f.billing,
          quantityFrom: f.from,
          isDemo: true,
        })
        .returning()
      typeIds[f.name] = t.id
    }
    state.feeTypeIds = typeIds
  },
}
