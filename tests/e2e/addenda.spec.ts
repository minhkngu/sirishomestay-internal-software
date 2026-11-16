import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}
async function openFirstLease(page: Page) {
  await page.goto('/contracts')
  await page.locator('a[href^="/contracts/"]').filter({ hasNotText: 'Tạo' }).first().click()
  await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: 'Phụ lục' }).click()
}

test('gia hạn tăng cọc: xem trước tiền, lưu, sổ cọc có khoản thu bổ sung', async ({ page }) => {
  await login(page, /^Admin/)
  await openFirstLease(page)
  await page.getByRole('tab', { name: 'Tổng quan' }).click()
  const term = await page.locator('dd').filter({ hasText: /\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}/ }).first().innerText()
  const [dd, mm, yyyy] = term.split('–')[1].trim().split('/')
  const newEnd = `${Number(yyyy) + 1}-${mm}-${dd}`
  const depositText = await page.locator('dt', { hasText: 'Tiền cọc' }).first().locator('xpath=following-sibling::dd[1]').innerText()
  const newDeposit = Number(depositText.replace(/\D/g, '')) + 1000000
  await page.getByRole('tab', { name: 'Phụ lục' }).click()
  await page.getByRole('button', { name: 'Gia hạn hợp đồng' }).click()
  await page.getByLabel(/Ngày kết thúc mới/).fill(newEnd)
  await page.getByLabel(/Tiền cọc mới/).fill(String(newDeposit))
  await page.getByRole('button', { name: 'Xem trước tiền' }).click()
  await expect(page.getByText(/Sổ cọc: thu thêm/)).toBeVisible()
  await page.getByRole('button', { name: 'Lưu phụ lục' }).click()
  await expect(page.getByText('Đã lưu phụ lục')).toBeVisible()
  await page.getByRole('tab', { name: 'Sổ cọc' }).click()
  await expect(page.getByRole('cell', { name: 'Thu bổ sung' }).first()).toBeVisible()
})

test('chuyển phòng và thanh lý: bước xem trước tiền không lưu gì', async ({ page }) => {
  await login(page, /^Admin/)
  await openFirstLease(page)
  await page.getByRole('button', { name: 'Thanh lý hợp đồng' }).click()
  await page.getByRole('button', { name: 'Xem trước tiền' }).click()
  // thiếu chỉ số tại ngày trả phòng thì báo rõ, không tính tiền từ chỉ số thiếu
  await expect(page.getByText(/Nhập chỉ số|Hoá đơn thanh lý/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Đóng' }).click()
  await page.getByRole('button', { name: 'Chuyển phòng' }).click()
  await expect(page.getByLabel('Phòng mới (phòng trống)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu phụ lục' })).toBeDisabled()
})
