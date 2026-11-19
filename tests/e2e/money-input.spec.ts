import { test, expect } from '@playwright/test'

test('ô tiền tự thêm dấu chấm khi gõ và dán', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/contracts/new')

  const rent = page.getByLabel('Giá thuê tháng (VND)')
  await rent.fill('15000000')
  await expect(rent).toHaveValue('15.000.000')

  await rent.press('End')
  await rent.press('0')
  await expect(rent).toHaveValue('150.000.000')

  await rent.press('Backspace')
  await expect(rent).toHaveValue('15.000.000')

  await rent.fill('9000000')
  await rent.evaluate((el) => (el as HTMLInputElement).setSelectionRange(2, 2))
  await page.keyboard.type('1')
  await expect(rent).toHaveValue('91.000.000')
  await expect.poll(() => rent.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(2)

  await rent.fill('')
  await rent.evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', '15.000.000')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(rent).toHaveValue('15.000.000')
})

test('đơn giá dòng hoá đơn nhập được số âm', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/invoices?view=draft')
  const link = page.locator('main a[href^="/invoices/"]').filter({ hasText: /HD/ }).first()
  test.skip((await link.count()) === 0, 'Cần hoá đơn nháp')
  await link.click()
  await page.getByRole('button', { name: 'Thêm dòng' }).click()

  const row = page.locator('tbody tr').last()
  await row.locator('td').nth(1).locator('input').fill('Kiểm thử số âm')
  const price = row.locator('td').nth(3).locator('input')
  await price.clear()
  await price.press('-')
  await expect(price).toHaveValue('-')
  await price.pressSequentially('500000')
  await expect(price).toHaveValue('-500.000')
  await expect(row.locator('td').nth(4)).toHaveText('-500.000')
})
