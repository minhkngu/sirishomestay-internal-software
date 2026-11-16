import { test, expect, type Page } from '@playwright/test'
import { buildXlsx, TENANT_HEADERS } from '../fixtures/build'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test('nhập Excel khách mẫu: xem trước có dòng lỗi, nhập các dòng hợp lệ, nhập lại không tạo trùng', async ({ page }) => {
  await login(page, /^Admin/)
  const n = Date.now()
  const buffer = Buffer.from(await buildXlsx({
    Khách: [
      TENANT_HEADERS,
      ['Nước ngoài', 'TD', `Import ${n} A`, `+1415${String(n).slice(-7)}`, `E2E${n}`, '05/03/2027', null, null, null],
      ['Việt Nam', 'TD', `Import ${n} B`, `09${String(n).slice(-8)}`, null, null, `${String(n).slice(-12).padStart(12, '0')}`, null, null],
      ['Hành tinh lạ', 'TD', 'Dòng lỗi', null, null, null, null, null, null],
    ],
  }))
  const file = { name: 'khach.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer }
  async function runOnce() {
    await page.goto('/import'); await page.waitForLoadState('networkidle')
    await page.locator('input[type=file]').setInputFiles(file)
    await page.getByRole('button', { name: 'Xem trước' }).click()
    await expect(page.getByText(/2 dòng hợp lệ · 1 lỗi/)).toBeVisible()
    await expect(page.getByText('Loại khách không hợp lệ', { exact: false })).toBeVisible()
  }
  await runOnce()
  await page.getByRole('button', { name: 'Nhập 2 dòng hợp lệ' }).click()
  await expect(page.getByText('Đã nhập xong: tạo mới 2, cập nhật 0.')).toBeVisible()
  await runOnce()
  await page.getByRole('button', { name: 'Nhập 2 dòng hợp lệ' }).click()
  await expect(page.getByText('Đã nhập xong: tạo mới 0, cập nhật 0.')).toBeVisible()
})
