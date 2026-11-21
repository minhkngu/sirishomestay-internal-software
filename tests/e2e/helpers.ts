import { expect, type Page } from '@playwright/test'

/**
 * Chỉ số đồng hồ luôn lớn hơn chỉ số mọi lần chạy trước (môi trường thử dùng chung, chỉ số chỉ được tăng).
 * Tính theo giây nên vẫn nằm trong giới hạn số nguyên 32 bit.
 */
export const meterValue = () => Math.floor(Date.now() / 1000)

/** Phí mặc định theo đồng hồ (vd. Điện) được tự thêm vào form hợp đồng và đòi chỉ số ban đầu: điền cho mọi ô còn trống. */
export async function fillMeterReadings(page: Page) {
  // Mỗi dòng phí đồng hồ phải chọn một đồng hồ của phòng: chọn đồng hồ rảnh đầu tiên còn trống
  const pickers = page.getByLabel(/^Đồng hồ /)
  for (let i = 0; i < await pickers.count(); i++) {
    const trigger = pickers.nth(i)
    if ((await trigger.innerText()).includes('Chọn đồng hồ')) {
      await trigger.click()
      const option = page.getByRole('option').filter({ hasNotText: 'Chọn đồng hồ' }).first()
      if (await option.count()) await option.click()
    }
  }
  const inputs = page.getByLabel(/^Chỉ số ban đầu /)
  for (let i = 0; i < await inputs.count(); i++) if (!(await inputs.nth(i).inputValue())) await inputs.nth(i).fill(String(meterValue()))
}

/** Đăng nhập Admin rồi tạo một phòng tạm mã duy nhất ở Thảo Điền; trả về mã phòng. */
export async function createTempRoom(page: Page): Promise<string> {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/facilities')
  await page.getByRole('link', { name: /Thảo Điền/ }).first().click()
  await page.getByRole('button', { name: 'Tạo nhanh nhiều phòng' }).click()
  const prefix = `E2E${Date.now()}${Math.floor(Math.random() * 1000)}-`
  await page.getByLabel('Tiền tố mã (tuỳ chọn)').fill(prefix)
  await page.getByLabel('Tầng', { exact: true }).fill('9')
  await page.getByLabel('Từ số').fill('901')
  await page.getByLabel('Đến số').fill('901')
  await page.getByRole('button', { name: 'Tạo', exact: true }).click()
  await expect(page.getByText('Đã tạo 1 phòng', { exact: true })).toBeVisible()
  return `${prefix}901`
}

/** Mở ô "Thêm người" của hợp đồng, tìm theo tên/số điện thoại rồi chọn. Trả về tên đã chọn. */
export async function addOccupant(page: Page, query: string): Promise<string> {
  await page.getByRole('button', { name: 'Thêm người ở cùng' }).click()
  await page.getByPlaceholder('Tìm theo tên hoặc số điện thoại…').fill(query)
  const option = page.getByRole('option', { name: new RegExp(escapeRegex(query)) }).first()
  const name = (await option.getAttribute('data-name')) ?? ((await option.innerText()) ?? '').split('\n')[1]?.trim() ?? query
  await option.click()
  return name
}

/** Mở ô "Bên thuê" của hợp đồng cọc và chọn người theo tên/số điện thoại. */
export async function choosePerson(page: Page, label: string, query: string) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByPlaceholder('Tìm theo tên hoặc số điện thoại…').fill(query)
  await page.getByRole('option', { name: new RegExp(escapeRegex(query)) }).first().click()
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Mở lịch của app và chọn ngày theo ISO. Lịch mặc định mở ở tháng hiện tại nên tiến tới tháng cần chọn. */
export async function pickDate(page: Page, label: string, iso: string) {
  await page.getByLabel(label, { exact: true }).click()
  const [year, month, day] = iso.split('-').map(Number)
  const target = page.locator(`[data-day="${day}/${month}/${year}"]`)
  for (let i = 0; i < 48 && !(await target.count()); i++) {
    await page.getByRole('button', { name: 'Tháng sau' }).click()
  }
  await target.first().click()
}

/** Chọn thời hạn theo tháng; ngày kết thúc được tính tự động. */
export async function pickTerm(page: Page, months: number) {
  await page.getByRole('combobox', { name: 'Thời hạn hợp đồng' }).click()
  await page.getByRole('option', { name: `${months} tháng`, exact: true }).click()
}

/** Menu chọn của app (Base UI Select): mở bằng nhãn, chọn bằng chữ của option. */
export async function chooseSelectOption(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option }).first().click()
}

/** Danh sách chữ của các option trong một menu chọn; không đổi lựa chọn hiện tại. */
export async function selectOptionLabels(page: Page, label: string): Promise<string[]> {
  await page.getByLabel(label, { exact: true }).click()
  const labels = await page.getByRole('option').allInnerTexts()
  await page.keyboard.press('Escape')
  return labels
}

/** Đăng nhập Admin, tạo một phòng tạm ở Thảo Điền rồi tạo hợp đồng thuê mới (từ 01/12/2026, 12 tháng); trả về địa chỉ trang hợp đồng và mã phòng. */
export async function createTempLease(page: Page): Promise<{ url: string; roomCode: string }> {
  const roomCode = await createTempRoom(page)
  await page.goto('/contracts/new')
  await chooseSelectOption(page, 'Toà', /Thảo Điền/)
  await chooseSelectOption(page, 'Phòng', new RegExp(roomCode))
  await addOccupant(page, 'Nguyễn Văn An')
  await pickDate(page, 'Ngày bắt đầu', '2026-12-01')
  await pickTerm(page, 12)
  await page.getByLabel('Giá thuê tháng (VND)').fill('9000000')
  await page.getByLabel('Tiền cọc (VND)').fill('5000000')
  await fillMeterReadings(page)
  await page.getByRole('button', { name: 'Tạo hợp đồng thuê' }).click()
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+$/, { timeout: 60_000 })
  return { url: page.url(), roomCode }
}
