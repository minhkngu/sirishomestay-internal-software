import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, rooms, tenants, auditLogs } from '@/db'
import { parseWorkbook } from '@/lib/excel'
import { suggestMapping } from '@/server/import/targets'
import { validateRows } from '@/server/import/validate'
import { runImport } from '@/server/import/run'
import { ForbiddenError, type AccessContext, type Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import { roomsWorkbook, tenantsWorkbook, buildXlsx, TENANT_HEADERS } from '../fixtures/build'
import { findImportConflicts } from '@/server/import/run'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[]): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(),
    isAdmin: perms.includes('settings'),
  }
}

async function load(buf: ArrayBuffer, target: 'rooms' | 'tenants') {
  const { sheets } = await parseWorkbook(buf)
  const sheet = sheets[0]
  const mapping = suggestMapping(sheet.headers, target)
  return validateRows(target, sheet.rows, mapping)
}

describe('parseWorkbook', () => {
  it('đọc tiêu đề, bỏ dòng trống, giữ số dòng Excel', async () => {
    const { sheets } = await parseWorkbook(await tenantsWorkbook())
    expect(sheets[0].name).toBe('Khách')
    expect(sheets[0].headers[2]).toBe('Họ tên')
    expect(sheets[0].rows).toHaveLength(3)
    expect(sheets[0].rows.map((r) => r.__row)).toEqual([2, 3, 5])
  })
})

