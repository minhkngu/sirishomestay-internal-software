import '@/modules/registrations'
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  assets,
  facilities,
  files,
  handoverItems,
  handovers,
  invoiceLines,
  invoices,
  leases,
  rooms,
  tenants,
} from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { resolveOwner } from '@/server/files/owners'
import { exportDocument } from '@/server/templates/service'
import { MemoryStorage } from '@/server/storage/memory'
import { createTestDb } from '../helpers/db'

// Chỉ import registrations: nếu thiếu đăng ký thì resolver/loader báo "chưa được hỗ trợ".
let db: DB, facilityId: string, roomId: string, leaseId: string
beforeEach(async () => {
  db = await createTestDb()
  const [f] = await db.insert(facilities).values({ code: 'A', name: 'Thảo Điền' }).returning()
  facilityId = f.id
  const [r] = await db.insert(rooms).values({ facilityId, code: '301' }).returning()
  roomId = r.id
  const [t] = await db
    .insert(tenants)
    .values({ kind: 'vietnamese', homeFacilityId: facilityId, fullName: 'An', phone: '+84901234567', idNumber: '1' })
    .returning()
  const [l] = await db
    .insert(leases)
    .values({
      code: 'HD1',
      roomId: r.id,
      tenantId: t.id,
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      monthlyRent: 9000000,
      depositAmount: 9000000,
    })
    .returning()
  leaseId = l.id
})

describe('registrations', () => {
  it('ảnh bàn giao: resolveOwner trả đúng facilityId', async () => {
    const [h] = await db.insert(handovers).values({ leaseId, roomId, kind: 'check_in', date: '2026-01-01' }).returning()
    const [a] = await db
      .insert(assets)
      .values({ code: 'AC', name: 'Máy lạnh', value: 1, facilityId, locationKind: 'room', locationId: roomId })
      .returning()
    const [item] = await db.insert(handoverItems).values({ handoverId: h.id, assetId: a.id }).returning()
    expect(await resolveOwner(db, 'handover_photo', item.id)).toEqual({ facilityId })
  })

  it('hoá đơn: exportDocument trả PDF không rỗng', async () => {
    const [i] = await db
      .insert(invoices)
      .values({
        code: 'HD-01',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
        issueDate: '2026-12-01',
      })
      .returning()
    await db.insert(invoiceLines).values({
      invoiceId: i.id,
      type: 'rent',
      description: 'Tiền phòng',
      quantity: 1,
      unitPrice: 9000000,
      amount: 9000000,
    })
    const ctx: AccessContext = {
      userId: crypto.randomUUID(),
      email: 'a@x.com',
      fullName: 'An',
      isAdmin: false,
      facilityIds: new Set([facilityId]),
      permissions: new Set(['billing']),
    }
    const storage = new MemoryStorage()
    const out = await exportDocument(db, ctx, storage, { docType: 'invoice_monthly', entityId: i.id, format: 'pdf' })
    const [row] = await db.select().from(files).where(eq(files.id, out.fileId))
    const bytes = await storage.read(row.storageKey)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })
})
