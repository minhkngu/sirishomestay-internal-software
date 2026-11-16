import { z } from 'zod'

const optInt = z.number().int().nonnegative().nullish()
export const roomInput = z.object({
  facilityId: z.string().uuid(),
  code: z.string().trim().min(1, 'Nhập mã phòng').max(30),
  floor: z.string().trim().nullish(),
  roomType: z.string().trim().nullish(),
  areaM2: z.number().nonnegative().nullish(),
  listPrice: optInt,
  capacity: optInt,
  note: z.string().trim().default(''),
})
export const roomUpdateInput = roomInput.omit({ facilityId: true }).partial()

export const bulkInput = z.object({
  prefix: z.string().trim().optional(),
  floor: z.string().trim().min(1, 'Nhập tầng'),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  roomType: z.string().trim().nullish(),
  listPrice: optInt,
  capacity: optInt,
})
export type RoomInput = z.input<typeof roomInput>
export type BulkInput = z.input<typeof bulkInput>
