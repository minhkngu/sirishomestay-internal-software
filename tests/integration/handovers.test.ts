import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { assets, facilities, rooms } from '@/db'
import { createTenant } from '@/modules/tenants/server/tenants/service'
import { createLease } from '@/modules/leasing/server/contracts/service'
import {
  startHandover,
  getHandover,
  saveHandover,
  completeHandover,
  listHandovers,
} from '@/modules/leasing/server/handovers/service'
import { assetHistory, setAssetStatus } from '@/modules/assets/server/assets/service'
import { requestUpload, confirmUpload, listFiles } from '@/modules/platform/server/files/service'
import { MemoryStorage } from '@/modules/platform/server/storage/memory'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(perms),
    facilityIds: new Set(facilityIds),
    isAdmin: perms.includes('settings'),
  }
}

describe('handovers', () => {
  let db: DB
  let fa: string
  let fb: string
  let r301: string
  let r302: string
  let leaseId: string
  const ids: Record<string, string> = {}
  const admin = ctxOf(['settings'])
  const lan = () => ctxOf(['tenants_contracts'], [fa])

  beforeEach(async () => {
    db = await createTestDb()
    fa = (await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning())[0].id
    r301 = (await db.insert(rooms).values({ facilityId: fa, code: '301' }).returning())[0].id
    r302 = (await db.insert(rooms).values({ facilityId: fa, code: '302' }).returning())[0].id
    const add = async (code: string, roomId: string, value: number, extra: Record<string, unknown> = {}) => {
      ids[code] = (
        await db
          .insert(assets)
          .values({
            code,
            name: `Tài sản ${code}`,
            value,
            facilityId: fa,
            locationKind: 'room',
            locationId: roomId,
            ...extra,
          })
          .returning()
      )[0].id
    }
    await add('AC-301', r301, 9_000_000)
    await add('BED-301', r301, 4_500_000)
    await add('TV-301', r301, 6_000_000)
    await add('AC-302', r302, 9_000_000)
    await add('OLD-301', r301, 100_000, { status: 'disposed' })
    const tenant = (
      await createTenant(db, admin, {
        kind: 'vietnamese',
        homeFacilityId: fa,
        fullName: 'Khách A',
        phone: '0901234567',
        idNumber: '012345678901',
      })
    ).id
    leaseId = (
      await createLease(db, lan(), {
        roomId: r301,
        tenantId: tenant,
        startDate: '2026-10-15',
        endDate: '2027-10-14',
        monthlyRent: 9_000_000,
        depositAmount: 9_000_000,
      })
    ).lease.id
  })

  it('check-in lấy đúng các tài sản đang ở phòng (bỏ đã thanh lý và phòng khác); bắt đầu lại khi còn nháp thì trả về bản cũ', async () => {
    const h = await startHandover(db, lan(), leaseId, 'check_in')
    const full = await getHandover(db, lan(), h.id)
    expect(full.items.map((i) => i.assetCode).sort()).toEqual(['AC-301', 'BED-301', 'TV-301'])
    expect(full.items.every((i) => i.condition === 'Tốt')).toBe(true)
    expect(full.status).toBe('draft')
    expect((await startHandover(db, lan(), leaseId, 'check_in')).id).toBe(h.id)
  })

  it('check-out sao đúng danh sách từ check-in, kể cả khi tài sản trong phòng đã đổi', async () => {
    const inH = await startHandover(db, lan(), leaseId, 'check_in')
    await completeHandover(db, lan(), inH.id)
    await db.update(assets).set({ locationId: r302 }).where(eq(assets.id, ids['TV-301'])) // chuyển đi sau check-in
    const out = await startHandover(db, lan(), leaseId, 'check_out')
    const items = (await getHandover(db, lan(), out.id)).items
    expect(items.map((i) => i.assetCode).sort()).toEqual(['AC-301', 'BED-301', 'TV-301'])
  })

  it('đánh dấu hư kèm phạt 500.000 → tổng phạt 500.000; mất mà chưa nhập phạt → gợi ý bằng giá trị tài sản', async () => {
    const h = await startHandover(db, lan(), leaseId, 'check_out')
    const items = (await getHandover(db, lan(), h.id)).items
    const byCode = (c: string) => items.find((i) => i.assetCode === c)!
    await saveHandover(db, lan(), h.id, {
      items: [{ id: byCode('AC-301').id, condition: 'Hư', damaged: true, penalty: 500_000 }],
    })
    expect((await getHandover(db, lan(), h.id)).penaltyTotal).toBe(500_000)
    await saveHandover(db, lan(), h.id, { items: [{ id: byCode('TV-301').id, condition: 'Mất', missing: true }] })
    const after = await getHandover(db, lan(), h.id)
    expect(after.items.find((i) => i.assetCode === 'TV-301')).toMatchObject({ missing: true, penalty: 6_000_000 })
    expect(after.penaltyTotal).toBe(6_500_000)
  })

  it('biên bản không còn phần chỉ số đồng hồ', async () => {
    const h = await startHandover(db, lan(), leaseId, 'check_in')
    const full = await getHandover(db, lan(), h.id)
    expect(full).not.toHaveProperty('readings')
    expect(full).not.toHaveProperty('meters')
  })

  it('biên bản đã hoàn tất thì không sửa được', async () => {
    const h = await startHandover(db, lan(), leaseId, 'check_in')
    await completeHandover(db, lan(), h.id)
    await expect(saveHandover(db, lan(), h.id, { items: [] })).rejects.toThrow('Biên bản đã hoàn tất')
    expect((await listHandovers(db, lan(), leaseId)).map((x) => [x.kind, x.status])).toEqual([['check_in', 'done']])
  })

  it('ảnh biên bản gắn theo từng món; người cơ sở khác → NotFoundError; thiếu quyền → ForbiddenError', async () => {
    const h = await startHandover(db, lan(), leaseId, 'check_in')
    const item = (await getHandover(db, lan(), h.id)).items[0]
    const storage = new MemoryStorage()
    const up = await requestUpload(db, lan(), storage, {
      ownerType: 'handover_photo',
      ownerId: item.id,
      contentType: 'image/webp',
    })
    await confirmUpload(db, lan(), up.fileId)
    expect(await listFiles(db, lan(), 'handover_photo', item.id)).toHaveLength(1)
    expect((await getHandover(db, lan(), h.id)).items.find((i) => i.id === item.id)!.photoIds).toEqual([up.fileId])
    const other = ctxOf(['tenants_contracts'], [fb])
    await expect(getHandover(db, other, h.id)).rejects.toThrow(NotFoundError)
    await expect(startHandover(db, other, leaseId, 'check_in')).rejects.toThrow(NotFoundError)
    await expect(
      requestUpload(db, other, storage, { ownerType: 'handover_photo', ownerId: item.id, contentType: 'image/webp' }),
    ).rejects.toThrow(NotFoundError)
    await expect(getHandover(db, ctxOf(['billing'], [fa]), h.id)).rejects.toThrow(ForbiddenError)
    await expect(
      startHandover(db, ctxOf(['meters', 'assets', 'incidents'], [fa]), leaseId, 'check_in'),
    ).rejects.toThrow(ForbiddenError)
  })

  it('lịch sử tài sản có dòng bàn giao', async () => {
    const h = await startHandover(db, lan(), leaseId, 'check_out')
    const item = (await getHandover(db, lan(), h.id)).items.find((i) => i.assetCode === 'AC-301')!
    await saveHandover(db, lan(), h.id, { items: [{ id: item.id, condition: 'Hư', damaged: true, penalty: 500_000 }] })
    const hist = await assetHistory(db, ctxOf(['assets'], [fa]), ids['AC-301'])
    expect(hist.handovers).toHaveLength(1)
    expect(hist.handovers[0]).toMatchObject({ kind: 'check_out', condition: 'Hư', damaged: true, penalty: 500_000 })
    await setAssetStatus(db, admin, ids['AC-301'], 'broken')
  })

  it('hợp đồng không tồn tại → NotFoundError', async () => {
    await expect(startHandover(db, lan(), crypto.randomUUID(), 'check_in')).rejects.toThrow(NotFoundError)
    await expect(saveHandover(db, lan(), crypto.randomUUID(), { items: [] })).rejects.toThrow(NotFoundError)
    expect(ValidationError).toBeDefined()
  })
})
