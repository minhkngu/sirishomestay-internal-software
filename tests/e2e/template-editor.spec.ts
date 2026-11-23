import { test, expect, type Page } from '@playwright/test'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')

async function login(page: Page, name: RegExp) {
  await page.goto('/login')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
}

test('soạn mẫu hợp đồng thuê: gõ chữ, chèn chip, kéo thả chip, chọn kiểu, xem trước PDF, lưu', async ({
  page,
  context,
}) => {
  await login(page, /^Admin/)
  await page.goto('/templates')
  await page.waitForLoadState('networkidle')

  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Hợp đồng thuê', exact: true }) })
  await section.getByRole('button', { name: 'Soạn mẫu mới' }).click()
  const dialog = page.getByRole('dialog')
  const name = `Mẫu thử ${Date.now()}`
  await dialog.getByLabel('Tên mẫu').fill(name)

  const editor = dialog.getByLabel('Nội dung mẫu')
  await editor.locator('p').first().click() // đoạn đầu tiên (mẫu khởi đầu bắt đầu bằng tiêu đề, sau đó là các đoạn chỗ điền)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Khách thuê: ')
  // bấm chip "Họ tên khách"
  const palette = dialog.getByLabel('Bảng chỗ điền')
  await palette.getByRole('button', { name: /^Họ tên khách/ }).click()
  await expect(editor.locator('span[data-field="ten_khach"]').last()).toBeVisible()

  // kéo chip "Giá thuê tháng" từ bảng thả vào đoạn văn vừa gõ
  const target = editor.locator('p', { hasText: 'Khách thuê:' }).last()
  await palette.getByRole('button', { name: /^Giá thuê tháng$/ }).dragTo(target)
  await expect(editor.locator('span[data-field="gia_thue"]').last()).toBeVisible()

  await dialog.getByRole('button', { name: 'Hiện đại' }).click()
  await expect(dialog.getByRole('button', { name: 'Hiện đại' })).toHaveAttribute('aria-pressed', 'true')

  // xem trước PDF mở popup có khung xem, không mở tab mới
  await dialog.getByRole('button', { name: 'Xem trước PDF' }).click()
  const viewer = page.getByRole('dialog', { name: 'Xem trước mẫu' })
  await expect(viewer.locator('iframe')).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByRole('alert')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()

  await dialog.getByRole('button', { name: 'Lưu' }).click()
  await expect(dialog).toBeHidden()
  await expect(section.getByText(name)).toBeVisible()
  await expect(section.locator('li', { hasText: name }).getByText('Hiện đại')).toBeVisible()
})

test('thả chỗ điền của danh sách người ở ra ngoài hàng lặp bị từ chối và không mất nội dung', async ({ page }) => {
  await login(page, /^Admin/)
  await page.goto('/templates')
  await page.waitForLoadState('networkidle')
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Hợp đồng thuê', exact: true }) })
  await section.getByRole('button', { name: 'Soạn mẫu mới' }).click()
  const dialog = page.getByRole('dialog')
  const editor = dialog.getByLabel('Nội dung mẫu')
  const before = await editor.innerHTML()
  await dialog
    .getByLabel('Bảng chỗ điền')
    .getByRole('button', { name: /^Họ tên$/ })
    .click()
  await expect(dialog.getByRole('status')).toContainText('hàng lặp')
  expect(await editor.innerHTML()).toBe(before)
})
