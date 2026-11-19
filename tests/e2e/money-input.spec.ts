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
