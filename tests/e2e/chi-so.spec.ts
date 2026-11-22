import { test, expect } from '@playwright/test'
import { chooseSelectOption } from './helpers'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
})

test('trang Chỉ số là một danh sách theo tháng, có nút Chốt chỉ số và Thêm đồng hồ', async ({ page }) => {
  const nav = page.getByRole('navigation').first()
  await expect(nav.getByRole('link', { name: 'Chỉ số', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Điện nước', exact: true })).toHaveCount(0)
  await page.goto('/meters')
  await expect(page.getByRole('heading', { name: 'Chỉ số', exact: true })).toBeVisible()
  await expect(page.getByLabel('Kỳ ghi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chốt chỉ số', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm đồng hồ' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Đồng hồ', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Lịch sử', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Chốt chỉ số', exact: true }).click()
  await expect(page.getByLabel('Tháng chốt')).toBeVisible()
  await expect(page.getByLabel('Toà chốt')).toBeVisible()
  await expect(page.getByLabel('Phòng chốt')).toBeVisible()
  await expect(page.getByLabel('Loại đồng hồ chốt')).toBeVisible()
})
