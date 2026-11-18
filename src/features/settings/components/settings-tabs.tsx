'use client'

import { useState } from 'react'
import { BankAccountFields, emptyBankAccount } from '@/components/bank-account/bank-account-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FeeSettings } from '@/features/settings/components/fee-settings'
import { Msg, useRun } from '@/features/settings/components/use-run'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { createFacilityAction, updateFacilityAction } from '@/server/facilities/actions'
import { createRateAction } from '@/server/fees/actions'
import { updateSettingsAction } from '@/server/settings/actions'
import type { Settings } from '@/server/settings/service'

type Fac = { id: string; code: string; name: string; address: string; expectedInvoiceDay: number }
type Unit = { id: string; name: string }
type FeeT = { id: string; name: string; unitId: string; defaultPrice: number; billing: string; quantityFrom: string; isActive: boolean }
type Rate = { id: string; facilityId: string; utility: string; pricePerUnit: number; effectiveFrom: string }

type Props = { defaults: Record<string, string[]>; prices: Record<string, Record<string, number>>; settings: Settings; facilities: Fac[]; units: Unit[]; feeTypes: FeeT[]; rates: Rate[] }

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

function RatesTab({ facilities, rates }: { facilities: Fac[]; rates: Rate[] }) {
  const { pending, error, ok, run } = useRun()
  const [fac, setFac] = useState(facilities[0]?.id ?? '')
  const [n, setN] = useState({ utility: 'electric', pricePerUnit: '', effectiveFrom: '' })
  const shown = rates.filter((r) => r.facilityId === fac)
  return (
    <div className="space-y-4">
      <select aria-label="Cơ sở" value={fac} onChange={(e) => setFac(e.target.value)} className="h-8 rounded-lg border px-2 text-sm">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Loại</th><th className="p-2">Đơn giá</th><th className="p-2">Hiệu lực từ</th></tr></thead>
          <tbody>
            {shown.map((r) => <tr key={r.id} className="border-t"><td className="p-2">{r.utility === 'electric' ? 'Điện (đ/kWh)' : 'Nước (đ/m³)'}</td><td className="p-2">{formatVND(r.pricePerUnit)}</td><td className="p-2">{formatDateVN(r.effectiveFrom)}</td></tr>)}
            {shown.length === 0 && <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">Chưa có đơn giá</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="grid max-w-xl gap-2 rounded-md border bg-card p-3 sm:grid-cols-3">
        <select aria-label="Loại" value={n.utility} onChange={(e) => setN({ ...n, utility: e.target.value })} className="h-8 rounded-lg border px-2 text-sm"><option value="electric">Điện</option><option value="water">Nước</option></select>
        <Input placeholder="Đơn giá" inputMode="numeric" value={n.pricePerUnit} onChange={(e) => setN({ ...n, pricePerUnit: e.target.value })} />
        <Input aria-label="Ngày hiệu lực" type="date" value={n.effectiveFrom} onChange={(e) => setN({ ...n, effectiveFrom: e.target.value })} />
        <Button className="sm:col-span-3" disabled={pending} onClick={() => run(async () => { const r = await createRateAction({ facilityId: fac, utility: n.utility, pricePerUnit: Number(n.pricePerUnit), effectiveFrom: n.effectiveFrom }); if (r.ok) setN({ ...n, pricePerUnit: '' }); return r })}>Thêm mức giá mới</Button>
      </div>
      <p className="text-xs text-muted-foreground">Giá mới áp cho kỳ bắt đầu từ ngày hiệu lực; hoá đơn cũ giữ nguyên.</p>
      <Msg error={error} ok={ok} />
    </div>
  )
}

export function SettingsTabs({ settings, facilities, units, feeTypes, rates, prices, defaults }: Props) {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">Chung</TabsTrigger>
        <TabsTrigger value="bank">Tài khoản nhận tiền</TabsTrigger>
        <TabsTrigger value="facilities">Cơ sở</TabsTrigger>
        <TabsTrigger value="fees">Phí dịch vụ</TabsTrigger>
        <TabsTrigger value="rates">Đơn giá điện nước</TabsTrigger>
      </TabsList>
      <TabsContent value="general"><GeneralTab s={settings} /></TabsContent>
      <TabsContent value="bank"><BankAccountTab settings={settings} /></TabsContent>
      <TabsContent value="facilities"><FacilitiesTab facilities={facilities} /></TabsContent>
      <TabsContent value="fees"><FeeSettings defaults={defaults} units={units} feeTypes={feeTypes} facilities={facilities} prices={prices} /></TabsContent>
      <TabsContent value="rates"><RatesTab facilities={facilities} rates={rates} /></TabsContent>
    </Tabs>
  )
}