describe('runImport', () => {
  let db: DB
  const admin = ctxOf(['settings'])
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('nhập phòng: tạo cơ sở chưa có, chạy lại không tạo trùng', async () => {
    const { valid, errors } = await load(await roomsWorkbook(), 'rooms')
    expect(errors).toEqual([])
    expect(await runImport(db, admin, 'rooms', valid)).toEqual({ created: 3, updated: 0 })
    expect((await db.select().from(facilities)).map((f) => f.code).sort()).toEqual(['A', 'B'])
    expect(await runImport(db, admin, 'rooms', valid)).toEqual({ created: 0, updated: 0 })
    expect(await db.select().from(rooms)).toHaveLength(3)
    const [r] = await db.select().from(rooms).where(eq(rooms.code, '102'))
    expect(r.listPrice).toBe(5500000)
  })

  it('nhập khách: lần 2 created 0; đổi SĐT rồi chạy lại → updated 1', async () => {
    await runImport(db, admin, 'rooms', (await load(await roomsWorkbook(), 'rooms')).valid)
    const first = await load(await tenantsWorkbook(), 'tenants')
    expect(first.errors).toEqual([])
    expect(await runImport(db, admin, 'tenants', first.valid)).toEqual({ created: 3, updated: 0 })

    expect(await runImport(db, admin, 'tenants', first.valid)).toEqual({ created: 0, updated: 0 })
    expect(await db.select().from(tenants)).toHaveLength(3)

    const changed = await load(await tenantsWorkbook({ phone2: '0907777777' }), 'tenants')
    expect(await runImport(db, admin, 'tenants', changed.valid)).toEqual({ created: 0, updated: 1 })
    const vn = (await db.select().from(tenants)).find((t) => t.kind === 'vietnamese')!
    expect(vn.phone).toBe('+84907777777')
    expect(vn.searchText).toContain('0907777777')
  })

  it('ghi một dòng nhật ký action import; chỉ settings được nhập', async () => {
    const { valid } = await load(await roomsWorkbook(), 'rooms')
    await expect(runImport(db, ctxOf(['tenants_contracts']), 'rooms', valid)).rejects.toThrow(ForbiddenError)
    await runImport(db, admin, 'rooms', valid)
    const logs = (await db.select().from(auditLogs)).filter((l) => l.action === 'import')
    expect(logs).toHaveLength(1)
    expect(logs[0].after).toMatchObject({ created: 3, updated: 0 })
  })

  it('khách thuộc cơ sở chưa tồn tại → lỗi báo số dòng, không ghi gì', async () => {
    const { valid } = await load(await tenantsWorkbook(), 'tenants')
    await expect(runImport(db, admin, 'tenants', valid)).rejects.toThrow(/Dòng 2.*"A"/)
    expect(await db.select().from(tenants)).toHaveLength(0)
  })

  it('không gộp hai người khác nhau chỉ vì trùng số điện thoại', async () => {
    await runImport(db, admin, 'rooms', (await load(await roomsWorkbook(), 'rooms')).valid)
    await runImport(db, admin, 'tenants', (await load(await tenantsWorkbook(), 'tenants')).valid)
    const other = await buildXlsx({
      K: [TENANT_HEADERS, ['Nước ngoài', 'A', 'Người Khác', '+1 415 555 0100', 'ZZ999', null, null, null, null]],
    })
    const { valid } = await load(other, 'tenants')
    await expect(runImport(db, admin, 'tenants', valid)).rejects.toThrow('Số điện thoại đã thuộc về khách khác')
    const john = (await db.select().from(tenants)).find((t) => t.phone === '+14155550100')!
    expect(john.passportNumber).toBe('X1234567')
  })

  it('ghi nhật ký từng dòng (create/update có before/after) và cơ sở tự tạo', async () => {
    await runImport(db, admin, 'rooms', (await load(await roomsWorkbook(), 'rooms')).valid)
    const logs = await db.select().from(auditLogs)
    expect(logs.filter((l) => l.entity === 'facility' && l.action === 'create')).toHaveLength(2)
    expect(logs.filter((l) => l.entity === 'room' && l.action === 'create')).toHaveLength(3)
    await runImport(db, admin, 'tenants', (await load(await tenantsWorkbook(), 'tenants')).valid)
    await runImport(
      db,
      admin,
      'tenants',
      (await load(await tenantsWorkbook({ phone2: '0907777777' }), 'tenants')).valid,
    )
    const upd = (await db.select().from(auditLogs)).find((l) => l.entity === 'tenant' && l.action === 'update')!
    expect((upd.before as { phone: string }).phone).toBe('+84901234567')
    expect((upd.after as { phone: string }).phone).toBe('+84907777777')
  })

  it('xem trước báo trùng với CSDL và trùng trong file theo từng dòng', async () => {
    await runImport(db, admin, 'rooms', (await load(await roomsWorkbook(), 'rooms')).valid)
    await runImport(db, admin, 'tenants', (await load(await tenantsWorkbook(), 'tenants')).valid)
    const file = await buildXlsx({
      K: [
        TENANT_HEADERS,
        ['Nước ngoài', 'A', 'Người Khác', '+1 415 555 0100', 'ZZ999', null, null, null, null], // trùng SĐT với John (CSDL)
        ['Nước ngoài', 'A', 'Mới 1', '+1 415 555 0200', 'NEW1', null, null, null, null],
        ['Nước ngoài', 'A', 'Mới 2', '+1 415 555 0200', 'NEW2', null, null, null, null], // trùng SĐT trong file
      ],
    })
    const { valid } = await load(file, 'tenants')
    const conflicts = await findImportConflicts(db, valid)
    expect(conflicts.map((c) => [c.row, c.field])).toEqual([
      [2, 'phone'],
      [4, 'phone'],
    ])
  })
})

