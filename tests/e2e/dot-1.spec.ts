import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')

async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test('Admin đăng nhập nhanh và tìm khách không dấu', async ({ page }) => {
  await login(page, /^Admin/)
  await expect(page.getByText('Môi trường thử — dữ liệu giả')).toBeVisible()
  await page.goto('/tenants')
  await page.getByPlaceholder('Tìm tên, SĐT, passport, CCCD…').fill('nguyen van an')
  await expect(page).toHaveURL(/q=nguyen\+van\+an/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Nguyễn Văn An' })).toBeVisible()
})

test('Hùng không thể mở trực tiếp trang khách thuê', async ({ page }) => {
  await login(page, /^Hùng/)
  await page.goto('/tenants')
  await expect(page.getByRole('heading', { name: 'Không tìm thấy' })).toBeVisible()
})

test('Admin thêm quyền cho Vy và khôi phục sau khi kiểm tra', async ({ browser }) => {
  const adminContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL })
  const vyContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL })
  const admin = await adminContext.newPage()
  const vy = await vyContext.newPage()
  await login(admin, /^Admin/)
  await admin.goto('/users')
  await admin.getByRole('link', { name: /Vy —/ }).click()
  const billing = admin.getByRole('checkbox', { name: /Hoá đơn & thu tiền/ })
  const wasChecked = await billing.isChecked()
  try {
    expect(wasChecked, 'Quyền hoá đơn của Vy phải tắt trước khi kiểm thử').toBe(false)
    await billing.check()
    await admin.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(admin).toHaveURL(/\/users$/)
    await login(vy, /^Vy/)
    await expect(vy.getByRole('link', { name: 'Hoá đơn', exact: true })).toBeVisible()
  } finally {
    await admin.goto('/users')
    await admin.getByRole('link', { name: /Vy —/ }).click()
    await admin.getByRole('checkbox', { name: /Hoá đơn & thu tiền/ }).setChecked(wasChecked)
    await admin.getByRole('button', { name: 'Lưu', exact: true }).click()
    await expect(admin).toHaveURL(/\/users$/)
    await adminContext.close()
    await vyContext.close()
  }
})

test('Admin tạo nhanh phòng 501–503', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/facilities')
  await page.getByRole('link', { name: /Thảo Điền/ }).first().click()
  await page.getByRole('button', { name: 'Tạo nhanh nhiều phòng' }).click()
  const prefix = `E2E${Date.now()}-`
  await page.getByLabel('Tiền tố mã (tuỳ chọn)').fill(prefix)
  await page.getByLabel('Tầng', { exact: true }).fill('5')
  await page.getByLabel('Từ số').fill('501')
  await page.getByLabel('Đến số').fill('503')
  await page.getByRole('button', { name: 'Tạo', exact: true }).click()
  await expect(page.getByText('Đã tạo 3 phòng', { exact: true })).toBeVisible()
  for (const room of ['501', '502', '503']) await expect(page.getByText(`${prefix}${room}`, { exact: true }).first()).toBeVisible()
})

test('Khách nước ngoài báo trùng điện thoại rồi lưu số khác', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/tenants/new')
  await page.getByLabel('Họ tên', { exact: true }).fill(`Khách thử ${Date.now()}`)
  await page.getByLabel('Quốc tịch').fill('Mỹ')
  await page.getByLabel('Số passport').fill(`TEST${Date.now()}`)
  await page.getByLabel('Số điện thoại', { exact: true }).fill('+1 415 000 0000')
  await page.getByRole('button', { name: 'Tạo khách' }).click()
  await expect(page.getByText(/đã thuộc về khách khác/i).first()).toBeVisible()
  await page.getByLabel('Số điện thoại', { exact: true }).fill(`+1${String(Date.now()).slice(-10)}`)
  await page.getByRole('button', { name: 'Tạo khách' }).click()
  await expect(page).toHaveURL(/\/tenants\/[a-f0-9-]+$/)
})
