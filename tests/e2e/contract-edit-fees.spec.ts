import { test, expect } from '@playwright/test'
import postgres from 'postgres'

test.skip(!process.env.E2E_BASE_URL, 'Cần môi trường thử có dữ liệu mẫu')
test.skip(process.env.E2E_ISOLATED !== '1' || !process.env.E2E_DATABASE_URL, 'Cần PostgreSQL demo cô lập')

const LEASE_ID = '99999999-9999-4999-8999-999999999999'
const METER_ID = '88888888-8888-4888-8888-888888888888'
const FEE_ID = '77777777-7777-4777-8777-777777777777'

async function openModal(page: import('@playwright/test').Page) {
  await page.goto('/contracts')
  const row = page.locator('tbody tr').filter({ hasText: 'HD-PHI-TEST' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Sửa hợp đồng' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  return modal
}

test.describe('sửa phí và chỉ số đầu trong popup hợp đồng', () => {
  let sql: ReturnType<typeof postgres>
  test.beforeEach(async () => {
    const url = new URL(process.env.E2E_DATABASE_URL!)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Kiểm thử chỉ được chạy với PostgreSQL cục bộ cô lập')
    sql = postgres(process.env.E2E_DATABASE_URL!, { prepare: false })
    await sql`delete from lease_fee_meters where lease_fee_id = ${FEE_ID}`
    await sql`delete from lease_fee_snapshots where id = ${FEE_ID}`
    await sql`delete from leases where id = ${LEASE_ID}`
    await sql`delete from meters where id = ${METER_ID}`
    const room = await sql<{ id: string; tenant_id: string }[]>`
      insert into leases (id, code, room_id, tenant_id, start_date, end_date, monthly_rent, deposit_amount)
      select ${LEASE_ID}, 'HD-PHI-TEST', r.id, t.id, '2026-01-01', '2026-12-31', 1000000, 0
      from rooms r
      join facilities f on f.id = r.facility_id
      join tenants t on t.home_facility_id = f.id
      where f.code = 'TD' and r.is_active
        and not exists (select 1 from leases l where l.room_id = r.id and l.status = 'active')
      limit 1
      returning room_id, tenant_id`
    test.skip(room.length === 0, 'Cần phòng trống ở Thảo Điền và một khách của toà')
    await sql`insert into meters (id, room_id, utility, name, code, installed_on, start_reading, is_demo)
      values (${METER_ID}, ${room[0].id}, 'electric', 'Điện', 'DH-PHI-E2E', '2026-01-01', 0, true)`
    await sql`insert into lease_fee_snapshots (id, lease_id, name, unit, quantity_source, quantity, billing, unit_price)
      values (${FEE_ID}, ${LEASE_ID}, 'Điện', 'kWh', 'meter', 1, 'per_occurrence', 3500)`
    await sql`insert into lease_fee_meters (lease_fee_id, meter_id) values (${FEE_ID}, ${METER_ID})`
    await sql`insert into meter_readings (meter_id, period, kind, read_on, value, is_demo)
      values (${METER_ID}, '2026-01', 'handover', '2026-01-01', 1250, true)`
  })
  test.afterEach(async () => {
    await sql`delete from lease_fee_meters where lease_fee_id = ${FEE_ID}`
    await sql`delete from lease_fee_snapshots where id = ${FEE_ID}`
    await sql`delete from leases where id = ${LEASE_ID}`
    await sql`delete from meters where id = ${METER_ID}`
    await sql.end()
  })

  test('hiện đủ phí như form tạo và sửa được chỉ số đầu', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^Admin/ }).click()
    await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
    const modal = await openModal(page)
    await expect(modal.getByText('Điện · kWh')).toBeVisible()
    await expect(modal.getByText('Theo đồng hồ')).toBeVisible()
    await expect(modal.getByLabel('Đơn giá Điện')).toHaveValue('3.500')
    await expect(modal.getByLabel('Chỉ số đầu Điện')).toHaveValue('1250')
    await expect(modal.getByText('chốt 01/01/2026')).toBeVisible()
    await expect(modal.getByText('Hoá đơn đã lập giữ nguyên số cũ')).toBeVisible()

    await modal.getByLabel('Chỉ số đầu Điện').fill('1300')
    await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(modal).toBeHidden()
    const [row] = await sql`select value from meter_readings where meter_id = ${METER_ID} and kind = 'handover'`
    expect(row.value).toBe(1300)
    await page.goto(`/contracts/${LEASE_ID}`)
    await expect(page.getByText(/Chỉ số đầu\s*1\.300/)).toBeVisible()
  })

  test('người chỉ có quyền hợp đồng thấy số nhưng không thấy ô sửa đồng hồ, chỉ số', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^Lan/ }).click()
    await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
    const modal = await openModal(page)
    await expect(modal.getByLabel('Đơn giá Điện')).toHaveValue('3.500')
    await expect(modal.getByLabel('Đồng hồ Điện')).toHaveCount(0)
    await expect(modal.getByLabel('Chỉ số đầu Điện')).toHaveCount(0)
    await expect(modal.getByText('1.250')).toBeVisible()
  })
})
