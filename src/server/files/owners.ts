import { eq } from 'drizzle-orm'
import { tenants } from '@/db'
import type { DB } from '@/db/client'
import type { Permission } from '@/domain/access'
import { NotFoundError, ValidationError } from '@/domain/errors'

export const OWNER_TYPES = ['tenant_document', 'lease_photo', 'handover_photo', 'incident_photo', 'signed_contract', 'signed_addendum', 'template', 'export'] as const
export type OwnerType = (typeof OWNER_TYPES)[number]

/** Nhóm quyền cần để thao tác với tệp của từng loại chủ sở hữu. `export` phụ thuộc loại giấy tờ gốc. */
export function fileAccessPermission(ownerType: OwnerType, meta?: { docType?: string } | null): Permission {
  switch (ownerType) {
    case 'tenant_document':
    case 'lease_photo':
    case 'handover_photo':
    case 'signed_contract':
    case 'signed_addendum':
      return 'tenants_contracts'
    case 'incident_photo':
      return 'incidents'
    case 'template':
      return 'settings'
    case 'export':
      return meta?.docType?.startsWith('invoice') || meta?.docType === 'receipt' ? 'billing' : 'tenants_contracts'
  }
}

/** Cơ sở của chủ sở hữu (null = không thuộc cơ sở nào, vd. mẫu giấy tờ). Không tồn tại → NotFoundError. */
export type OwnerResolver = (db: Pick<DB, 'select'>, ownerId: string) => Promise<{ facilityId: string | null }>

const resolvers: Partial<Record<OwnerType, OwnerResolver>> = {
  tenant_document: async (db, id) => {
    const [t] = await db.select({ f: tenants.homeFacilityId }).from(tenants).where(eq(tenants.id, id))
    if (!t) throw new NotFoundError()
    return { facilityId: t.f }
  },
  template: async () => ({ facilityId: null }),
  // bản xuất: thử lần lượt các resolver mà từng module đăng ký (hợp đồng, bàn giao, hoá đơn…)
  export: async (db, id) => {
    for (const r of exportResolvers) {
      try { return await r(db, id) } catch (e) { if (!(e instanceof NotFoundError)) throw e }
    }
    throw new NotFoundError()
  },
}
const exportResolvers: OwnerResolver[] = []

/** Module nào xuất giấy tờ thì đăng ký cách tìm cơ sở của thực thể gốc (ownerId của bản xuất). */
export function registerExportOwnerResolver(resolver: OwnerResolver) {
  exportResolvers.push(resolver)
}

/** Các module sau (hợp đồng, bàn giao, sự cố, xuất giấy tờ) đăng ký cách tìm cơ sở của chủ sở hữu tệp. */
export function registerOwnerResolver(type: OwnerType, resolver: OwnerResolver) {
  resolvers[type] = resolver
}

export async function resolveOwner(db: Pick<DB, 'select'>, type: OwnerType, ownerId: string) {
  const r = resolvers[type]
  if (!r) throw new ValidationError('Loại tệp chưa được hỗ trợ')
  return r(db, ownerId)
}

const IMAGE = ['image/webp', 'image/jpeg', 'image/png']
const DOCX = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const PDF = ['application/pdf']

export const IMAGE_OWNERS: OwnerType[] = ['tenant_document', 'lease_photo', 'handover_photo', 'incident_photo']

export const ALLOWED_TYPES: Record<OwnerType, { types: string[]; message: string; maxBytes: number }> = {
  tenant_document: { types: IMAGE, message: 'Chỉ nhận ảnh (WebP, JPEG hoặc PNG)', maxBytes: 2 * 1024 * 1024 },
  lease_photo: { types: IMAGE, message: 'Chỉ nhận ảnh (WebP, JPEG hoặc PNG)', maxBytes: 2 * 1024 * 1024 },
  handover_photo: { types: IMAGE, message: 'Chỉ nhận ảnh (WebP, JPEG hoặc PNG)', maxBytes: 2 * 1024 * 1024 },
  incident_photo: { types: IMAGE, message: 'Chỉ nhận ảnh (WebP, JPEG hoặc PNG)', maxBytes: 2 * 1024 * 1024 },
  signed_contract: { types: [...PDF, ...IMAGE], message: 'Chỉ nhận PDF hoặc ảnh', maxBytes: 10 * 1024 * 1024 },
  signed_addendum: { types: [...PDF, ...IMAGE], message: 'Chỉ nhận PDF hoặc ảnh', maxBytes: 10 * 1024 * 1024 },
  template: { types: DOCX, message: 'Chỉ nhận file Word (.docx)', maxBytes: 10 * 1024 * 1024 },
  export: { types: [...DOCX, ...PDF, 'image/png'], message: 'Định dạng xuất không hợp lệ', maxBytes: 20 * 1024 * 1024 },
}

export const EXT: Record<string, string> = {
  'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}
