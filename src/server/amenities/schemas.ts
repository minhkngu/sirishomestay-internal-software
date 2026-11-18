import { z } from 'zod'

const name = z.string().trim().min(1, 'Nhập tên tiện ích').max(50, 'Tên tối đa 50 ký tự')
export const amenityInput = z.object({ name })
export const amenityUpdateInput = z.object({ name: name.optional(), isActive: z.boolean().optional() })
export type AmenityInput = z.input<typeof amenityInput>
