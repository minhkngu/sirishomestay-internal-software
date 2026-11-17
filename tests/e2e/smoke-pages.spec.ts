import { test, expect } from '@playwright/test'
import { NAV_ITEMS } from '../../src/components/app-shell/nav'

for (const { href, label } of NAV_ITEMS) {
  test(`mở ${label} và trang chi tiết không gặp lỗi`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/login')
    await page.getByRole('button', { name: /^Admin/ }).click()
    await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
    await page.goto(href)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/Application error|Trang này đang gặp lỗi/)).toHaveCount(0)
    const links = await page.locator('main a[href]').all()
    for (const link of links) {
      const target = await link.getAttribute('href')
      if (target && /^\/[a-z-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:[?#].*)?$/i.test(target)) {
        await page.goto(target)
        await page.waitForLoadState('networkidle')
        await expect(page.getByText(/Application error|Trang này đang gặp lỗi/)).toHaveCount(0)
        break
      }
    }
    expect(errors).toEqual([])
  })
}

test('khung Bạc hà bỏ bộ chọn cũ và hiển thị mục đang chọn', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await expect(page.getByLabel('Chọn cơ sở')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Nhắc việc' })).toHaveAttribute('aria-current', 'page')
})
