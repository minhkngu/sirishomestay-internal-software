import { test, expect } from '@playwright/test'
import { chooseSelectOption, createTempLease, pickDate } from './helpers'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')
test('gia hạn tăng cọc: xem trước tiền, lưu, sổ cọc có khoản thu bổ sung', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto((await createTempLease(page)).url)
  const term = await page
    .getByText('Thời hạn hợp đồng', { exact: true })
    .locator('xpath=following-sibling::div[1]')
    .innerText()
  const [dd, mm, yyyy] = term.split('–')[1].trim().split('/')
  const newEnd = `${Number(yyyy) + 1}-${mm}-${dd}`
  const depositText = await page
    .getByText('Tiền cọc giữ', { exact: true })
    .locator('xpath=following-sibling::div[1]')
    .innerText()
  const newDeposit = Number(depositText.replace(/\D/g, '')) + 1000000
  await page.getByRole('button', { name: 'Gia hạn hợp đồng' }).click()
  await pickDate(page, 'Ngày kết thúc mới', newEnd)
  await page.getByLabel(/Tiền cọc mới/).fill(String(newDeposit))
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByText('Đã lưu phụ lục')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Thu cọc bổ sung' }).first()).toBeVisible()
})

test('gia hạn đổi giá thuê và phí: ghi thẳng vào hợp đồng', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto((await createTempLease(page)).url)
  const term = await page
    .getByText('Thời hạn hợp đồng', { exact: true })
    .locator('xpath=following-sibling::div[1]')
    .innerText()
  const [dd, mm, yyyy] = term.split('–')[1].trim().split('/')
  await page.getByRole('button', { name: 'Gia hạn hợp đồng' }).click()
  // ngày hiệu lực là ngày liền sau hết hạn cũ nên không có ô nhập; phần phí hiện ngay trong popup
  await expect(page.getByLabel('Ngày hiệu lực')).toHaveCount(0)
  await expect(page.getByText('Phí dịch vụ', { exact: true })).toBeVisible()
  await pickDate(page, 'Ngày kết thúc mới', `${Number(yyyy) + 1}-${mm}-${dd}`)
  await page.getByLabel(/Giá thuê mới/).fill('12000000')
  await page.getByRole('button', { name: 'Xem trước tiền' }).click()
  await page.getByRole('button', { name: 'Lưu phụ lục' }).click()
  await expect(page.getByText('Đã lưu phụ lục')).toBeVisible()
  // giá mới hiện thẳng trên hợp đồng
  await expect(page.getByText(/12\.000\.000/).first()).toBeVisible()
  // Sửa hợp đồng: giá thuê khác phụ lục gia hạn mới nhất thì cảnh báo đỏ, khớp lại thì hết cảnh báo
  await page.getByRole('button', { name: 'Sửa hợp đồng' }).first().click()
  const warning = page.getByRole('alert').filter({ hasText: 'Khác phụ lục gia hạn mới nhất' })
  await expect(warning).toHaveCount(0)
  await page.getByLabel('Giá thuê (VND/tháng)').fill('13000000')
  await expect(warning).toBeVisible()
  await page.getByLabel('Giá thuê (VND/tháng)').fill('12000000')
  await expect(warning).toHaveCount(0)
})

test('chuyển phòng và thanh lý: bước xem trước tiền không lưu gì', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto((await createTempLease(page)).url)
  await page.getByRole('button', { name: 'Thanh lý hợp đồng' }).click()
  await pickDate(page, 'Ngày trả phòng', '2026-12-10')
  // ô "Tiền phòng đã trả trước": chỉ hoàn một phần mới có ô nhập số tiền
  await expect(page.getByLabel('Tiền phòng đã trả trước')).toBeVisible()
  await expect(page.getByLabel('Số tiền hoàn')).toHaveCount(0)
  await chooseSelectOption(page, 'Tiền phòng đã trả trước', 'Hoàn một phần')
  await expect(page.getByLabel('Số tiền hoàn')).toBeVisible()
  await chooseSelectOption(page, 'Tiền phòng đã trả trước', 'Không hoàn')
  await expect(page.getByLabel('Số tiền hoàn')).toHaveCount(0)
  await page.getByRole('button', { name: 'Xem trước tiền' }).click()
  // thiếu chỉ số tại ngày trả phòng thì báo rõ, không tính tiền từ chỉ số thiếu
  await expect(page.getByText(/Nhập chỉ số|Hoá đơn thanh lý/).first()).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click()
  await page.getByRole('button', { name: 'Chuyển phòng' }).click()
  await expect(page.getByLabel('Phòng mới (phòng trống)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu phụ lục' })).toBeDisabled()
})
