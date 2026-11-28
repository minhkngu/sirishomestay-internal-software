import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}
const cell = (page: Page, text: RegExp | string) => page.locator('a[href^="/rooms/"]').filter({ hasText: text })

test('Admin tạo nhanh phòng từ trang Phòng, ô mới màu xám và không có khung hover', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/rooms')
  await page.getByRole('button', { name: 'Tạo nhanh nhiều phòng' }).click()
  await page.getByLabel('Cơ sở').click()
  await page.getByRole('option', { name: 'Thảo Điền' }).click()
  const prefix = `E2E${Date.now()}-`
  await page.getByLabel('Tiền tố mã (tuỳ chọn)').fill(prefix)
  await page.getByLabel('Tầng', { exact: true }).fill('9')
  await page.getByLabel('Từ số').fill('901')
  await page.getByLabel('Đến số').fill('902')
  await page.getByRole('button', { name: 'Tạo', exact: true }).click()
  await expect(page.getByText('Đã tạo 2 phòng', { exact: true })).toBeVisible()
  const created = cell(page, `${prefix}901`)
  await expect(created).toBeVisible()
  await expect(created).toHaveClass(/bg-muted/)
  await created.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('Admin rê chuột vào phòng đang có khách thấy giá thuê, đã cọc, hết hạn', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/rooms')
  await expect(page.getByText(/phòng trống \/ \d+ phòng/)).toBeVisible()
  const occupied = cell(page, /Đang ở|Sắp trả/).first()
  await expect(occupied).toHaveClass(/emerald/)
  await occupied.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip.getByText('Giá thuê')).toBeVisible()
  await expect(tip.getByText('Đã cọc')).toBeVisible()
  await expect(tip.getByText('Hết hạn')).toBeVisible()
})

test('Hùng chỉ xem trạng thái: hover không lộ giá thuê hay tên khách', async ({ page }) => {
  await login(page, /^Hùng/)
  await page.goto('/rooms')
  const occupied = cell(page, /Đang ở|Sắp trả/).first()
  await expect(occupied).toBeVisible()
  await occupied.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(page.getByText('Giá thuê')).toHaveCount(0)
})
