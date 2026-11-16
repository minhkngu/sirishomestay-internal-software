import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, rooms, auditLogs } from '@/db'
import { createAsset, updateAsset, listAssets, getAsset, moveAssets, assetHistory, setAssetStatus } from '@/server/assets/service'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import type { DB } from '@/db/client'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(facilityIds), isAdmin: perms.includes('settings') }
}

describe('assets', () => {
  let db: DB
  let fa: string
  let fb: string
  let r301: string
  let r302: string
  let rB: string
  const admin = ctxOf(['settings'])
  const hung = () => ctxOf(['assets'], [fb])
  const lan = () => ctxOf(['assets'], [fa])

  beforeEach(async () => {
    db = await createTestDb()
    fa = (await db.insert(facilities).values({ code: 'TD', name: 'Thảo Điền' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning())[0].id
    r301 = (await db.insert(rooms).values({ facilityId: fb, code: '301' }).returning())[0].id
    rB = (await db.insert(rooms).values({ facilityId: fb, code: '302' }).returning())[0].id
    r302 = (await db.insert(rooms).values({ facilityId: fa, code: '101' }).returning())[0].id
  })
  const mk = (code: string, over: Record<string, unknown> = {}) =>
    createAsset(db, hung(), { code, name: 'Máy lạnh', category: 'Điện lạnh', value: 8_000_000, condition: 'Tốt', facilityId: fb, location: { kind: 'warehouse', id: fb }, ...over })

  it('tạo tài sản; trùng mã báo lỗi tiếng Việt', async () => {
    const a = await mk('AC-01')
    expect(a).toMatchObject({ code: 'AC-01', locationKind: 'warehouse', locationId: fb, facilityId: fb, status: 'in_use' })
    await expect(mk('AC-01')).rejects.toThrow('Mã tài sản đã tồn tại')
  })

  it('chuyển 2 máy lạnh từ kho sang phòng 301 → vị trí đổi và có 2 dòng lịch sử', async () => {
    const a = await mk('AC-01')
    const b = await mk('AC-02')
    await moveAssets(db, hung(), [a.id, b.id], { kind: 'room', id: r301 }, 'Lắp cho khách mới')
    const after = await listAssets(db, hung(), { location: { kind: 'room', id: r301 } })
    expect(after.map((x) => x.code).sort()).toEqual(['AC-01', 'AC-02'])
    for (const x of [a, b]) {
      const h = await assetHistory(db, hung(), x.id)
      expect(h.moves).toHaveLength(1)
      expect(h.moves[0]).toMatchObject({ fromKind: 'warehouse', toKind: 'room', toId: r301, reason: 'Lắp cho khách mới' })
    }
    expect((await db.select().from(auditLogs)).filter((l) => l.entity === 'asset_move')).toHaveLength(2)
  })

  it('chuyển sang phòng thuộc cơ sở khác → ValidationError; không có tài sản nào bị đổi', async () => {
    const a = await mk('AC-01')
    const b = await mk('AC-02')
    await expect(moveAssets(db, admin, [a.id, b.id], { kind: 'room', id: r302 }, 'x')).rejects.toThrow(ValidationError)
    expect((await getAsset(db, hung(), a.id)).locationKind).toBe('warehouse')
  })

  it('chuyển cùng lúc nhiều món mà một món không tồn tại → NotFoundError, không đổi gì', async () => {
    const a = await mk('AC-01')
    await expect(moveAssets(db, hung(), [a.id, crypto.randomUUID()], { kind: 'room', id: r301 }, 'x')).rejects.toThrow(NotFoundError)
    expect((await getAsset(db, hung(), a.id)).locationKind).toBe('warehouse')
  })

  it('người của cơ sở khác → NotFoundError; thiếu nhóm quyền → ForbiddenError', async () => {
    const a = await mk('AC-01')
    await expect(getAsset(db, lan(), a.id)).rejects.toThrow(NotFoundError)
    await expect(moveAssets(db, lan(), [a.id], { kind: 'common', id: fb }, 'x')).rejects.toThrow(NotFoundError)
    expect(await listAssets(db, lan(), {})).toHaveLength(0)
    await expect(getAsset(db, ctxOf(['meters'], [fb]), a.id)).rejects.toThrow(ForbiddenError)
    await expect(createAsset(db, ctxOf(['billing'], [fb]), { code: 'X', name: 'X', category: 'c', value: 1, condition: 'Tốt', facilityId: fb, location: { kind: 'warehouse', id: fb } })).rejects.toThrow(ForbiddenError)
  })

  it('lọc theo vị trí, từ khoá không dấu, trạng thái; báo hỏng / thanh lý', async () => {
    const a = await mk('AC-01', { name: 'Máy lạnh Daikin' })
    await mk('TV-01', { name: 'Tivi Samsung', category: 'Điện tử' })
    expect((await listAssets(db, hung(), { q: 'may lanh' })).map((x) => x.code)).toEqual(['AC-01'])
    expect((await listAssets(db, hung(), { q: 'TV' })).map((x) => x.code)).toEqual(['TV-01'])
    await setAssetStatus(db, hung(), a.id, 'broken')
    expect((await listAssets(db, hung(), { status: 'broken' })).map((x) => x.code)).toEqual(['AC-01'])
    await setAssetStatus(db, hung(), a.id, 'disposed')
    expect((await listAssets(db, hung(), {})).map((x) => x.code)).toEqual(['TV-01']) // đã thanh lý mặc định ẩn
    expect(await listAssets(db, hung(), { status: 'disposed' })).toHaveLength(1)
  })

  it('sửa thông tin tài sản', async () => {
    const a = await mk('AC-01')
    const u = await updateAsset(db, hung(), a.id, { condition: 'Trầy xước', value: 7_000_000 })
    expect(u).toMatchObject({ condition: 'Trầy xước', value: 7_000_000 })
  })
})
