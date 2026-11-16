import { test, expect } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.skip(!email || !password, 'Cần E2E_EMAIL và E2E_PASSWORD (tài khoản quản trị trên Supabase dev)')

function isoPlusDays(n: number) {
  const d = new Date(Date.now() + n * 86400000)
  return d.toISOString().slice(0, 10)
}

test('đăng nhập → tạo cơ sở → tạo nhanh phòng → tạo khách → nhắc việc visa', async ({ page }) => {
  const stamp = Date.now().toString().slice(-6)
  const code = `E${stamp}`
  const guest = `Khách E2E ${stamp}`

  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mật khẩu').fill(password!)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()

  await page.goto('/facilities')
  await page.getByRole('button', { name: 'Thêm cơ sở' }).click()
  await page.getByLabel('Mã cơ sở').fill(code)
  await page.getByLabel('Tên cơ sở').fill(`Cơ sở ${code}`)
  await page.getByRole('button', { name: 'Lưu' }).click()
  await page.getByRole('link', { name: new RegExp(`Cơ sở ${code}`) }).click()

  await page.getByRole('button', { name: 'Tạo nhanh nhiều phòng' }).click()
  await page.getByLabel('Tầng').fill('1')
  await page.getByLabel('Từ số').fill('101')
  await page.getByLabel('Đến số').fill('103')
  await page.getByRole('button', { name: 'Tạo', exact: true }).click()
  await expect(page.getByText('Đã tạo 3 phòng')).toBeVisible()
  await expect(page.getByRole('link', { name: '103' })).toBeVisible()

  await page.goto('/tenants/new')
  await page.getByLabel('Cơ sở quản lý').selectOption({ label: `Cơ sở ${code}` })
  await page.getByLabel('Họ tên').fill(guest)
  await page.getByLabel('Số passport').fill(`E2E${stamp}`)
  await page.getByLabel('Hết hạn visa').fill(isoPlusDays(10))
  await page.getByLabel('Số điện thoại').fill(`+1415${stamp}0`)
  await page.getByRole('button', { name: 'Tạo khách' }).click()
  await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}/)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Visa sắp hết hạn' })).toBeVisible()
  await expect(page.getByText(guest)).toBeVisible()
})
