'use client'

import { useState } from 'react'
import { BankAccountFields, emptyBankAccount } from '@/components/bank-account/bank-account-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AmenitySettings, type AmenityRow } from '@/features/settings/components/amenity-settings'
import { FeeSettings } from '@/features/settings/components/fee-settings'
import { Msg, useRun } from '@/features/settings/components/use-run'
import { createFacilityAction, updateFacilityAction } from '@/server/facilities/actions'
import { updateSettingsAction } from '@/server/settings/actions'
import type { Settings } from '@/server/settings/service'

type Fac = { id: string; code: string; name: string; address: string; expectedInvoiceDay: number }
type Unit = { id: string; name: string }
type FeeT = { id: string; name: string; unitId: string; defaultPrice: number; billing: string; quantityFrom: string; isActive: boolean }

type Props = { defaults: Record<string, string[]>; prices: Record<string, Record<string, number>>; settings: Settings; facilities: Fac[]; units: Unit[]; feeTypes: FeeT[]; amenities: AmenityRow[] }

function GeneralTab({ s }: { s: Settings }) {
  const { pending, error, ok, run } = useRun()
  const [visa, setVisa] = useState(String(s.visaWarningDays))
  const [contract, setContract] = useState(String(s.contractWarningDays))
  const [proration, setProration] = useState(s.proration)
  const [ruleKind, setRuleKind] = useState(s.dueRule.kind)
  const [day, setDay] = useState(String(s.dueRule.kind === 'day_of_next_month' ? s.dueRule.day : 5))
  const [after, setAfter] = useState(String(s.dueRule.kind === 'days_after_approval' ? s.dueRule.days : 5))
  const [retention, setRetention] = useState(String(s.photoRetentionDays))
  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1"><Label htmlFor="visa">Cảnh báo visa trước (ngày)</Label><Input id="visa" inputMode="numeric" value={visa} onChange={(e) => setVisa(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="contract">Cảnh báo hợp đồng sắp hết hạn trước (ngày)</Label><Input id="contract" inputMode="numeric" value={contract} onChange={(e) => setContract(e.target.value)} /></div>
      <div className="space-y-1">
        <Label htmlFor="proration">Cách tính lẻ ngày</Label>
        <select id="proration" value={proration} onChange={(e) => setProration(e.target.value as Settings['proration'])} className="h-8 w-full rounded-lg border px-2 text-sm">
          <option value="actual_days">Chia số ngày thực của tháng</option>
          <option value="days_30">Chia 30</option>
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Hạn thanh toán mặc định</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={ruleKind === 'day_of_next_month'} onChange={() => setRuleKind('day_of_next_month')} /> Ngày <Input aria-label="Ngày của tháng sau" className="w-16" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} /> của tháng sau</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={ruleKind === 'days_after_approval'} onChange={() => setRuleKind('days_after_approval')} /> <Input aria-label="Số ngày sau khi duyệt" className="w-16" inputMode="numeric" value={after} onChange={(e) => setAfter(e.target.value)} /> ngày sau khi duyệt</label>
      </fieldset>
      <div className="space-y-1"><Label htmlFor="retention">Giữ ảnh bàn giao sau thanh lý (ngày)</Label><Input id="retention" inputMode="numeric" value={retention} onChange={(e) => setRetention(e.target.value)} /></div>
      <Msg error={error} ok={ok} />
      <Button disabled={pending} onClick={() => run(() => updateSettingsAction({
        visaWarningDays: Number(visa), contractWarningDays: Number(contract), proration, photoRetentionDays: Number(retention),
        dueRule: ruleKind === 'day_of_next_month' ? { kind: 'day_of_next_month', day: Number(day) } : { kind: 'days_after_approval', days: Number(after) },
      }))}>Lưu</Button>
    </div>
  )
}

function BankAccountTab({ settings }: { settings: Settings }) {
  const { pending, error, ok, run } = useRun()
  const [account, setAccount] = useState(settings.bankAccount ?? emptyBankAccount)
  return <div className="max-w-md space-y-4">
    <BankAccountFields value={account} onChange={setAccount} prefix="shared-bank" />
    <Msg error={error} ok={ok} />
    <Button disabled={pending} onClick={() => run(() => updateSettingsAction({ bankAccount: account }))}>Lưu tài khoản</Button>
  </div>
}

function FacilitiesTab({ facilities }: { facilities: Fac[] }) {
  const { pending, error, ok, run } = useRun()
  const [v, setV] = useState({ code: '', name: '', address: '' })
  const [days, setDays] = useState<Record<string, string>>(Object.fromEntries(facilities.map((f) => [f.id, String(f.expectedInvoiceDay)])))
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Mã</th><th className="p-2">Tên</th><th className="p-2">Ngày tạo hoá đơn dự kiến</th><th className="p-2" /></tr></thead>
          <tbody>
            {facilities.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="p-2">{f.code}</td><td className="p-2">{f.name}</td>
                <td className="p-2"><Input aria-label={`Ngày tạo hoá đơn ${f.code}`} className="w-20" inputMode="numeric" value={days[f.id]} onChange={(e) => setDays({ ...days, [f.id]: e.target.value })} /></td>
                <td className="p-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateFacilityAction(f.id, { expectedInvoiceDay: Number(days[f.id]) }))}>Lưu</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="max-w-md space-y-2 rounded-md border bg-card p-3">
        <h3 className="text-sm font-medium">Thêm cơ sở</h3>
        {(['code', 'name', 'address'] as const).map((k) => (
          <Input key={k} placeholder={{ code: 'Mã cơ sở', name: 'Tên cơ sở', address: 'Địa chỉ' }[k]} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        ))}
        <Button disabled={pending} onClick={() => run(async () => { const r = await createFacilityAction(v); if (r.ok) setV({ code: '', name: '', address: '' }); return r })}>Thêm</Button>
      </div>
      <Msg error={error} ok={ok} />
    </div>
  )
}

export function SettingsTabs({ settings, facilities, units, feeTypes, prices, defaults, amenities }: Props) {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">Chung</TabsTrigger>
        <TabsTrigger value="facilities">Cơ sở</TabsTrigger>
        <TabsTrigger value="fees">Phí dịch vụ</TabsTrigger>
        <TabsTrigger value="amenities">Tiện ích</TabsTrigger>
        <TabsTrigger value="bank">Tài khoản nhận tiền</TabsTrigger>
      </TabsList>
      <TabsContent value="general"><GeneralTab s={settings} /></TabsContent>
      <TabsContent value="amenities"><AmenitySettings amenities={amenities} /></TabsContent>
      <TabsContent value="bank"><BankAccountTab settings={settings} /></TabsContent>
      <TabsContent value="facilities"><FacilitiesTab facilities={facilities} /></TabsContent>
      <TabsContent value="fees"><FeeSettings defaults={defaults} units={units} feeTypes={feeTypes} facilities={facilities} prices={prices} /></TabsContent>
    </Tabs>
  )
}
