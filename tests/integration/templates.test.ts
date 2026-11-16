import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, files } from '@/db'
import {
  createTemplate, attachTemplateFile, listTemplates, setDefaultTemplate, removeTemplate, exportDocument, registerDocLoader,
} from '@/server/templates/service'
import { requestUpload, confirmUpload } from '@/server/files/service'
import { MemoryStorage } from '@/server/storage/memory'
import { DOCX_MIME } from '@/lib/docx'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import { buildSampleTemplate } from '../../scripts/build-sample-templates'
import type { DB } from '@/db/client'
import { eq } from 'drizzle-orm'

function ctxOf(perms: Permission[], facilityIds: string[] = []): AccessContext {
  return { userId: crypto.randomUUID(), email: 'a@x.com', fullName: 'A', permissions: new Set(perms), facilityIds: new Set(facilityIds), isAdmin: perms.includes('settings') }
}

describe('templates', () => {
  let db: DB
  let storage: MemoryStorage
  let fa: string
  let fb: string
  const admin = ctxOf(['settings'])
  beforeEach(async () => {
    db = await createTestDb()
    storage = new MemoryStorage()
    fa = (await db.insert(facilities).values({ code: 'A', name: 'Thảo Điền' }).returning())[0].id
    fb = (await db.insert(facilities).values({ code: 'B', name: 'B' }).returning())[0].id
  })

  async function addTemplate(docType: 'lease' | 'invoice_monthly', name: string) {
    const t = await createTemplate(db, admin, { docType, name })
    const up = await requestUpload(db, admin, storage, { ownerType: 'template', ownerId: t.id, contentType: DOCX_MIME, name: `${name}.docx` })
    const [row] = await db.select().from(files).where(eq(files.id, up.fileId))
    await storage.write(row.storageKey, await buildSampleTemplate(docType), DOCX_MIME)
    await confirmUpload(db, admin, up.fileId)
    return attachTemplateFile(db, admin, t.id, up.fileId)
  }

  it('mẫu đầu tiên của một loại tự thành mặc định; đặt mặc định mẫu khác chỉ giữ một mẫu mặc định', async () => {
    const a = await addTemplate('lease', 'Bản tiếng Việt')
    const b = await addTemplate('lease', 'Bản song ngữ')
    expect(a.isDefault).toBe(true)
    expect(b.isDefault).toBe(false)
    await setDefaultTemplate(db, admin, b.id)
    const list = await listTemplates(db, ctxOf(['billing'], [fa]), 'lease')
    expect(list.filter((t) => t.isDefault).map((t) => t.name)).toEqual(['Bản song ngữ'])
    expect(list).toHaveLength(2)
  })

  it('chỉ nhóm settings tạo, đặt mặc định, xoá mẫu', async () => {
    const staff = ctxOf(['tenants_contracts'], [fa])
    await expect(createTemplate(db, staff, { docType: 'lease', name: 'x' })).rejects.toThrow(ForbiddenError)
    const a = await addTemplate('lease', 'A')
    await expect(setDefaultTemplate(db, staff, a.id)).rejects.toThrow(ForbiddenError)
    await expect(removeTemplate(db, staff, storage, a.id)).rejects.toThrow(ForbiddenError)
  })

  it('xoá mẫu mặc định → mẫu còn lại lên làm mặc định; file bị xoá khỏi storage', async () => {
    const a = await addTemplate('lease', 'A')
    const b = await addTemplate('lease', 'B')
    const [fileA] = await db.select().from(files).where(eq(files.id, a.fileId!))
    await removeTemplate(db, admin, storage, a.id)
    expect(storage.deleted).toContain(fileA.storageKey)
    expect((await listTemplates(db, admin, 'lease')).map((t) => [t.id, t.isDefault])).toEqual([[b.id, true]])
  })

  describe('exportDocument', () => {
    const entities = {
      now: '2026-10-14', tenant: { kind: 'vietnamese' as const, fullName: 'Nguyễn Văn An', idDocument: '012345678901' },
      facility: { name: 'Thảo Điền' }, room: { code: '301' },
      lease: { code: 'TD-HĐ-2026-0001', startDate: '2026-10-15', endDate: '2027-10-14', monthlyRent: 9_000_000, depositAmount: 9_000_000 },
    }
    beforeEach(() => {
      registerDocLoader('lease', async (_db, _ctx, entityId) => ({ entities, facilityId: entityId === 'in-b' ? fb : fa, baseName: 'hop-dong-301' }))
    })

    it('điền mẫu mặc định, lưu bản xuất vào files với đúng cơ sở và loại giấy tờ', async () => {
      await addTemplate('lease', 'Mặc định')
      const id = crypto.randomUUID()
      const r = await exportDocument(db, ctxOf(['tenants_contracts'], [fa]), storage, { docType: 'lease', entityId: id })
      const [row] = await db.select().from(files).where(eq(files.id, r.fileId))
      expect(row).toMatchObject({ ownerType: 'export', ownerId: id, facilityId: fa, contentType: DOCX_MIME, name: 'hop-dong-301.docx' })
      expect(row.meta).toEqual({ docType: 'lease' })
      expect(row.confirmedAt).not.toBeNull()
      const bytes = new TextDecoder('latin1').decode(new Uint8Array(await storage.read(row.storageKey)))
      expect(bytes.startsWith('PK')).toBe(true)
    })

    it('chưa có mẫu → lỗi tiếng Việt', async () => {
      await expect(exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID() })).rejects.toThrow('Chưa có mẫu cho loại giấy tờ này')
    })

    it('cơ sở khác → NotFoundError; thiếu nhóm quyền → ForbiddenError', async () => {
      await addTemplate('lease', 'Mặc định')
      await expect(exportDocument(db, ctxOf(['tenants_contracts'], [fa]), storage, { docType: 'lease', entityId: 'in-b' })).rejects.toThrow(NotFoundError)
      await expect(exportDocument(db, ctxOf(['billing'], [fa]), storage, { docType: 'lease', entityId: crypto.randomUUID() })).rejects.toThrow(ForbiddenError)
    })

    it('chọn mẫu cụ thể theo templateId; mẫu của loại khác bị từ chối', async () => {
      const other = await addTemplate('invoice_monthly', 'Hoá đơn')
      await addTemplate('lease', 'HĐ')
      await expect(exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), templateId: other.id })).rejects.toThrow('Mẫu không thuộc loại giấy tờ này')
    })
  })
})
