import { eq } from 'drizzle-orm'
import { tenants } from '@/db'
import { addDays } from '@/domain/dates'
import { parseTenantInput, toTenantRow } from '@/modules/tenants/server/tenants/service'
import type { SeedModule } from './types'

const VISA_OFFSETS = [-5, 0, 3, 9, 16, 24, 29, 30, 45, 70, 120, 200, 260, 330]
const FOREIGN = [
  ['John Miller', 'Mỹ'],
  ['Emma Wilson', 'Anh'],
  ['Takeshi Yamada', 'Nhật Bản'],
  ['Kim Min-jun', 'Hàn Quốc'],
  ['Lars Svensson', 'Thuỵ Điển'],
  ['Marie Dubois', 'Pháp'],
  ['Hans Becker', 'Đức'],
  ['Olivia Brown', 'Úc'],
  ['Wang Wei', 'Trung Quốc'],
  ['Carlos Mendez', 'Tây Ban Nha'],
  ['Anna Rossi', 'Ý'],
  ['Pieter de Vries', 'Hà Lan'],
  ['Sophie Tremblay', 'Canada'],
  ['Raj Patel', 'Ấn Độ'],
]
const VN = [
  'Nguyễn Văn An',
  'Trần Thị Bình',
  'Lê Hoàng Cường',
  'Phạm Minh Đức',
  'Võ Thị Hoa',
  'Đặng Quốc Huy',
  'Bùi Thanh Lan',
  'Hồ Gia Khánh',
  'Ngô Thị Mai',
  'Dương Văn Nam',
  'Lý Thu Phương',
  'Đỗ Anh Quân',
]
const COMPANIES = [
  'Công ty TNHH Ánh Dương',
  'Công ty CP Công nghệ Sao Mai',
  'Công ty TNHH Thương mại Hải Âu',
  'Công ty CP Xây dựng Phú Gia',
]
// các kiểu nhập SĐT khác nhau để minh hoạ chuẩn hoá
const PHONE_STYLES = [
  (n: string) => `0${n}`,
  (n: string) => `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`,
  (n: string) => `+84 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`,
  (n: string) => `84${n}`,
  (n: string) => `0${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`,
]

export const tenantSeed: SeedModule = {
  name: 'tenants',
  async isSeeded({ db }) {
    return (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isDemo, true)).limit(1)).length > 0
  },
  async run({ db, rng, today, state }) {
    const codes = Object.keys(state.facilityIds)
    const home = (i: number) => state.facilityIds[codes[i % codes.length]]
    const ids: string[] = []
    const used = new Set<string>()
    const nationalNumber = () => {
      for (;;) {
        const n = `9${rng.int(0, 9)}${String(rng.int(0, 9999999)).padStart(7, '0')}`
        if (!used.has(n)) {
          used.add(n)
          return n
        }
      }
    }
    const insert = async (input: unknown) => {
      const row = toTenantRow(parseTenantInput(input))
      const [t] = await db
        .insert(tenants)
        .values({ ...row, id: rng.uuid(), isDemo: true })
        .returning()
      ids.push(t.id)
    }
    for (let i = 0; i < FOREIGN.length; i++) {
      const [name, nationality] = FOREIGN[i]
      await insert({
        kind: 'foreign',
        homeFacilityId: home(i),
        fullName: name,
        nationality,
        phone: `+${1 + (i % 9)}${String(4150000000 + i * 1111).padStart(10, '0')}`,
        passportNumber: `P${String(rng.int(1000000, 9999999))}`,
        passportExpiry: addDays(today, 400 + i * 30),
        visaType: i % 3 === 0 ? 'DN' : i % 3 === 1 ? 'LĐ' : 'TT',
        visaExpiry: addDays(today, VISA_OFFSETS[i]),
        email: `${name.split(' ')[0].toLowerCase()}@example.com`,
      })
    }
    for (let i = 0; i < VN.length; i++) {
      await insert({
        kind: 'vietnamese',
        homeFacilityId: home(i + 1),
        fullName: VN[i],
        phone: PHONE_STYLES[i % PHONE_STYLES.length](nationalNumber()),
        idNumber: `0${String(rng.int(10000000000, 99999999999))}`,
        idIssueDate: addDays(today, -1500 - i * 20),
        idIssuePlace: 'Cục Cảnh sát QLHC về TTXH',
        dateOfBirth: `${1985 + (i % 12)}-0${1 + (i % 9)}-1${i % 9}`,
        permanentAddress: `${10 + i} Lê Lợi, Quận ${1 + (i % 8)}, TP.HCM`,
      })
    }
    for (let i = 0; i < COMPANIES.length; i++) {
      await insert({
        kind: 'company',
        homeFacilityId: home(i),
        companyName: COMPANIES[i],
        taxCode: `03${String(rng.int(10000000, 99999999))}`,
        companyAddress: `${100 + i} Nguyễn Huệ, Quận 1, TP.HCM`,
        representative: VN[i],
        contactPerson: VN[i + 4],
        phone: i % 2 === 0 ? PHONE_STYLES[i](nationalNumber()) : '',
      })
    }
    state.tenantIds = ids
  },
}
