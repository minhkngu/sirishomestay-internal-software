import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test('Hùng xem trạng thái phòng mà không thấy tên khách hay tiền', async ({ page }) => {
  await login(page, /^Hùng/)
  await page.goto('/facilities')
  await page.getByRole('link', { name: /Bình Thạnh/ }).first().click()
  const occupied = page.locator('a[href^="/rooms/"]').filter({ hasText: /Đang ở|Sắp trả/ }).first()
  await expect(occupied).toBeVisible()
  await occupied.click()
  await expect(page.getByText('Trạng thái', { exact: true })).toBeVisible()
  await expect(page.getByText('Thông tin thanh toán')).toHaveCount(0)
  await expect(page.getByText('Người ở:', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Hợp đồng', exact: true })).toHaveCount(0)
})

test('nhập và chuyển vật tư theo số lượng', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/assets')
  const uniqueName = `Bóng đèn thử ${Date.now()}`
  await page.getByLabel('Tên vật tư').fill(uniqueName)
  await page.getByLabel('Đơn vị', { exact: true }).fill('cái')
  await page.getByLabel('Loại vật tư').fill('Điện')
  await page.getByRole('button', { name: 'Thêm vật tư' }).click()
  await expect(page.getByRole('row').filter({ hasText: uniqueName })).toBeVisible()
  const itemOption = page.getByLabel('Vật tư', { exact: true }).locator('option').filter({ hasText: uniqueName })
  await page.getByLabel('Vật tư', { exact: true }).selectOption((await itemOption.getAttribute('value'))!)
  await page.getByLabel('Vị trí đích').selectOption({ label: 'Kho' })
  await page.getByLabel('Số lượng').fill('20')
  await page.getByRole('button', { name: 'Lưu', exact: true }).last().click()
  await expect(page.getByRole('row').filter({ hasText: uniqueName })).toContainText('20')
  await page.getByLabel('Thao tác').selectOption('move')
  await page.getByLabel('Vị trí nguồn').selectOption({ label: 'Kho' })
  const target = page.getByLabel('Vị trí đích')
  const roomValue = await target.locator('option').filter({ hasText: 'Phòng' }).first().getAttribute('value')
  expect(roomValue).toBeTruthy()
  await target.selectOption(roomValue!)
  await page.getByLabel('Số lượng').fill('3')
  await page.getByRole('button', { name: 'Lưu', exact: true }).last().click()
  await expect(page.getByRole('row').filter({ hasText: uniqueName }).filter({ hasText: 'Kho' })).toContainText('17')
  await expect(page.getByRole('row').filter({ hasText: uniqueName }).filter({ hasText: 'Phòng' })).toContainText('3')
})
