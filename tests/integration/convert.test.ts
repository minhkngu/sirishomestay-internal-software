import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { facilities, files } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { MemoryStorage } from '@/modules/platform/server/storage/memory'
import { exportDocument, registerDocLoader } from '@/server/templates/service'
import { createTestDb } from '../helpers/db'
import { addHtmlTemplate } from '../helpers/templates'

const admin: AccessContext = {
  userId: crypto.randomUUID(),
  email: 'a@x.com',
  fullName: 'A',
  permissions: new Set(['settings']),
  facilityIds: new Set(),
  isAdmin: true,
}

describe('xuất PDF và ảnh (không cần dịch vụ ngoài)', () => {
  let db: DB, storage: MemoryStorage, facilityId: string
  // Thư viện PDF tự nạp wasm bằng fetch(data:...); chỉ cần bảo đảm không có yêu cầu ra mạng
  const realFetch = globalThis.fetch
  const fetchSpy = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).startsWith('data:')) return realFetch(input, init)
    throw new Error('không được gọi mạng')
  })
  beforeEach(async () => {
    db = await createTestDb()
    storage = new MemoryStorage()
    fetchSpy.mockClear()
    facilityId = (await db.insert(facilities).values({ code: 'A', name: 'A' }).returning())[0].id
    registerDocLoader('lease', async () => ({ entities: { now: '2026-11-16' }, facilityId, baseName: 'tai-lieu' }))
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('xuất PDF hợp đồng chạy ngay trong app: không gọi mạng, không cần dịch vụ ngoài', async () => {
    await addHtmlTemplate(db, admin, 'lease')
    const r = await exportDocument(db, admin, storage, {
      docType: 'lease',
      entityId: crypto.randomUUID(),
      format: 'pdf',
    })
    const [row] = await db.select().from(files).where(eq(files.id, r.fileId))
    expect(row).toMatchObject({ contentType: 'application/pdf', name: 'tai-lieu.pdf' })
    expect(new TextDecoder().decode((await storage.read(row.storageKey)).slice(0, 5))).toBe('%PDF-')
    expect(fetchSpy.mock.calls.filter(([url]) => !String(url).startsWith('data:'))).toEqual([])
  })
  it('không cho xuất hợp đồng thành ảnh', async () => {
    await addHtmlTemplate(db, admin, 'lease')
    await expect(
      exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), format: 'png' }),
    ).rejects.toThrow('Chỉ hoá đơn mới xuất được ảnh')
  })
  it('hoá đơn chỉ xuất PDF hoặc ảnh, không xuất Word', async () => {
    await expect(
      exportDocument(db, admin, storage, { docType: 'invoice_monthly', entityId: crypto.randomUUID(), format: 'docx' }),
    ).rejects.toThrow('Hoá đơn và phiếu thu chỉ xuất PDF hoặc ảnh')
  })
})
