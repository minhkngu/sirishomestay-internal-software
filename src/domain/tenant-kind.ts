export type TenantKind = 'foreign' | 'vietnamese' | 'company'

/** Nhãn đầy đủ: form khách thuê và mẫu hợp đồng (trường `loai_khach`). */
export const TENANT_KIND_LABELS: Record<TenantKind, string> = {
  foreign: 'Khách nước ngoài',
  vietnamese: 'Khách Việt Nam',
  company: 'Công ty',
}

/** Nhãn ngắn: cột "Loại" trong bảng khách thuê. */
export const TENANT_KIND_SHORT_LABELS: Record<TenantKind, string> = {
  foreign: 'Nước ngoài',
  vietnamese: 'Việt Nam',
  company: 'Công ty',
}
