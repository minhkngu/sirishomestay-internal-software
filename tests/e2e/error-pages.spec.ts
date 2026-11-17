import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test('mở phòng không tồn tại → báo "Không tìm thấy", menu vẫn còn', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/rooms/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang này' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Hoá đơn' })).toBeVisible()
  await expect(page.getByText('Application error')).toHaveCount(0)
})
