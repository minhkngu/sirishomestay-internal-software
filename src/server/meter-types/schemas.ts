import { z } from 'zod'

const name = z.string().trim().min(1, 'Nhập tên loại đồng hồ').max(50, 'Tên tối đa 50 ký tự')
const unit = z.string().trim().max(20, 'Đơn vị tối đa 20 ký tự')
export const meterTypeInput = z.object({ name, unit })
export const meterTypeUpdateInput = z.object({ name: name.optional(), unit: unit.optional() })
