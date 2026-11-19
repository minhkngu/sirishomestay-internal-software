import { describe, it, expect, beforeEach } from 'vitest'
import { facilities, files } from '@/db'
import {
  createTemplate,
  updateTemplate,
  isUsableTemplate,
  listTemplates,
  previewDocument,
  setDefaultTemplate,
  removeTemplate,
  exportDocument,
  registerDocLoader,
} from '@/server/templates/service'
import { MemoryStorage } from '@/modules/platform/server/storage/memory'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import type { AccessContext, Permission } from '@/domain/access'
import { createTestDb } from '../helpers/db'
import { addHtmlTemplate, addLegacyTemplate } from '../helpers/templates'
import type { DB } from '@/db/client'
import { eq } from 'drizzle-orm'
import PizZip from 'pizzip'

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

  const addTemplate = (docType: 'lease' | 'invoice_monthly', name: string) =>
    addHtmlTemplate(db, admin, docType, { name })

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

  it('xoá mẫu mặc định → mẫu còn lại lên làm mặc định', async () => {
    const a = await addTemplate('lease', 'A')
    const b = await addTemplate('lease', 'B')
    await removeTemplate(db, admin, storage, a.id)
    expect((await listTemplates(db, admin, 'lease')).map((t) => [t.id, t.isDefault])).toEqual([[b.id, true]])
  })

  describe('mẫu soạn trong app (body, style)', () => {
    it('updateTemplate đặt nội dung, tên và kiểu; mẫu đầu tiên có nội dung thành mặc định', async () => {
      const t = await createTemplate(db, admin, { docType: 'lease', name: 'Mới' })
      expect(t).toMatchObject({ body: null, style: 'formal' })
      expect(isUsableTemplate(t)).toBe(false)
      const u = await updateTemplate(db, admin, t.id, {
        name: 'Hợp đồng hiện đại',
        body: '<p>Xin chào</p>',
        style: 'modern',
      })
      expect(u).toMatchObject({ name: 'Hợp đồng hiện đại', body: '<p>Xin chào</p>', style: 'modern', isDefault: true })
      expect(isUsableTemplate(u)).toBe(true)
      const t2 = await createTemplate(db, admin, { docType: 'lease', name: 'Thứ hai', body: '<p>b</p>' })
      expect(t2.isDefault).toBe(false)
    })
    it('chỉ nhóm settings sửa mẫu; nội dung rỗng, quá dài hoặc kiểu lạ bị từ chối', async () => {
      const t = await createTemplate(db, admin, { docType: 'lease', name: 'Mẫu' })
      await expect(updateTemplate(db, ctxOf(['tenants_contracts'], [fa]), t.id, { body: '<p>x</p>' })).rejects.toThrow(
        ForbiddenError,
      )
      await expect(updateTemplate(db, admin, t.id, { body: '   ' })).rejects.toThrow('Nhập nội dung mẫu')
      await expect(updateTemplate(db, admin, t.id, { body: '<p>' + 'a'.repeat(200_001) + '</p>' })).rejects.toThrow(
        'quá dài',
      )
      await expect(updateTemplate(db, admin, t.id, { style: 'khac' as never })).rejects.toThrow(
        'Kiểu trình bày không hợp lệ',
      )
      await expect(updateTemplate(db, admin, crypto.randomUUID(), { name: 'x' })).rejects.toThrow(NotFoundError)
    })
    it('mẫu Word cũ (chỉ có tệp) không dùng được', async () => {
      const legacy = await addLegacyTemplate(db, admin, 'lease')
      expect(isUsableTemplate(legacy)).toBe(false)
    })
  })

  describe('exportDocument', () => {
    const entities = {
      now: '2026-10-14',
      tenant: { kind: 'vietnamese' as const, fullName: 'Nguyễn Văn An', idDocument: '012345678901' },
      facility: { name: 'Thảo Điền' },
      room: { code: '301' },
      lease: {
        code: 'TD-HĐ-2026-0001',
        startDate: '2026-10-15',
        endDate: '2027-10-14',
        monthlyRent: 9_000_000,
        depositAmount: 9_000_000,
      },
    }
    beforeEach(() => {
      registerDocLoader('lease', async (_db, _ctx, entityId) => ({
        entities,
        facilityId: entityId === 'in-b' ? fb : fa,
        baseName: 'hop-dong-301',
      }))
    })

    it('điền mẫu mặc định, lưu bản xuất vào files với đúng cơ sở và loại giấy tờ', async () => {
      await addTemplate('lease', 'Mặc định')
      const id = crypto.randomUUID()
      const r = await exportDocument(db, ctxOf(['tenants_contracts'], [fa]), storage, {
        docType: 'lease',
        entityId: id,
      })
      const [row] = await db.select().from(files).where(eq(files.id, r.fileId))
      expect(row).toMatchObject({
        ownerType: 'export',
        ownerId: id,
        facilityId: fa,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'hop-dong-301.docx',
      })
      expect(row.meta).toEqual({ docType: 'lease' })
      expect(row.confirmedAt).not.toBeNull()
      const bytes = new TextDecoder('latin1').decode(new Uint8Array(await storage.read(row.storageKey)))
      expect(bytes.startsWith('PK')).toBe(true)
    })

    it('xuất PDF thật và Word thật từ cùng mẫu; hai kiểu cho tệp khác nhau', async () => {
      const a = await addHtmlTemplate(db, admin, 'lease', {
        name: 'TT',
        html: '<h1>HỢP ĐỒNG</h1><p><span data-field="ten_khach">x</span></p>',
        style: 'formal',
      })
      const b = await addHtmlTemplate(db, admin, 'lease', {
        name: 'HĐ',
        html: '<h1>HỢP ĐỒNG</h1><p><span data-field="ten_khach">x</span></p>',
        style: 'modern',
      })
      const id = crypto.randomUUID()
      const pdfA = await exportDocument(db, admin, storage, {
        docType: 'lease',
        entityId: id,
        templateId: a.id,
        format: 'pdf',
      })
      const pdfB = await exportDocument(db, admin, storage, {
        docType: 'lease',
        entityId: id,
        templateId: b.id,
        format: 'pdf',
      })
      const [rowA] = await db.select().from(files).where(eq(files.id, pdfA.fileId))
      const [rowB] = await db.select().from(files).where(eq(files.id, pdfB.fileId))
      expect(rowA).toMatchObject({ contentType: 'application/pdf', name: 'hop-dong-301.pdf' })
      const bytesA = new Uint8Array(await storage.read(rowA.storageKey)),
        bytesB = new Uint8Array(await storage.read(rowB.storageKey))
      expect(new TextDecoder().decode(bytesA.slice(0, 5))).toBe('%PDF-')
      expect(Buffer.from(bytesA).equals(Buffer.from(bytesB))).toBe(false)
      const word = await exportDocument(db, admin, storage, { docType: 'lease', entityId: id, templateId: a.id })
      const [rowW] = await db.select().from(files).where(eq(files.id, word.fileId))
      const xml = new PizZip(await storage.read(rowW.storageKey)).file('word/document.xml')!.asText()
      expect(xml).toContain('Nguyễn Văn An')
    })

    it('previewDocument dựng PDF mà không lưu tệp nào', async () => {
      await addTemplate('lease', 'Mặc định')
      const before = (await db.select().from(files)).length
      const r = await previewDocument(db, admin, { docType: 'lease', entityId: crypto.randomUUID() })
      expect(new TextDecoder().decode(r.bytes.slice(0, 5))).toBe('%PDF-')
      expect(r.name).toBe('hop-dong-301.pdf')
      expect((await db.select().from(files)).length).toBe(before)
    })

    it('mẫu Word cũ: chọn trực tiếp thì bị từ chối rõ ràng; khi chỉ còn mẫu cũ thì tự dùng mẫu mặc định', async () => {
      const legacy = await addLegacyTemplate(db, admin, 'lease')
      await expect(
        exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), templateId: legacy.id }),
      ).rejects.toThrow('Mẫu Word cũ không còn dùng được')
      const r = await exportDocument(db, admin, storage, {
        docType: 'lease',
        entityId: crypto.randomUUID(),
        format: 'pdf',
      })
      expect(r.fileId).toBeTruthy()
    })

    it('chưa có mẫu nào → tự tạo mẫu mặc định và xuất được', async () => {
      const r = await exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID() })
      expect(r.fileId).toBeTruthy()
      expect((await listTemplates(db, admin, 'lease')).filter(isUsableTemplate)).toHaveLength(2)
    })

    it('cơ sở khác → NotFoundError; thiếu nhóm quyền → ForbiddenError', async () => {
      await addTemplate('lease', 'Mặc định')
      await expect(
        exportDocument(db, ctxOf(['tenants_contracts'], [fa]), storage, { docType: 'lease', entityId: 'in-b' }),
      ).rejects.toThrow(NotFoundError)
      await expect(
        exportDocument(db, ctxOf(['billing'], [fa]), storage, { docType: 'lease', entityId: crypto.randomUUID() }),
      ).rejects.toThrow(ForbiddenError)
    })

    it('chọn mẫu cụ thể theo templateId; mẫu của loại khác bị từ chối', async () => {
      const other = await addTemplate('invoice_monthly', 'Hoá đơn')
      await addTemplate('lease', 'HĐ')
      await expect(
        exportDocument(db, admin, storage, { docType: 'lease', entityId: crypto.randomUUID(), templateId: other.id }),
      ).rejects.toThrow('Mẫu không thuộc loại giấy tờ này')
    })
  })
})
