import { test, expect } from '@playwright/test'

test('menu lọc đóng khi bấm ra ngoài hoặc nhấn Esc', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/invoices?view=all')

  const details = page.locator('details').first()
  const summary = details.locator('summary')

  await summary.click()
  await expect(details).toHaveAttribute('open', '')

  await details.getByRole('checkbox').first().click()
  await expect(details).toHaveAttribute('open', '')

  await page.getByRole('heading', { name: 'Hoá đơn', exact: true }).click()
  await expect(details).not.toHaveAttribute('open', '')

  await summary.click()
  await expect(details).toHaveAttribute('open', '')
  await page.keyboard.press('Escape')
  await expect(details).not.toHaveAttribute('open', '')
  await expect(summary).toBeFocused()
})
