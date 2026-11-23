import { beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { facilities, rooms, tenants, leases, invoices } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { defaultInvoiceTemplate } from '@/modules/documents/domain/invoice-template'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createTestDb } from '../helpers/db'
import {
  createInvoiceTemplate,
  updateInvoiceTemplate,
  deleteInvoiceTemplate,
  listInvoiceTemplates,
  setDefaultInvoiceTemplate,
  resolveInvoiceTemplate,
  previewInvoiceTemplate,
} from '@/modules/documents/server/invoice-templates/service'
import { selectInvoiceTemplate, selectLeaseInvoiceTemplate } from '@/server/invoices/template-assignment'

describe('quản lý và chọn mẫu hóa đơn', () => {
  let db: DB, facilityId: string, leaseId: string, invoiceId: string
  const admin: AccessContext = {
    userId: crypto.randomUUID(),
    email: 'a@x.com',
    fullName: 'A',
    isAdmin: true,
    facilityIds: new Set(),
    permissions: new Set(['settings']),
  }
  const staff = (): AccessContext => ({
    ...admin,
    isAdmin: false,
    permissions: new Set(['billing']),
    facilityIds: new Set([facilityId]),
  })
  beforeEach(async () => {
    db = await createTestDb()
    const [f] = await db.insert(facilities).values({ code: 'A', name: 'A' }).returning()
    facilityId = f.id
    const [r] = await db.insert(rooms).values({ facilityId, code: '1' }).returning()
    const [t] = await db
      .insert(tenants)
      .values({
        kind: 'vietnamese',
        homeFacilityId: facilityId,
        fullName: 'A',
        phone: '0901234567',
        idNumber: '012345678901',
      })
      .returning()
    const [l] = await db
      .insert(leases)
      .values({
        code: 'HD1',
        roomId: r.id,
        tenantId: t.id,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        monthlyRent: 1,
        depositAmount: 0,
      })
      .returning()
    leaseId = l.id
    const [i] = await db
      .insert(invoices)
      .values({
        code: 'I1',
        leaseId,
        facilityId,
        kind: 'monthly',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        issueDate: '2026-02-01',
      })
      .returning()
    invoiceId = i.id
  })
  it('tạo, sửa, đặt mặc định và áp dụng ưu tiên mẫu hóa đơn hơn hợp đồng', async () => {
    const a = await createInvoiceTemplate(db, admin, {
      name: 'Mẫu A',
      config: { ...defaultInvoiceTemplate, brand: 'A' },
    })
    const b = await createInvoiceTemplate(db, admin, {
      name: 'Mẫu B',
      config: { ...defaultInvoiceTemplate, brand: 'B' },
    })
    await updateInvoiceTemplate(db, admin, a.id, {
      name: 'Mẫu A sửa',
      config: { ...defaultInvoiceTemplate, brand: 'A sửa' },
    })
    await setDefaultInvoiceTemplate(db, admin, a.id)
    expect((await listInvoiceTemplates(db, staff())).find((x) => x.id === a.id)?.isDefault).toBe(true)
    expect((await resolveInvoiceTemplate(db, invoiceId)).config.brand).toBe('A sửa')
    await selectLeaseInvoiceTemplate(db, { ...staff(), permissions: new Set(['tenants_contracts']) }, leaseId, b.id)
    expect((await resolveInvoiceTemplate(db, invoiceId)).config.brand).toBe('B')
    await selectInvoiceTemplate(db, staff(), invoiceId, a.id)
    expect((await resolveInvoiceTemplate(db, invoiceId)).config.brand).toBe('A sửa')
    await expect(deleteInvoiceTemplate(db, admin, b.id)).rejects.toThrow('đang được hợp đồng hoặc hóa đơn sử dụng')
    await selectInvoiceTemplate(db, staff(), invoiceId, null)
    expect((await resolveInvoiceTemplate(db, invoiceId)).config.brand).toBe('B')
  })
  it('kiểm tra quyền và dữ liệu trước khi thay đổi', async () => {
    await expect(createInvoiceTemplate(db, staff(), { name: 'X', config: defaultInvoiceTemplate })).rejects.toThrow()
    await expect(
      createInvoiceTemplate(db, admin, { name: 'X', config: { ...defaultInvoiceTemplate, color: 'red' } }),
    ).rejects.toThrow()
    await expect(selectInvoiceTemplate(db, staff(), invoiceId, crypto.randomUUID())).rejects.toThrow()
    await expect(
      selectInvoiceTemplate(db, { ...staff(), facilityIds: new Set([crypto.randomUUID()]) }, invoiceId, null),
    ).rejects.toThrow()
    await expect(
      createInvoiceTemplate(db, admin, {
        name: 'X',
        config: { ...defaultInvoiceTemplate, logo: 'data:image/png;base64,AAAA' },
      }),
    ).rejects.toThrow()
  })
  it('xem PDF với dữ liệu mẫu và cấu hình chưa lưu mà không thay đổi dữ liệu', async () => {
    const before = await listInvoiceTemplates(db, admin)
    const qr = vi.spyOn(QRCode, 'toDataURL')
    const pdf = await previewInvoiceTemplate(admin, {
      ...defaultInvoiceTemplate,
      brand: 'THUONG HIEU CHUA LUU',
      title: 'HOA DON THU NGHIEM',
    })
    expect(qr.mock.calls[0][0]).toBe('DU LIEU MAU - KHONG THANH TOAN')
    qr.mockRestore()
    const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise
    const content = await (await doc.getPage(1)).getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    expect(text).toContain('THUONG HIEU CHUA LUU')
    expect(text).toContain('HOA DON THU NGHIEM')
    expect(text).toContain('Nguyễn Văn An')
    expect(text).toContain('Tiền phòng')
    expect(text).toContain('DỮ LIỆU MẪU')
    expect(text).toContain('Mã QR minh họa')
    expect(await listInvoiceTemplates(db, admin)).toEqual(before)
    await expect(previewInvoiceTemplate(staff(), defaultInvoiceTemplate)).rejects.toThrow()
    await expect(previewInvoiceTemplate(admin, { ...defaultInvoiceTemplate, color: 'red' })).rejects.toThrow()
  })
})
