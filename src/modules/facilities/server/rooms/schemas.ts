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
  beds: optInt,
  // Không dùng default: cập nhật phòng không gửi trường này thì giữ nguyên tiện ích
  amenityIds: z.array(z.string().uuid()).optional(),
  note: z.string().trim().default(''),
})
export const roomUpdateInput = roomInput.omit({ facilityId: true }).partial()

export const bulkInput = z.object({
  prefix: z.string().trim().optional(),
  floor: z.string().trim().min(1, 'Nhập tầng'),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  roomType: z.string().trim().nullish(),
  areaM2: z.number().nonnegative().nullish(),
  listPrice: optInt,
  capacity: optInt,
  beds: optInt,
  amenityIds: z.array(z.string().uuid()).optional(),
})
export const bulkRoomIdsInput = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một phòng'),
})

export const bulkRoomUpdateInput = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một phòng'),
  floor: z.string().trim().nullish(),
  roomType: z.string().trim().nullish(),
  areaM2: z.number().nonnegative().nullish(),
  listPrice: optInt,
  capacity: optInt,
  beds: optInt,
})

export type RoomInput = z.input<typeof roomInput>
export type BulkInput = z.input<typeof bulkInput>
export type BulkRoomUpdateInput = z.input<typeof bulkRoomUpdateInput>
