import { z } from 'zod'
import { PERMISSIONS } from '@/lib/access'

export const userInput = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  fullName: z.string().trim().min(1, 'Nhập họ tên'),
  facilityIds: z.array(z.string().uuid()),
  permissions: z.array(z.enum(PERMISSIONS)).min(1, 'Chọn ít nhất một nhóm quyền'),
})

export const userUpdateInput = userInput.omit({ email: true }).extend({ isActive: z.boolean() })

export type UserInput = z.infer<typeof userInput>
