import { test, expect } from '@playwright/test'
import { createTempLease } from './helpers'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
test('gia hạn tăng cọc: xem trước tiền, lưu, sổ cọc có khoản thu bổ sung', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(await createTempLease(page))
  await page.getByRole('tab', { name: 'Tổng quan' }).click()
  const term = await page.getByText('Thời hạn hợp đồng', { exact: true }).locator('xpath=following-sibling::div[1]').innerText()
  const [dd, mm, yyyy] = term.split('–')[1].trim().split('/')
  const newEnd = `${Number(yyyy) + 1}-${mm}-${dd}`
  const depositText = await page.getByText('Tiền cọc giữ', { exact: true }).locator('xpath=following-sibling::div[1]').innerText()
  const newDeposit = Number(depositText.replace(/\D/g, '')) + 1000000
  await page.getByRole('tab', { name: 'Phụ lục' }).click()
  await page.getByRole('button', { name: 'Gia hạn hợp đồng' }).click()
  await page.getByLabel('Ngày hiệu lực').fill('2026-12-15')
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
  test.setTimeout(300_000)
  await page.goto(await createTempLease(page))
  await page.getByRole('tab', { name: 'Phụ lục' }).click()
  await page.getByRole('button', { name: 'Thanh lý hợp đồng' }).click()
  await page.getByLabel('Ngày trả phòng').fill('2026-12-10')
  await page.getByRole('button', { name: 'Xem trước tiền' }).click()
  // thiếu chỉ số tại ngày trả phòng thì báo rõ, không tính tiền từ chỉ số thiếu
  await expect(page.getByText(/Nhập chỉ số|Hoá đơn thanh lý/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Đóng' }).click()
  await page.getByRole('button', { name: 'Chuyển phòng' }).click()
  await expect(page.getByLabel('Phòng mới (phòng trống)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu phụ lục' })).toBeDisabled()
})
