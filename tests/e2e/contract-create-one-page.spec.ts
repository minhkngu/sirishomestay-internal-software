import { test, expect, type Page } from '@playwright/test'
import { createCanvas } from '@napi-rs/canvas'
import {
  addOccupant,
  chooseSelectOption,
  createTempRoom,
  fillMeterReadings,
  pickDate,
  pickTerm,
  selectOptionLabels,
} from './helpers'

test.skip(!process.env.E2E_BASE_URL, 'Cần E2E_BASE_URL trỏ tới môi trường thử có dữ liệu mẫu')

async function openForm(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/contracts/new')
}

/** Đăng nhập, tạo `count` phòng tạm mã duy nhất ở Thảo Điền rồi mở form hợp đồng; không phụ thuộc phòng trống có sẵn trong dữ liệu mẫu. */
async function openFormWithRooms(page: Page, count = 1): Promise<string[]> {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Nhắc việc' })).toBeVisible()
  await page.goto('/facilities')
  await page
    .getByRole('link', { name: /Thảo Điền/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Tạo nhanh nhiều phòng' }).click()
  const prefix = `E2E${Date.now()}${Math.floor(Math.random() * 1000)}-`
  await page.getByLabel('Tiền tố mã (tuỳ chọn)').fill(prefix)
  await page.getByLabel('Tầng', { exact: true }).fill('9')
  await page.getByLabel('Từ số').fill('901')
  await page.getByLabel('Đến số').fill(String(900 + count))
  await page.getByRole('button', { name: 'Tạo', exact: true }).click()
  await expect(page.getByText(`Đã tạo ${count} phòng`, { exact: true })).toBeVisible()
  await page.goto('/contracts/new')
  return Array.from({ length: count }, (_, i) => `${prefix}${901 + i}`)
}
const roomSelect = (page: Page) => page.getByLabel('Phòng', { exact: true })
const facilitySelect = (page: Page) => page.getByLabel('Toà', { exact: true })

async function pickFacility(page: Page) {
  await facilitySelect(page).click()
  await page
    .getByRole('option', { name: /Thảo Điền/ })
    .first()
    .click()
}

async function pickRoom(page: Page, code: string) {
  await pickFacility(page)
  await roomSelect(page).click()
  await page
    .getByRole('option', { name: new RegExp(code) })
    .first()
    .click()
}

async function expectOneRoom(page: Page, code: string) {
  await pickFacility(page)
  await roomSelect(page).click()
  await expect(page.getByRole('option').filter({ hasText: code })).toHaveCount(1)
  await page.getByRole('option').filter({ hasText: code }).click()
}

test('các mục cùng trang, lỗi cạnh trường và đổi phòng xóa tài sản mới', async ({ page }) => {
  const codes = await openFormWithRooms(page, 2)
  await expect(page.getByLabel('Phòng', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Tiền đã cọc (VND)')).toBeVisible()
  await expect(page.locator('#deposit').locator('..').locator('..').getByLabel('Tiền đã cọc (VND)')).toBeVisible()
  await expect(page.getByText('Tài sản bàn giao', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm người ở cùng' })).toBeVisible()
  await expect(page.getByLabel('Ghi chú')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tiếp tục' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tạo hợp đồng thuê' }).click()
  await expect(page.getByText('Chọn phòng', { exact: true })).toBeVisible()
  await pickFacility(page)
  await roomSelect(page).click()
  const rooms = page
    .getByRole('option')
    .filter({ hasText: codes[0] })
    .or(page.getByRole('option').filter({ hasText: codes[1] }))
  await expect(rooms).toHaveCount(2)
  await rooms.nth(0).click()
  await expect(page.getByLabel('Mã tài sản mới')).toHaveCount(0)
  await page.getByRole('button', { name: 'Thêm tài sản' }).click()
  await page.getByLabel('Mã tài sản mới').fill('TEST-TEMP')
  await page.getByLabel('Tên tài sản mới').fill('Tài sản thử')
  await page.getByRole('button', { name: 'Thêm tài sản mới' }).click()
  await expect(page.getByRole('button', { name: 'Gỡ Tài sản thử' })).toBeVisible()
  await pickRoom(page, codes[1])
  await expect(page.getByRole('button', { name: 'Gỡ Tài sản thử' })).toHaveCount(0)
})

test('xử lý tài sản chỉ có di chuyển và thanh lý, đổi phòng xóa lựa chọn', async ({ page }) => {
  test.setTimeout(240_000)
  // Tự tạo phòng tạm có một tài sản, không phụ thuộc phòng trống có sẵn trong dữ liệu mẫu
  const roomCode = await createTempRoom(page)
  await page.goto('/assets')
  await page.getByRole('button', { name: 'Thêm tài sản' }).click()
  await page.getByLabel('Cơ sở', { exact: true }).selectOption({ label: 'Thảo Điền' })
  await page.locator('select[aria-label="Vị trí"]').selectOption({ label: `Phòng ${roomCode}` })
  const assetCode = `TS-${Date.now()}`
  await page.getByLabel('Mã tài sản').fill(assetCode)
  await page.getByLabel('Tên tài sản').fill('Tài sản kiểm thử')
  await page.getByLabel('Giá trị', { exact: true }).fill('100000')
  await page.getByRole('button', { name: 'Lưu', exact: true }).first().click()
  await page.getByLabel('Tìm tài sản').fill(assetCode)
  await expect(page.getByRole('link', { name: assetCode, exact: true })).toBeVisible()
  await page.goto('/contracts/new')
  await pickFacility(page)
  const roomLabels = await selectOptionLabels(page, 'Phòng')
  await pickRoom(page, roomCode)
  await expect(page.getByRole('button', { name: 'Xử lý tài sản' }).first()).toBeVisible()
  const first = page.getByRole('button', { name: 'Xử lý tài sản' }).first()
  await first.click()
  await expect(page.getByRole('button', { name: 'Di chuyển', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thanh lý', exact: true })).toBeVisible()
  await expect(page.getByText('Bỏ khỏi phòng')).toHaveCount(0)
  await expect(page.getByText('Chuyển vào kho')).toHaveCount(0)
  await page.getByRole('button', { name: 'Di chuyển', exact: true }).click()
  const apply = page.getByRole('button', { name: 'Áp dụng', exact: true })
  await expect(page.getByRole('combobox', { name: /^Tòa/ })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: /^Phòng đích/ })).toHaveCount(0)
  await page.getByRole('combobox', { name: /^Loại đích/ }).click()
  await page.getByRole('option', { name: 'Phòng' }).click()
  await expect(apply).toBeDisabled()
  await expect(page.getByRole('combobox', { name: /^Phòng đích/ })).toHaveCount(0)
  await page.getByRole('combobox', { name: /^Tòa/ }).click()
  await page.getByRole('option').nth(1).click()
  await expect(apply).toBeDisabled()
  await page.getByRole('combobox', { name: /^Phòng đích/ }).click()
  await page.getByRole('option').nth(1).click()
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(page.getByText(/Di chuyển → .+ · /)).toBeVisible()
  await page.getByRole('button', { name: 'Đổi cách xử lý' }).click()
  await page.getByRole('button', { name: 'Di chuyển', exact: true }).click()
  await page.getByRole('combobox', { name: /^Loại đích/ }).click()
  await page.getByRole('option', { name: 'Kho' }).click()
  await expect(apply).toBeDisabled()
  await expect(page.getByRole('combobox', { name: /^Phòng đích/ })).toHaveCount(0)
  await page.getByRole('combobox', { name: /^Tòa/ }).click()
  await page.getByRole('option').nth(1).click()
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(page.getByText(/Di chuyển → Kho /)).toBeVisible()
  await page.getByRole('button', { name: 'Đổi cách xử lý' }).click()
  await page.getByRole('button', { name: 'Thanh lý', exact: true }).click()
  await expect(page.getByText(/· Thanh lý$/)).toBeVisible()
  const current = await roomSelect(page).innerText()
  const other = roomLabels.find((label) => label !== current)
  if (other) {
    await roomSelect(page).click()
    await page.getByRole('option', { name: other }).click()
  }
  await expect(page.getByText(/· Thanh lý$/)).toHaveCount(0)
})

test('tạo hợp đồng với tiền thực nhận, ghi chú và tài sản mới', async ({ page }) => {
  const [tempRoom] = await openFormWithRooms(page)
  const templateTrigger = page.getByLabel('Mẫu hợp đồng', { exact: true })
  let selectedTemplateName = ''
  if (await templateTrigger.count()) {
    await templateTrigger.click()
    const last = page.getByRole('option').last()
    selectedTemplateName = ((await last.innerText()) ?? '').replace(/ \(mặc định\)$/, '').trim()
    await last.click()
  }
  await expectOneRoom(page, tempRoom)
  await addOccupant(page, 'Nguyễn Văn An')
  await pickDate(page, 'Ngày bắt đầu', '2026-12-01')
  await pickTerm(page, 12)
  await page.getByLabel('Giá thuê tháng (VND)').fill('9000000')
  await page.getByLabel('Tiền cọc (VND)').fill('9000000')
  await page.getByLabel('Tiền đã cọc (VND)').fill('3000000')
  await page.getByLabel('Ghi chú').fill('Ghi chú kiểm thử')
  await page.getByRole('button', { name: 'Thêm tài sản', exact: true }).click()
  const assetName = `Bàn kiểm thử ${Date.now()}`
  await page.getByLabel('Mã tài sản mới').fill(`TEST-${Date.now()}`)
  await page.getByLabel('Tên tài sản mới').fill(assetName)
  await page.getByRole('button', { name: 'Thêm tài sản mới' }).click()
  await page.getByLabel(`Tình trạng ${assetName}`).fill('Trầy nhẹ')
  const canvas = createCanvas(8, 8)
  canvas.getContext('2d').fillRect(0, 0, 8, 8)
  await page
    .getByLabel(`Ảnh ${assetName}`)
    .setInputFiles({ name: 'ban.png', mimeType: 'image/png', buffer: canvas.toBuffer('image/png') })
  await expect(page.getByAltText(`Ảnh ${assetName} 1`)).toBeVisible()
  await fillMeterReadings(page)
  await page.getByRole('button', { name: 'Tạo hợp đồng thuê' }).click()
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+$/, { timeout: 60_000 })
  await expect(page.getByText('Ghi chú kiểm thử')).toBeVisible()
  if (selectedTemplateName) {
    // mẫu đã chọn được lưu: mở popup sửa hợp đồng thì đúng mẫu đó đang được chọn
    await page.getByRole('button', { name: 'Sửa hợp đồng' }).first().click()
    await expect(
      page.getByRole('radio', { name: new RegExp(selectedTemplateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }),
    ).toBeChecked({ timeout: 60_000 })
    await page.keyboard.press('Escape')
  }
  await expect(page.getByText(/· Nháp/).first()).toBeVisible()
  await expect(page.getByText(/3\.000\.000/).first()).toBeVisible()
  await expect(page.getByText(/6\.000\.000/).first()).toBeVisible()
  await page.getByRole('link', { name: 'Biên bản check-in' }).first().click()
  const asset = page.getByRole('listitem').filter({ hasText: assetName })
  await expect(asset.getByText('Tình trạng đang ghi: Trầy nhẹ')).toBeVisible()
  await expect(asset.getByRole('img', { name: 'Ảnh' })).toBeVisible()
})

test('hai dòng phí đồng hồ có chọn đồng hồ riêng và chỉ số ban đầu bắt buộc', async ({ page }) => {
  const [tempRoom] = await openFormWithRooms(page)
  await expectOneRoom(page, tempRoom)
  await addOccupant(page, 'Nguyễn Văn An')
  await pickDate(page, 'Ngày bắt đầu', '2026-12-01')
  await pickTerm(page, 12)
  await page.getByLabel('Giá thuê tháng (VND)').fill('9000000')
  await page.getByLabel('Tiền cọc (VND)').fill('0')
  await page.getByRole('button', { name: 'Thêm phí dịch vụ' }).click()
  for (const name of ['Đồng hồ thử A', 'Đồng hồ thử B']) {
    await page.getByLabel('Tên phí riêng').fill(name)
    await page.getByLabel('Đơn vị phí riêng').fill('kWh')
    await page.getByLabel('Đơn giá phí riêng').fill('3500')
    await chooseSelectOption(page, 'Cách tính phí riêng', 'Theo đồng hồ')
    await page.getByRole('button', { name: 'Thêm phí riêng' }).click()
    await expect(page.getByLabel(`Đồng hồ ${name}`)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Tạo hợp đồng thuê' }).click()
  await expect(page.getByText(/Nhập chỉ số ban đầu hợp lệ cho Đồng hồ thử/)).toBeVisible()
})

test('bố cục di động hiển thị mục bàn giao', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openForm(page)
  await expect(page.getByText('Tài sản bàn giao', { exact: false })).toBeVisible()
})

test('phí chỉ hiện khi mặc định hoặc được thêm và không có lựa chọn nước riêng', async ({ page }) => {
  await openForm(page)
  await expect(page.getByText('Tính nước theo đồng hồ')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thêm phí dịch vụ' })).toBeVisible()
  await page.getByRole('button', { name: 'Thêm người ở cùng' }).click()
  const companySearch = page.getByPlaceholder('Tìm theo tên hoặc số điện thoại…')
  await companySearch.fill('Công ty')
  const companies = page.getByRole('option').filter({ hasText: 'Công ty' })
  test.skip((await companies.count()) === 0, 'Cần công ty demo')
  await companies.first().click()
  await expect(page.getByText(/Bên ký/)).toBeVisible()
})

test('công ty ký và tạo đồng hồ cho phí riêng', async ({ page }) => {
  const [tempRoom] = await openFormWithRooms(page)
  const roomCode = tempRoom
  await expectOneRoom(page, tempRoom)
  await page.getByRole('button', { name: 'Thêm người ở cùng' }).click()
  await page.getByPlaceholder('Tìm theo tên hoặc số điện thoại…').fill('Công ty')
  const companies = page.getByRole('option').filter({ hasText: 'Công ty' })
  test.skip((await companies.count()) === 0, 'Cần công ty demo')
  const companyName =
    (await companies.first().getAttribute('data-name')) ??
    ((await companies.first().innerText()) ?? '').split('\n')[1]?.trim() ??
    'Công ty'
  await companies.first().click()
  await expect(page.getByText(/Bên ký/)).toBeVisible()
  await page.getByRole('button', { name: 'Thêm người ở cùng' }).click()
  await page.getByPlaceholder('Tìm theo tên hoặc số điện thoại…').fill('Nguyễn Văn An')
  await page
    .getByRole('option', { name: /Nguyễn Văn An/ })
    .first()
    .click()
  await pickDate(page, 'Ngày bắt đầu', '2026-12-01')
  await pickTerm(page, 12)
  await page.getByLabel('Giá thuê tháng (VND)').fill('9000000')
  await page.getByLabel('Tiền cọc (VND)').fill('0')
  await page.getByRole('button', { name: 'Thêm phí dịch vụ' }).click()
  await page.getByLabel('Tên phí riêng').fill('Phí thử theo đồng hồ')
  await page.getByLabel('Đơn vị phí riêng').fill('lượt')
  await page.getByLabel('Đơn giá phí riêng').fill('5000')
  await chooseSelectOption(page, 'Cách tính phí riêng', 'Theo đồng hồ')
  await page.getByRole('button', { name: 'Thêm phí riêng' }).click()
  await page.getByLabel('Chỉ số ban đầu Phí thử theo đồng hồ').fill('123')
  await page.getByLabel('Tên phí riêng').fill('Phí thử nhập kỳ')
  await page.getByLabel('Đơn vị phí riêng').fill('lần')
  await page.getByLabel('Đơn giá phí riêng').fill('7000')
  await chooseSelectOption(page, 'Cách tính phí riêng', 'Nhập lượng mỗi kỳ')
  await page.getByRole('button', { name: 'Thêm phí riêng' }).click()
  await fillMeterReadings(page)
  await page.getByRole('button', { name: 'Tạo hợp đồng thuê' }).click()
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+$/, { timeout: 60_000 })
  await expect(page.getByText('Phí thử theo đồng hồ')).toBeVisible()
  await expect(page.getByText('Số người ở').locator('..')).toContainText('2')
  // Hợp đồng không tự sinh hoá đơn: tạo hàng loạt cho Thảo Điền, kỳ 12/2026 (tháng bắt đầu hợp đồng)
  await page.goto('/invoices/generate')
  await page.getByLabel('Cơ sở').selectOption({ label: 'Thảo Điền' })
  await page.getByLabel('Kỳ (tháng)').fill('2026-12')
  await page.getByRole('button', { name: 'Xem trước' }).click()
  const createDrafts = page.getByRole('button', { name: /^Tạo \d+ hoá đơn nháp$/ })
  await expect(createDrafts).toBeEnabled()
  await createDrafts.click()
  await expect(page).toHaveURL(/view=draft/)
  // Danh sách phân trang 15 dòng; hoá đơn nháp từ các lần chạy trước nhiều nên mở rộng tối đa
  await page.getByLabel('Số dòng').click()
  await page.getByRole('option', { name: '100' }).click()
  const invoiceRow = page.getByRole('row').filter({ hasText: companyName }).filter({ hasText: roomCode }).first()
  await invoiceRow.getByRole('link').click()
  await page.getByLabel('Số lượng Phí thử nhập kỳ').fill('3')
  await page.getByRole('button', { name: 'Lưu số lượng' }).click()
  await expect(page.getByText('21.000', { exact: false }).first()).toBeVisible()
})

test('phí mặc định theo cơ sở tự thêm và có thể xóa hoặc thêm lại', async ({ page }) => {
  const [tempRoom] = await openFormWithRooms(page)
  const feeName = `Phí mặc định E2E ${Date.now()}`
  try {
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Phí dịch vụ' }).click()
    await page.getByRole('button', { name: 'Thêm loại phí' }).click()
    await page.getByPlaceholder('Tên loại phí').fill(feeName)
    await page.getByPlaceholder('Đơn giá mặc định').fill('18000')
    await page.getByLabel('Số lượng lấy từ').selectOption('room')
    await page.getByRole('button', { name: 'Tạo loại phí' }).click()
    const card = page.getByRole('article', { name: feeName })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'Áp dụng theo toà' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('checkbox', { name: 'Thảo Điền' }).check()
    await expect(dialog.getByRole('checkbox', { name: 'Thảo Điền' })).toBeChecked()
    await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(card).toContainText('Áp dụng 1 toà')
    await page.goto('/contracts/new')
    await expectOneRoom(page, tempRoom)
    await expect(page.getByRole('button', { name: `Xóa phí ${feeName}` })).toBeVisible()
    await page.getByRole('button', { name: `Xóa phí ${feeName}` }).click()
    await expect(page.getByRole('button', { name: `Xóa phí ${feeName}` })).toHaveCount(0)
    await page.getByRole('button', { name: 'Thêm phí dịch vụ' }).click()
    await chooseSelectOption(page, 'Chọn phí có sẵn', feeName)
    await expect(page.getByRole('button', { name: `Xóa phí ${feeName}` })).toBeVisible()
  } finally {
    page.on('dialog', (dialog) => dialog.accept())
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Phí dịch vụ' }).click()
    const card = page.getByRole('article', { name: feeName })
    if (await card.count()) await card.getByRole('button', { name: 'Lưu trữ' }).click()
  }
})
