import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')

async function login(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test.describe('thao tác thêm mới hiện popup, không tải trang mới', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('tạo hợp đồng thuê từ trang khách hiện popup, F5 ra trang đầy đủ, Esc quay lại', async ({ page }) => {
    await page.goto('/tenants')
    await page.locator('a[href^="/tenants/"]:not([href="/tenants/new"])').first().click()
    await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}$/)
    const tenantUrl = page.url()
    await page.getByRole('link', { name: '+ Tạo hợp đồng thuê' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page).toHaveURL(/\/contracts\/new\?tenant=/)
    await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Tạo hợp đồng thuê' })).toBeVisible()
    await page.goto(tenantUrl)
    await page.getByRole('link', { name: '+ Tạo hợp đồng thuê' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(tenantUrl)
  })

  test('Thêm khách hiện popup, tạo xong sang trang khách', async ({ page }) => {
    await page.goto('/tenants')
    await page.getByRole('link', { name: 'Thêm khách' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Tạo khách' }).click()
    await expect(page.getByRole('dialog')).toBeVisible() // lỗi kiểm tra: popup ở lại
    await expect(page).toHaveURL(/\/tenants\/new$/)
    await page.getByLabel('Họ tên').fill(`Khach E2E ${Date.now()}`)
    await page.getByLabel('Số passport').fill(`E2E${Date.now()}`)
    await page.getByLabel('Số điện thoại').fill(`+1415${String(Date.now()).slice(-7)}`)
    await page.getByRole('button', { name: 'Tạo khách' }).click()
    await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}/)
  })

  test('Thêm người dùng hiện popup; mở thẳng /users/new ra trang đầy đủ', async ({ page }) => {
    await page.goto('/users')
    await page.getByRole('link', { name: 'Thêm người dùng' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/users$/)
    await page.goto('/users/new')
    await expect(page.getByRole('heading', { name: 'Thêm người dùng' })).toBeVisible()
  })

  test('Báo sự cố từ trang phòng hiện popup và giữ ?room=', async ({ page }) => {
    await page.goto('/facilities')
    await page.getByRole('link', { name: /Thảo Điền/ }).first().click()
    await page.locator('a[href^="/rooms/"]').first().click()
    await page.getByRole('link', { name: 'Báo sự cố' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page).toHaveURL(/\/incidents\/new\?room=/)
    const title = `Sự cố thử ${Date.now()}`
    await page.getByLabel('Tiêu đề').fill(title)
    await page.getByRole('dialog').getByRole('button', { name: 'Báo sự cố' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  })

  test('Thêm phòng hiện popup, tạo xong đóng popup và ô phòng mới hiện ở danh sách', async ({ page }) => {
    await page.goto('/rooms')
    await page.getByRole('button', { name: 'Tạo nhanh nhiều phòng' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('Cơ sở').selectOption({ label: 'Thảo Điền' })
    const prefix = `E2E${Date.now()}-`
    await page.getByLabel('Tiền tố mã (tuỳ chọn)').fill(prefix)
    await page.getByLabel('Tầng', { exact: true }).fill('9')
    await page.getByLabel('Từ số').fill('901')
    await page.getByLabel('Đến số').fill('901')
    await page.getByRole('button', { name: 'Tạo', exact: true }).click()
    await expect(page.getByText('Đã tạo 1 phòng', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('a[href^="/rooms/"]').filter({ hasText: `${prefix}901` })).toBeVisible()
  })

  test('Thêm loại phí hiện popup, tạo xong thẻ phí hiện ở danh sách', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Phí dịch vụ' }).click()
    await page.getByRole('button', { name: 'Thêm loại phí' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const feeName = `Phí popup E2E ${Date.now()}`
    await page.getByPlaceholder('Tên loại phí').fill(feeName)
    await page.getByPlaceholder('Đơn giá mặc định').fill('18000')
    await page.getByLabel('Số lượng lấy từ').selectOption('room')
    await page.getByRole('button', { name: 'Tạo loại phí' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('article', { name: feeName })).toBeVisible()
  })
})
