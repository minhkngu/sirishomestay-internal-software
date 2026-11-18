import { expect, type Page } from '@playwright/test'

/**
 * Chỉ số đồng hồ luôn lớn hơn chỉ số mọi lần chạy trước (môi trường thử dùng chung, chỉ số chỉ được tăng).
 * Tính theo giây nên vẫn nằm trong giới hạn số nguyên 32 bit.
 */
export const meterValue = () => Math.floor(Date.now() / 1000)

/** Phí mặc định theo đồng hồ (vd. Điện) được tự thêm vào form hợp đồng và đòi chỉ số ban đầu: điền cho mọi ô còn trống. */
export async function fillMeterReadings(page: Page) {
  const inputs = page.getByLabel(/^Chỉ số ban đầu /)
  for (let i = 0; i < await inputs.count(); i++) if (!(await inputs.nth(i).inputValue())) await inputs.nth(i).fill(String(meterValue()))
}

/** Đăng nhập Admin, tạo một phòng tạm ở Thảo Điền rồi tạo hợp đồng thuê mới (từ 01/12/2026, 12 tháng); trả về địa chỉ trang hợp đồng. */
export async function createTempLease(page: Page): Promise<string> {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/facilities')
  await page.getByRole('link', { name: /Thảo Điền/ }).first().click()
  await page.getByRole('button', { name: 'Tạo nhanh nhiều phòng' }).click()
  const prefix = `E2E${Date.now()}${Math.floor(Math.random() * 1000)}-`
  await page.getByLabel('Tiền tố mã (tuỳ chọn)').fill(prefix)
  await page.getByLabel('Tầng', { exact: true }).fill('9')
  await page.getByLabel('Từ số').fill('901')
  await page.getByLabel('Đến số').fill('901')
  await page.getByRole('button', { name: 'Tạo', exact: true }).click()
  await expect(page.getByText('Đã tạo 1 phòng', { exact: true })).toBeVisible()
  await page.goto('/contracts/new')
  const room = page.locator('#room option').filter({ hasText: `${prefix}901` })
  await expect(room).toHaveCount(1)
  await page.locator('#room').selectOption((await room.getAttribute('value'))!)
  const tenant = page.locator('#tenant option').filter({ hasText: 'Nguyễn Văn An' }).first()
  await page.locator('#tenant').selectOption((await tenant.getAttribute('value'))!)
  await page.getByLabel('Ngày bắt đầu').fill('2026-12-01')
  await page.getByRole('button', { name: '+12 tháng' }).click()
  await page.getByLabel('Giá thuê tháng (VND)').fill('9000000')
  await page.getByLabel('Tiền cọc (VND)').fill('5000000')
  await fillMeterReadings(page)
  await page.getByRole('button', { name: 'Tạo hợp đồng thuê' }).click()
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+$/, { timeout: 60_000 })
  return page.url()
}
