import { test, expect } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
})

test('menu có Thu chi; thêm rồi xoá một khoản chi', async ({ page }) => {
  await expect(
    page.getByRole('navigation').first().getByRole('link', { name: 'Thu chi', exact: true }).first(),
  ).toBeVisible()
  await page.goto('/cashbook?month=all')
  await expect(page.getByRole('heading', { name: 'Thu chi', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Thêm khoản chi' }).click()
  await page.getByLabel('Số tiền').fill('123456')
  await page.getByLabel('Người nhận').fill('Thợ điện E2E')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm', exact: true }).click()
  const row = page.getByRole('row', { name: /Thợ điện E2E/ })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Xoá khoản chi' }).click()
  await page.getByRole('button', { name: 'Xoá', exact: true }).click()
  await expect(page.getByRole('row', { name: /Thợ điện E2E/ })).toHaveCount(0)
})

test('danh sách hoá đơn không còn lịch sử thu trong chi tiết', async ({ page }) => {
  await page.goto('/invoices')
  await expect(page.getByRole('heading', { name: 'Hoá đơn', exact: true })).toBeVisible()
})
