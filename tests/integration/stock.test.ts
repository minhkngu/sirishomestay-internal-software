import { it, expect } from 'vitest'
import { facilities, rooms, stockMoves } from '@/db'
import { createTestDb } from '../helpers/db'
import { createStockItem, receiveStock, moveStock, consumeStock, listStock } from '@/server/stock/service'
import type { AccessContext } from '@/domain/access'

it('nhập, chuyển vật tư trong cơ sở và từ chối chuyển quá số lượng hoặc khác cơ sở', async () => {
  const db = await createTestDb()
  const [facility] = await db.insert(facilities).values({ code: 'BT', name: 'Bình Thạnh' }).returning()
  const [room] = await db.insert(rooms).values({ facilityId: facility.id, code: '301' }).returning()
  const ctx: AccessContext = {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    permissions: new Set(['assets']),
    facilityIds: new Set([facility.id]),
    isAdmin: false,
  }
  const warehouse = { kind: 'warehouse' as const, id: facility.id }
  const destination = { kind: 'room' as const, id: room.id }
  await expect(
    createStockItem(db, ctx, { facilityId: facility.id, name: '', unit: 'cái', category: '' }),
  ).rejects.toThrow('Thông tin vật tư chưa hợp lệ')
  const item = await createStockItem(db, ctx, {
    facilityId: facility.id,
    name: 'Bóng đèn',
    unit: 'cái',
    category: 'Điện',
  })
  await receiveStock(db, ctx, item.id, warehouse, 20, 'Nhập')
  await moveStock(db, ctx, item.id, warehouse, destination, 3, 'Lắp')
  expect(await db.select().from(stockMoves)).toHaveLength(2)
  const levels = await listStock(db, ctx, { facilityId: facility.id })
  expect(levels.find((x) => x.locationKind === 'warehouse')?.quantity).toBe(17)
  expect(levels.find((x) => x.locationKind === 'room')?.quantity).toBe(3)
  await expect(moveStock(db, ctx, item.id, warehouse, destination, 25, 'Lắp')).rejects.toThrow(
    'Không đủ số lượng tại vị trí nguồn',
  )
  await expect(
    moveStock(db, { ...ctx, facilityIds: new Set() }, item.id, warehouse, destination, 1, ''),
  ).rejects.toThrow('Không tìm thấy')
  await expect(
    consumeStock(db, { ...ctx, permissions: new Set(['meters']) }, item.id, warehouse, 1, ''),
  ).rejects.toThrow('Bạn không có quyền')
  await consumeStock(db, ctx, item.id, destination, 2, 'Hỏng')
  expect((await listStock(db, ctx, { location: destination }))[0].quantity).toBe(1)
})
