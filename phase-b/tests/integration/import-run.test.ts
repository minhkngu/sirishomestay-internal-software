import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { facilities, rooms, tenants, auditLogs } from '@/db'
import { parseWorkbook } from '@/features/import/parse'
import { suggestMapping } from '@/features/import/targets'
import { validateRows } from '@/features/import/validate'
import { runImport } from '@/features/import/run'
import { ForbiddenError, type AccessContext, type Permission } from '@/lib/access'
import { createTestDb } from '../helpers/db'
import { roomsWorkbook, tenantsWorkbook, buildXlsx, TENANT_HEADERS } from '../fixtures/build'
import { findImportConflicts } from '@/features/import/run'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[]): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(), isAdmin: perms.includes('settings') }
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
  beforeEach(async () => { db = await createTestDb() })

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
    const other = await buildXlsx({ K: [TENANT_HEADERS, ['Nước ngoài', 'A', 'Người Khác', '+1 415 555 0100', 'ZZ999', null, null, null, null]] })
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
    await runImport(db, admin, 'tenants', (await load(await tenantsWorkbook({ phone2: '0907777777' }), 'tenants')).valid)
    const upd = (await db.select().from(auditLogs)).find((l) => l.entity === 'tenant' && l.action === 'update')!
    expect((upd.before as { phone: string }).phone).toBe('+84901234567')
    expect((upd.after as { phone: string }).phone).toBe('+84907777777')
  })

  it('xem trước báo trùng với CSDL và trùng trong file theo từng dòng', async () => {
    await runImport(db, admin, 'rooms', (await load(await roomsWorkbook(), 'rooms')).valid)
    await runImport(db, admin, 'tenants', (await load(await tenantsWorkbook(), 'tenants')).valid)
    const file = await buildXlsx({ K: [TENANT_HEADERS,
      ['Nước ngoài', 'A', 'Người Khác', '+1 415 555 0100', 'ZZ999', null, null, null, null], // trùng SĐT với John (CSDL)
      ['Nước ngoài', 'A', 'Mới 1', '+1 415 555 0200', 'NEW1', null, null, null, null],
      ['Nước ngoài', 'A', 'Mới 2', '+1 415 555 0200', 'NEW2', null, null, null, null], // trùng SĐT trong file
    ] })
    const { valid } = await load(file, 'tenants')
    const conflicts = await findImportConflicts(db, valid)
    expect(conflicts.map((c) => [c.row, c.field])).toEqual([[2, 'phone'], [4, 'phone']])
  })
})
