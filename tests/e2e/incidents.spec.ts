import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test('báo sự cố từ trang phòng, chuyển sang Xong', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/facilities')
  await page.getByRole('link', { name: /Thảo Điền/ }).first().click()
  await page.locator('a[href^="/rooms/"]').first().click()
  await page.getByRole('link', { name: 'Báo sự cố' }).click()
  await page.waitForLoadState('networkidle')
  const title = `Sự cố thử ${Date.now()}`
  await page.getByLabel('Tiêu đề').fill(title)
  await page.getByRole('button', { name: 'Báo sự cố' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.goto('/incidents')
  const card = page.locator('div').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: 'Nhận xử lý' }) }).last()
  await card.getByRole('button', { name: 'Nhận xử lý' }).click()
  await expect(page.getByRole('heading', { name: /Đang xử lý/ })).toBeVisible()
  const inProgress = page.locator('section').filter({ has: page.getByRole('heading', { name: /Đang xử lý/ }) })
  await expect(inProgress.getByText(title)).toBeVisible()
  await inProgress.locator('div').filter({ hasText: title }).last().getByRole('button', { name: 'Hoàn tất' }).click()
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: /^Xong/ }) }).getByText(title)).toBeVisible()
})
