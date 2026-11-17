import { test, expect } from '@playwright/test'
import { NAV_ITEMS } from '../../src/components/app-shell/nav'

test('đo thời gian tải các trang', async ({ page }) => {
  test.setTimeout(600_000)
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()

  const measurements: { trang: string; lan: number; ttfb_ms: number; tai_xong_ms: number }[] = []
  for (const { href, label } of NAV_ITEMS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(href, { waitUntil: 'load' })
      if (new URL(page.url()).pathname !== href) throw new Error(`Không đo được ${href}: trang chuyển hướng tới ${page.url()}`)
      const timing = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return { ttfb_ms: Math.round(entry.responseStart - entry.requestStart), tai_xong_ms: Math.round(entry.loadEventEnd) }
      })
      measurements.push({ trang: label, lan: attempt, ...timing })
    }
  }
  console.table(measurements)
})
