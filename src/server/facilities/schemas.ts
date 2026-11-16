import { z } from 'zod'

export const facilityInput = z.object({
  code: z.string().trim().min(1, 'Nhập mã cơ sở').max(20),
  name: z.string().trim().min(1, 'Nhập tên cơ sở'),
  address: z.string().trim().default(''),
  note: z.string().trim().default(''),
  expectedInvoiceDay: z.number().int().min(1, 'Ngày từ 1 đến 28').max(28, 'Ngày từ 1 đến 28').default(5),
})
export const facilityUpdateInput = facilityInput.partial().extend({ isActive: z.boolean().optional() })
export type FacilityInput = z.input<typeof facilityInput>
