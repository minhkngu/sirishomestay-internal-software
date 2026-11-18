import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}
async function openFirstLease(page: Page) {
  await page.goto('/contracts')
  return page.locator('tbody tr').filter({ has: page.locator('a[href^="/contracts/"]') }).first()
}

test('gia hạn tăng cọc: xem trước tiền, lưu, sổ cọc có khoản thu bổ sung', async ({ page }) => {
  await login(page, /^Admin/)
  const row = await openFirstLease(page)
  const term = (await row.innerText()).match(/\d{2}\/\d{2}\/\d{4}\s*–\s*(\d{2}\/\d{2}\/\d{4})/)![1]
  const [dd, mm, yyyy] = term.split('/')
  const newEnd = `${Number(yyyy) + 1}-${mm}-${dd}`
  await row.getByRole('button', { name: 'Sửa hợp đồng' }).click()
  const newDeposit = Number(await page.getByRole('dialog').getByLabel('Tiền cọc (VND)').inputValue()) + 1000000
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click()
  await row.getByRole('button', { name: 'Gia hạn hợp đồng' }).click()
  await page.getByLabel(/Ngày kết thúc mới/).fill(newEnd)
  await page.getByLabel(/Tiền cọc mới/).fill(String(newDeposit))
  await page.getByRole('button', { name: 'Xem trước tiền' }).click()
  await expect(page.getByText(/Sổ cọc: thu thêm/)).toBeVisible()
  await page.getByRole('button', { name: 'Lưu phụ lục' }).click()
  await expect(page.getByText('Đã lưu phụ lục')).toBeVisible()
  await row.locator('a[href^="/contracts/"]').first().click()
  await expect(page.getByRole('cell', { name: 'Thu bổ sung' }).first()).toBeVisible()
})

test('chuyển phòng và thanh lý: bước xem trước tiền không lưu gì', async ({ page }) => {
  await login(page, /^Admin/)
  const row = await openFirstLease(page)
  await row.getByRole('button', { name: 'Thanh lý hợp đồng' }).click()
  await page.getByRole('button', { name: 'Xem trước tiền' }).click()
  // thiếu chỉ số tại ngày trả phòng thì báo rõ, không tính tiền từ chỉ số thiếu
  await expect(page.getByText(/Nhập chỉ số|Hoá đơn thanh lý/).first()).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click()
  await row.locator('a[href^="/contracts/"]').first().click()
  await page.getByRole('button', { name: 'Chuyển phòng' }).click()
  await expect(page.getByLabel('Phòng mới (phòng trống)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu phụ lục' })).toBeDisabled()
})