describe('runImport — hợp đồng, cọc, công nợ, chỉ số, tài sản', () => {
  let db: DB
  const admin = ctxOf(['settings'])
  const ident = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, k]))
  async function run(target: Parameters<typeof validateRows>[0], rows: Record<string, unknown>[]) {
    const { valid, errors } = validateRows(target, rows, ident(Object.keys(rows[0]).filter((k) => !k.startsWith('__'))))
    expect(errors).toEqual([])
    return runImport(db, admin, target, valid)
  }
  const lease = {
    facilityCode: 'A',
    roomCode: '101',
    tenantDocument: '012345678901',
    startDate: '01/01/2026',
    endDate: '31/12/2027',
    monthlyRent: '9.000.000',
    depositAmount: '9.000.000',
    legacyCode: 'OLD-1',
  }
  beforeEach(async () => {
    db = await createTestDb()
    const { meters } = await import('@/db')
    const [f] = await db.insert(facilities).values({ code: 'A', name: 'A' }).returning()
    const [r] = await db.insert(rooms).values({ facilityId: f.id, code: '101' }).returning()
    await db.insert(tenants).values({
      kind: 'vietnamese',
      homeFacilityId: f.id,
      fullName: 'K',
      phone: '+84901234567',
      idNumber: '012345678901',
    })
    await db.insert(meters).values({ roomId: r.id, utility: 'electric', installedOn: '2025-01-01', startReading: 0 })
  })
  it('hợp đồng: hai dòng cùng mã cũ khác ngày bắt đầu → lần 2 cập nhật, không tạo hợp đồng thứ hai', async () => {
    const { leases } = await import('@/db')
    expect(await run('leases', [lease])).toEqual({ created: 1, updated: 0 })
    expect(await run('leases', [{ ...lease, startDate: '02/01/2026', endDate: '31/12/2028' }])).toEqual({
      created: 0,
      updated: 1,
    })
    const all = await db.select().from(leases)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ legacyCode: 'OLD-1', endDate: '2028-12-31', status: 'active' })
  })
  it('số dư cọc nhập 2 lần → số dư không đổi; sửa số thì cập nhật chính dòng đó', async () => {
    const { depositEntries } = await import('@/db')
    await run('leases', [lease])
    const dep = { facilityCode: 'A', legacyCode: 'OLD-1', amount: '5.000.000' }
    await run('deposits', [dep])
    expect(await run('deposits', [dep])).toEqual({ created: 0, updated: 0 })
    expect(await run('deposits', [{ ...dep, amount: '6.000.000' }])).toEqual({ created: 0, updated: 1 })
    const rowsDb = await db.select().from(depositEntries)
    expect(rowsDb).toHaveLength(1)
    expect(rowsDb[0]).toMatchObject({ amount: 6000000, status: 'done' })
  })
  it('công nợ nhập 2 lần → một hoá đơn import:debt; đã có khoản thu → lỗi dòng', async () => {
    const { invoices, payments } = await import('@/db')
    await run('leases', [lease])
    const debt = { facilityCode: 'A', roomCode: '101', amount: '3.000.000' }
    await run('debts', [debt])
    await run('debts', [{ ...debt, amount: '4.000.000' }])
    const inv = await db.select().from(invoices)
    expect(inv).toHaveLength(1)
    expect(inv[0].source).toBe('import:debt')
    await db.insert(payments).values({
      invoiceId: inv[0].id,
      paidOn: '2026-11-01',
      amount: 100,
      method: 'cash',
      receivedBy: crypto.randomUUID(),
    })
    const { valid } = validateRows('debts', [debt], ident(Object.keys(debt)))
    await expect(runImport(db, admin, 'debts', valid)).rejects.toThrow('Công nợ đã có khoản thu')
  })
  it('chỉ số và tài sản chạy lại không trùng', async () => {
    const { meterReadings, assets } = await import('@/db')
    const reading = { facilityCode: 'A', roomCode: '101', utility: 'Điện', period: '11/2026', value: 150 }
    await run('meter_readings', [reading])
    await run('meter_readings', [{ ...reading, value: 160 }])
    const rd = await db.select().from(meterReadings)
    expect(rd).toHaveLength(1)
    expect(rd[0].value).toBe(160)
    const asset = { facilityCode: 'A', code: 'TV1', name: 'Tivi', value: '5.000.000', roomCode: '101' }
    expect(await run('assets', [asset])).toEqual({ created: 1, updated: 0 })
    expect(await run('assets', [asset])).toEqual({ created: 0, updated: 0 })
    expect(await db.select().from(assets)).toHaveLength(1)
  })
})
