import { z } from 'zod'
import { VN_BANKS } from '@/domain/banks'

export const bankAccountSchema = z
  .object({
    bankBin: z.string().refine((bin) => VN_BANKS.some((bank) => bank.bin === bin), 'Chọn ngân hàng hợp lệ'),
    accountNumber: z.string().regex(/^\d{6,19}$/, 'Số tài khoản chỉ gồm 6–19 chữ số'),
    accountName: z
      .string()
      .trim()
      .min(1, 'Nhập tên chủ tài khoản')
      .transform((name) => name.toUpperCase()),
  })
  .transform((account) => ({ ...account, bankName: VN_BANKS.find((bank) => bank.bin === account.bankBin)!.name }))
