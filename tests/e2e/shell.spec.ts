import { test, expect } from '@playwright/test'

test('mở / thấy dải "Bản xem thử"', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Bản xem thử')).toBeVisible()
})

test('trên điện thoại menu mở được bằng nút ☰', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Hoá đơn' })).toBeHidden()
  await page.getByRole('button', { name: 'Mở menu' }).click()
  await expect(page.getByRole('link', { name: 'Hoá đơn' })).toBeVisible()
})
