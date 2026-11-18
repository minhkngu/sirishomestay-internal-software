import { test, expect } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
})

test('menu Chỉ số và trang có hai tab Ghi chỉ số, Đồng hồ', async ({ page }) => {
  const nav = page.getByRole('navigation').first()
  await expect(nav.getByRole('link', { name: 'Chỉ số', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Điện nước', exact: true })).toHaveCount(0)
  await page.goto('/meters')
  await expect(page.getByRole('heading', { name: 'Chỉ số', exact: true })).toBeVisible()
  await expect(page.getByLabel('Kỳ')).toBeVisible()
  await page.getByRole('link', { name: 'Đồng hồ', exact: true }).click()
  await expect(page).toHaveURL(/tab=meters/)
  await expect(page.getByLabel('Kỳ')).toHaveCount(0)
  await page.getByLabel('Cơ sở', { exact: true }).selectOption({ label: 'Thảo Điền' })
  await page.getByRole('button', { name: 'Xem đồng hồ' }).click()
  await expect(page.getByRole('columnheader', { name: 'Dòng phí' })).toBeVisible()
  await expect(page.getByRole('row').nth(1)).toContainText(/Điện|Nước|\(/)
})

test('tab Cài đặt theo thứ tự và không còn Đơn giá điện nước', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('tab').first()).toBeVisible()
  expect(await page.getByRole('tab').allInnerTexts()).toEqual(['Chung', 'Cơ sở', 'Phí dịch vụ', 'Tài khoản nhận tiền'])
  await expect(page.getByRole('tab', { name: 'Đơn giá điện nước' })).toHaveCount(0)
})
