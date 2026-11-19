'use client'

import { VN_BANKS } from '@/domain/banks'
import type { BankAccount } from '@/domain/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const emptyBankAccount: BankAccount = { bankBin: '', bankName: '', accountNumber: '', accountName: '' }

export function BankAccountFields({
  value,
  onChange,
  prefix,
}: {
  value: BankAccount
  onChange: (value: BankAccount) => void
  prefix: string
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-bank`}>Ngân hàng</Label>
        <select
          id={`${prefix}-bank`}
          className="h-9 w-full rounded-md border px-2 text-sm"
          value={value.bankBin}
          onChange={(e) => onChange({ ...value, bankBin: e.target.value })}
        >
          <option value="">Chọn ngân hàng</option>
          {VN_BANKS.map((bank) => (
            <option key={bank.bin} value={bank.bin}>
              {bank.shortName} — {bank.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-number`}>Số tài khoản</Label>
        <Input
          id={`${prefix}-number`}
          inputMode="numeric"
          value={value.accountNumber}
          onChange={(e) => onChange({ ...value, accountNumber: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-name`}>Chủ tài khoản</Label>
        <Input
          id={`${prefix}-name`}
          value={value.accountName}
          onChange={(e) => onChange({ ...value, accountName: e.target.value })}
        />
      </div>
    </div>
  )
}
