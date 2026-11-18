import { test, expect } from '@playwright/test'
import postgres from 'postgres'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.skip(!process.env.E2E_BASE_URL, 'Cần môi trường demo cô lập')

test('danh sách có thao tác nhanh và chi tiết mở trong popup', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Admin/ }).click()
  await page.waitForURL('**/')
  await page.goto('/contracts')
  const row = page.locator('tbody tr').filter({ has: page.locator('a[href^="/contracts/"]') }).first()
  for (const name of ['Sửa', 'Xóa', 'Thanh lý', 'Chuyển nhượng', 'Gia hạn', 'Khôi phục']) {
    await expect(row.getByRole('button', { name: new RegExp(name, 'i') })).toBeVisible()
  }
  await row.locator('a[href^="/contracts/"]').first().click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Tổng quan')).toBeVisible()
  await expect(page.locator('table').first()).toBeAttached()
  await modal.getByRole('button', { name: 'Đóng' }).click()
  await expect(modal).toBeHidden()
})

test('sửa, chuyển nhượng và khôi phục từng bước trên dữ liệu cô lập', async ({ page }) => {
  test.skip(process.env.E2E_ISOLATED !== '1' || !process.env.E2E_DATABASE_URL, 'Cần PostgreSQL demo cô lập')
  const url = new URL(process.env.E2E_DATABASE_URL!)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Kiểm thử chỉ được chạy với PostgreSQL cục bộ cô lập')
  const sql = postgres(process.env.E2E_DATABASE_URL!, { prepare: false })
  try {
    await sql`insert into tenants (id, home_facility_id, kind, full_name, phone, id_number, is_demo) values ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','vietnamese','Người nhận thử','0900000002','012345678902',true) on conflict (id) do nothing`
    await page.goto('/login')
    await page.getByRole('button', { name: /^Admin/ }).click()
    await page.waitForURL('**/')
    await page.goto('/contracts')
    const row = page.locator('tbody tr').filter({ hasText: 'HD-TEST' })
    await row.getByRole('button', { name: 'Sửa hợp đồng' }).click()
    let modal = page.getByRole('dialog')
    await modal.getByLabel('Giá thuê (VND/tháng)').fill('1200000')
    await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(modal).toBeHidden()
    await expect(row).toContainText('1.200.000')
    const bucket = '/private/tmp/siris-contracts-quick-bucket'
    const originalKey = 'original-contract.pdf'
    const originalPdf = Buffer.from('%PDF-1.4\nORIGINAL CONTRACT\n%%EOF')
    await mkdir(bucket, { recursive: true })
    await writeFile(join(bucket, originalKey), originalPdf)
    await sql`insert into files (id, owner_type, owner_id, facility_id, storage_key, content_type, confirmed_at) values ('88888888-8888-4888-8888-888888888888','signed_contract','55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',${originalKey},'application/pdf',now()) on conflict (id) do nothing`
    await sql`update leases set sign_status='signed', signed_file_id='88888888-8888-4888-8888-888888888888' where id='55555555-5555-4555-8555-555555555555'`
    await row.getByRole('button', { name: 'Chuyển nhượng hợp đồng' }).click()
    modal = page.getByRole('dialog')
    await modal.getByLabel('Người nhận').selectOption('66666666-6666-4666-8666-666666666666')
    await modal.getByRole('button', { name: 'Lưu phụ lục' }).click()
    await expect(modal).toBeHidden()
    await expect(row).toContainText('Người nhận thử')
    await row.locator('a[href^="/contracts/"]').first().click()
    modal = page.getByRole('dialog')
    await modal.getByRole('button', { name: 'Tải phụ lục đã ký' }).locator('xpath=..').locator('input[type=file]').setInputFiles({ name: 'phu-luc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSIGNED ADDENDUM\n%%EOF') })
    await expect(modal.getByRole('listitem').filter({ hasText: 'Chuyển nhượng' }).getByRole('link', { name: 'Xem bản đã ký' })).toBeVisible()
    const [signed] = await sql`select a.signed_file_id, f.storage_key from addenda a join files f on f.id=a.signed_file_id where a.lease_id='55555555-5555-4555-8555-555555555555' and a.type='assignment'`
    expect(signed.signed_file_id).toBeTruthy()
    await access(join(bucket, signed.storage_key))
    await modal.getByRole('button', { name: 'Đóng' }).click()
    await expect(modal).toBeHidden()
    await row.getByRole('button', { name: 'Khôi phục hợp đồng' }).click()
    modal = page.getByRole('dialog')
    await expect(modal.getByText(/Phụ lục/)).toBeVisible()
    await modal.getByRole('button', { name: 'Xác nhận khôi phục' }).click()
    await expect(modal).toBeHidden()
    await expect(row).toContainText('Khách thử')
    await expect(access(join(bucket, signed.storage_key))).rejects.toThrow()
    expect(await readFile(join(bucket, originalKey))).toEqual(originalPdf)
    await row.getByRole('button', { name: 'Khôi phục hợp đồng' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận khôi phục' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(row).toContainText('1.000.000')
    const [result] = await sql`select tenant_id, monthly_rent from leases where id = '55555555-5555-4555-8555-555555555555'`
    expect(result.tenant_id).toBe('44444444-4444-4444-8444-444444444444')
    expect(result.monthly_rent).toBe(1000000)
    await sql`update leases set sign_status='draft', signed_file_id=null where id='55555555-5555-4555-8555-555555555555'`
  } finally { await sql.end() }
})

test('nhân viên được sửa và khôi phục nhưng không được xóa', async ({ page }) => {
  test.skip(process.env.E2E_ISOLATED !== '1', 'Cần tài khoản thử cô lập')
  await page.goto('/login')
  await page.getByRole('button', { name: /^Nhân viên thử/ }).click()
  await page.waitForURL('**/')
  await page.goto('/contracts')
  const row = page.locator('tbody tr').filter({ hasText: 'HD-TEST' })
  await expect(row.getByRole('button', { name: 'Xóa hợp đồng' })).toHaveCount(0)
  await row.getByRole('button', { name: 'Sửa hợp đồng' }).click()
  await page.getByRole('dialog').getByLabel('Giá thuê (VND/tháng)').fill('1100000')
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await row.getByRole('button', { name: 'Khôi phục hợp đồng' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận khôi phục' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(row).toContainText('1.000.000')
})

test('gia hạn, thanh lý, cảnh báo đã ký và xóa trong môi trường cô lập', async ({ page }) => {
  test.skip(process.env.E2E_ISOLATED !== '1' || !process.env.E2E_DATABASE_URL, 'Cần PostgreSQL demo cô lập')
  const url = new URL(process.env.E2E_DATABASE_URL!)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Kiểm thử chỉ được chạy với PostgreSQL cục bộ cô lập')
  const sql = postgres(process.env.E2E_DATABASE_URL!, { prepare: false })
  try {
    await sql`update leases set sign_status = 'signed' where id = '55555555-5555-4555-8555-555555555555'`
    await page.goto('/login')
    await page.getByRole('button', { name: /^Admin/ }).click()
    await page.waitForURL('**/')
    await page.goto('/contracts')
    const row = page.locator('tbody tr').filter({ hasText: 'HD-TEST' })
    await row.getByRole('button', { name: 'Sửa hợp đồng' }).click()
    let modal = page.getByRole('dialog')
    await modal.getByLabel('Giá thuê (VND/tháng)').fill('1250000')
    page.once('dialog', async dialog => { expect(dialog.message()).toContain('đã ký'); await dialog.dismiss() })
    await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(modal).toBeVisible()
    page.once('dialog', async dialog => { expect(dialog.message()).toContain('đã ký'); await dialog.accept() })
    await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(modal).toBeHidden()
    await row.getByRole('button', { name: 'Gia hạn hợp đồng' }).click()
    modal = page.getByRole('dialog')
    await modal.getByLabel(/Ngày kết thúc mới/).fill('2028-12-31')
    await modal.getByRole('button', { name: 'Xem trước tiền' }).click()
    await expect(modal.getByRole('button', { name: 'Lưu phụ lục' })).toBeEnabled()
    await modal.getByRole('button', { name: 'Lưu phụ lục' }).click()
    await expect(modal).toBeHidden()
    await row.getByRole('button', { name: 'Khôi phục hợp đồng' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận khôi phục' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await row.getByRole('button', { name: 'Thanh lý hợp đồng' }).click()
    modal = page.getByRole('dialog')
    await modal.getByRole('button', { name: 'Xem trước tiền' }).click()
    await expect(modal.getByText('Hoá đơn thanh lý (nháp)')).toBeVisible()
    await modal.getByRole('button', { name: 'Lưu phụ lục' }).click()
    await expect(modal).toBeHidden()
    await row.getByRole('button', { name: 'Khôi phục hợp đồng' }).click()
    modal = page.getByRole('dialog')
    await expect(modal.getByText(/Hóa đơn:/)).toBeVisible()
    await expect(modal.getByText(/Bàn giao:/)).toBeVisible()
    await modal.getByRole('button', { name: 'Xác nhận khôi phục' }).click()
    await expect(modal).toBeHidden()
    const bucket = '/private/tmp/siris-contracts-quick-bucket'
    await mkdir(bucket, { recursive: true })
    await writeFile(join(bucket, 'invoice-delete.pdf'), Buffer.from('invoice'))
    await writeFile(join(bucket, 'addendum-delete.pdf'), Buffer.from('addendum'))
    await sql`insert into invoices (id,code,lease_id,facility_id,kind,period_start,period_end,issue_date,is_demo) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','HD-TEST-INV','55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222','monthly','2026-01-01','2026-01-31','2026-01-01',true)`
    await sql`insert into payments (id,invoice_id,paid_on,amount,method,received_by,is_demo) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-01-02',100,'cash','11111111-1111-4111-8111-111111111111',true)`
    await sql`insert into deposit_entries (id,lease_id,date,type,amount,is_demo) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','55555555-5555-4555-8555-555555555555','2026-01-02','collect',100,true)`
    await sql`insert into addenda (id,lease_id,type,effective_date,is_demo) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555','assignment','2026-01-02',true)`
    await sql`insert into handovers (id,lease_id,room_id,kind,date,is_demo) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','check_out','2026-01-02',true)`
    await sql`insert into files (owner_type,owner_id,facility_id,storage_key,content_type,confirmed_at,is_demo) values ('export','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','invoice-delete.pdf','application/pdf',now(),true), ('signed_addendum','dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','addendum-delete.pdf','application/pdf',now(),true)`
    await row.getByRole('button', { name: 'Xóa hợp đồng' }).click()
    modal = page.getByRole('dialog')
    page.once('dialog', async dialog => {
      for (const term of ['đã ký', 'hoá đơn', 'tiền cọc', 'thanh toán', 'phụ lục', 'bàn giao', 'tệp']) expect(dialog.message()).toContain(term)
      await dialog.dismiss()
    })
    await modal.getByRole('button', { name: 'Xoá hợp đồng' }).click()
    await expect(modal).toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    await modal.getByRole('button', { name: 'Xoá hợp đồng' }).click()
    await expect(modal).toBeHidden()
    await expect(row).toHaveCount(0)
    const [result] = await sql`select (select count(*)::int from leases where id='55555555-5555-4555-8555-555555555555') as leases, (select count(*)::int from invoices where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') as invoices, (select count(*)::int from payments where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') as payments, (select count(*)::int from deposit_entries where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') as deposits, (select count(*)::int from addenda where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') as addenda, (select count(*)::int from handovers where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') as handovers`
    expect(result).toMatchObject({ leases: 0, invoices: 0, payments: 0, deposits: 0, addenda: 0, handovers: 0 })
    await expect(access(join(bucket, 'invoice-delete.pdf'))).rejects.toThrow()
    await expect(access(join(bucket, 'addendum-delete.pdf'))).rejects.toThrow()
  } finally { await sql.end() }
})
