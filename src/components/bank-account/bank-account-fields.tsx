'use client'

import { VN_BANKS } from '@/domain/banks'
import type { BankAccount } from '@/domain/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  const bankItems = [
    { value: '', label: 'Chọn ngân hàng' },
    ...VN_BANKS.map((bank) => ({ value: bank.bin, label: `${bank.shortName} — ${bank.name}` })),
  ]
  return (
    <div className="space-y-3.5">
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-bank`}>Ngân hàng</Label>
        <Select
          value={value.bankBin}
          onValueChange={(next) => onChange({ ...value, bankBin: String(next ?? '') })}
          items={bankItems}
        >
          <SelectTrigger id={`${prefix}-bank`} aria-label="Ngân hàng" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bankItems.map((bank) => (
              <SelectItem key={bank.value || '__empty__'} value={bank.value}>
                {bank.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-number`}>Số tài khoản</Label>
        <Input
          id={`${prefix}-number`}
          inputMode="numeric"
          value={value.accountNumber}
          onChange={(e) => onChange({ ...value, accountNumber: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
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
