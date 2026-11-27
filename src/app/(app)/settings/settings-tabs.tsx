'use client'

import { useState } from 'react'
import { BankAccountFields, emptyBankAccount } from '@/components/bank-account/bank-account-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AmenitySettings, FeeSettings, type AmenityRow } from '@/modules/facilities/ui'
import { MeterTypeSettings, type MeterTypeRow } from '@/modules/meters/ui'
import { Msg, useRun } from '@/components/use-run'
import { updateSettingsAction } from '@/modules/platform/actions'
import type { Settings } from '@/modules/platform'

type Fac = { id: string; name: string }
type Unit = { id: string; name: string }
type FeeT = {
  id: string
  name: string
  unitId: string
  defaultPrice: number
  billing: string
  quantityFrom: string
  isActive: boolean
}

type Props = {
  defaults: Record<string, string[]>
  prices: Record<string, Record<string, number>>
  settings: Settings
  facilities: Fac[]
  units: Unit[]
  feeTypes: FeeT[]
  amenities: AmenityRow[]
  meterTypes: MeterTypeRow[]
}

function GeneralTab({ s }: { s: Settings }) {
  const { pending, error, ok, run } = useRun()
  const [visa, setVisa] = useState(String(s.visaWarningDays))
  const [contract, setContract] = useState(String(s.contractWarningDays))
  const [proration, setProration] = useState(s.proration)
  const [ruleKind, setRuleKind] = useState(s.dueRule.kind)
  const [day, setDay] = useState(String(s.dueRule.kind === 'day_of_next_month' ? s.dueRule.day : 5))
  const [invoiceDay, setInvoiceDay] = useState(String(s.dueRule.kind === 'day_of_invoice_month' ? s.dueRule.day : 5))
  const [after, setAfter] = useState(String(s.dueRule.kind === 'days_after_approval' ? s.dueRule.days : 5))
  const [retention, setRetention] = useState(String(s.photoRetentionDays))
  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1">
        <Label htmlFor="visa">Cảnh báo visa trước (ngày)</Label>
        <Input id="visa" inputMode="numeric" value={visa} onChange={(e) => setVisa(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="contract">Cảnh báo hợp đồng sắp hết hạn trước (ngày)</Label>
        <Input id="contract" inputMode="numeric" value={contract} onChange={(e) => setContract(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="proration">Cách tính lẻ ngày</Label>
        <Select
          value={proration}
          onValueChange={(v) => v && setProration(v as Settings['proration'])}
          items={[
            { value: 'actual_days', label: 'Chia số ngày thực của tháng' },
            { value: 'days_30', label: 'Chia 30' },
          ]}
        >
          <SelectTrigger id="proration" aria-label="Cách tính lẻ ngày" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actual_days">Chia số ngày thực của tháng</SelectItem>
            <SelectItem value="days_30">Chia 30</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Hạn thanh toán mặc định</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={ruleKind === 'day_of_invoice_month'}
            onChange={() => setRuleKind('day_of_invoice_month')}
          />{' '}
          Ngày{' '}
          <Input
            aria-label="Ngày của tháng hoá đơn"
            className="w-16"
            inputMode="numeric"
            value={invoiceDay}
            onChange={(e) => {
              setInvoiceDay(e.target.value)
              setRuleKind('day_of_invoice_month')
            }}
          />{' '}
          của chính tháng hoá đơn
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={ruleKind === 'day_of_next_month'}
            onChange={() => setRuleKind('day_of_next_month')}
          />{' '}
          Ngày{' '}
          <Input
            aria-label="Ngày của tháng sau"
            className="w-16"
            inputMode="numeric"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />{' '}
          của tháng sau
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={ruleKind === 'days_after_approval'}
            onChange={() => setRuleKind('days_after_approval')}
          />{' '}
          <Input
            aria-label="Số ngày sau khi duyệt"
            className="w-16"
            inputMode="numeric"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
          />{' '}
          ngày sau khi duyệt
        </label>
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="retention">Giữ ảnh bàn giao sau thanh lý (ngày)</Label>
        <Input id="retention" inputMode="numeric" value={retention} onChange={(e) => setRetention(e.target.value)} />
      </div>
      <Msg error={error} ok={ok} />
      <Button
        disabled={pending}
        onClick={() =>
          run(() =>
            updateSettingsAction({
              visaWarningDays: Number(visa),
              contractWarningDays: Number(contract),
              proration,
              photoRetentionDays: Number(retention),
              dueRule:
                ruleKind === 'day_of_invoice_month'
                  ? { kind: 'day_of_invoice_month', day: Number(invoiceDay) }
                  : ruleKind === 'day_of_next_month'
                    ? { kind: 'day_of_next_month', day: Number(day) }
                    : { kind: 'days_after_approval', days: Number(after) },
            }),
          )
        }
      >
        Lưu
      </Button>
    </div>
  )
}

function BankAccountTab({ settings }: { settings: Settings }) {
  const { pending, error, ok, run } = useRun()
  const [account, setAccount] = useState(settings.bankAccount ?? emptyBankAccount)
  return (
    <div className="max-w-md space-y-4">
      <BankAccountFields value={account} onChange={setAccount} prefix="shared-bank" />
      <Msg error={error} ok={ok} />
      <Button disabled={pending} onClick={() => run(() => updateSettingsAction({ bankAccount: account }))}>
        Lưu tài khoản
      </Button>
    </div>
  )
}

export function SettingsTabs({
  settings,
  facilities,
  units,
  feeTypes,
  prices,
  defaults,
  amenities,
  meterTypes,
}: Props) {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">Chung</TabsTrigger>
        <TabsTrigger value="fees">Phí dịch vụ</TabsTrigger>
        <TabsTrigger value="meter-types">Loại đồng hồ</TabsTrigger>
        <TabsTrigger value="amenities">Tiện ích</TabsTrigger>
        <TabsTrigger value="bank">Tài khoản nhận tiền</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <GeneralTab s={settings} />
      </TabsContent>
      <TabsContent value="meter-types">
        <MeterTypeSettings types={meterTypes} />
      </TabsContent>
      <TabsContent value="amenities">
        <AmenitySettings amenities={amenities} />
      </TabsContent>
      <TabsContent value="bank">
        <BankAccountTab settings={settings} />
      </TabsContent>
      <TabsContent value="fees">
        <FeeSettings defaults={defaults} units={units} feeTypes={feeTypes} facilities={facilities} prices={prices} />
      </TabsContent>
    </Tabs>
  )
}
