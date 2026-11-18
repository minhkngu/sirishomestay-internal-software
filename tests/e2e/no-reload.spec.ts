import { test, expect, type Page } from '@playwright/test'

// Đếm request tới server của trang (RSC / tài liệu), bỏ qua tài nguyên tĩnh.
function trackServerRequests(page: Page) {
  const requests: string[] = []
  page.on('request', (req) => {
    const h = req.headers()
    const isRsc = h['rsc'] === '1' || req.url().includes('_rsc=')
    // Tải nền (prefetch) khi link hiện ra không phải là lần tải trang do người dùng bấm
    const prefetch = h['next-router-prefetch'] === '1'
    if ((isRsc || req.resourceType() === 'document') && !prefetch) requests.push(`${req.method()} ${req.url()}`)
  })
  return {
    requests,
    reset: () => {
      requests.length = 0
    },
  }
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test.describe('không tải lại trang', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('quay lại tab đã mở không gọi server', async ({ page }) => {
    const track = trackServerRequests(page)
    const nav = page.getByRole('navigation')
    await nav.getByRole('link', { name: 'Khách thuê' }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await nav.getByRole('link', { name: 'Hợp đồng' }).click()
    await expect(page.getByRole('table')).toBeVisible()
    // Chờ các request tải nền của hai lần vào trang xong rồi mới đếm
    await page.waitForLoadState('networkidle')
    track.reset()
    await nav.getByRole('link', { name: 'Khách thuê' }).click()
    await expect(page).toHaveURL(/\/tenants/)
    await expect(page.getByRole('table')).toBeVisible()
    expect(track.requests).toEqual([])
  })

  test('lọc, tìm, đổi trang, đổi số dòng không gọi server', async ({ page }) => {
    await page.goto('/tenants')
    await expect(page.getByRole('table')).toBeVisible()
    const track = trackServerRequests(page)
    await page.getByPlaceholder('Tìm tên, SĐT, passport, CCCD…').fill('a')
    await page.getByRole('combobox', { name: /loại khách/i }).selectOption('foreign')
    await page.getByLabel('Số dòng').selectOption('30')
    const next = page.getByRole('button', { name: 'Trang sau' })
    if (await next.isEnabled()) await next.click()
    await page.waitForTimeout(800)
    expect(track.requests).toEqual([])
    expect(page.url()).toContain('kind=foreign')
  })

  test('bảng mặc định 15 dòng', async ({ page }) => {
    await page.goto('/contracts?view=active')
    const summary = page.getByText(/^1–\d+ trên \d+$/)
    await expect(summary).toBeVisible()
    const total = Number((await summary.textContent())!.match(/trên (\d+)/)![1])
    await expect(page.locator('tbody tr')).toHaveCount(Math.min(15, total))
  })

  test('link có sẵn bộ lọc dựng đúng ngay lần đầu', async ({ page }) => {
    await page.goto('/facilities')
    await page.getByRole('navigation').first().waitFor()
    const facilityId = await page.evaluate(async () => {
      const m = document.body.innerHTML.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
      return m?.[0] ?? null
    })
    expect(facilityId).not.toBeNull()
    await page.goto(`/contracts?view=expiring&toa=${facilityId},00000000-0000-0000-0000-000000000000`)
    await expect(page.getByRole('button', { name: /Sắp hết hạn/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Toà (1)')).toBeVisible()
  })

  test('tự lưu rồi quay lại thấy dữ liệu mới', async ({ page }) => {
    await page.goto('/tenants')
    const summary = page.getByText(/^(\d+–\d+|0) trên \d+$/)
    await expect(summary).toBeVisible()
    const before = Number((await summary.textContent())!.match(/trên (\d+)/)![1])
    const name = `Khach E2E ${Date.now()}`
    await page.goto('/tenants/new')
    await page.getByLabel('Họ tên').fill(name)
    await page.getByLabel('Số passport').fill(`E2E${Date.now()}`)
    await page.getByLabel('Số điện thoại').fill(`+1415${String(Date.now()).slice(-7)}`)
    await page.getByRole('button', { name: 'Tạo khách' }).click()
    await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}/)
    await page.getByRole('navigation').getByRole('link', { name: 'Khách thuê' }).click()
    await expect(page.getByText(new RegExp(`trên ${before + 1}$`))).toBeVisible()
    await page.getByPlaceholder('Tìm tên, SĐT, passport, CCCD…').fill(name.toLowerCase())
    await expect(page.getByText(name)).toBeVisible()
  })
})
