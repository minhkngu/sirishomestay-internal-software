'use client'

import { useGoToContract } from './go-to-contract'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { addDays } from '@/domain/dates'
import { resolveFeePrice } from '@/domain/fee-price'
import { formatVND, MAX_MONEY } from '@/domain/money'
import { convertDepositToLeaseAction, createLeaseAction } from '@/server/contracts/actions'
import { replaceSigner } from '../contract-occupants'
import { assetEntry, buildHandoverPhotoTasks, uploadLeasePhotos, type PendingPhoto } from '../lease-photo-retry'
import { uploadOne } from '@/components/file-upload'
import { meterFeeError, resolveMeterIds } from '../lease-fee-meters'
import { LeaseFees, type FeeOption, type FeeDraft, type RoomFeeMeter } from './lease-fees'
import { LeaseAssets, emptyChanges, type AssetOption, type MoveTargets } from './lease-assets'
import type { RoomOption, TenantOption } from './deposit-form'

type Initial = { roomId?: string; tenantId?: string; depositId?: string; rent?: number; deposit?: number; startDate?: string; receivedDeposit?: number }
type Props = {
  assets: AssetOption[]; canManageAssets: boolean; moveTargets: MoveTargets; feeDefaults: Record<string, string[]>; roomMeters: RoomFeeMeter[]
  templates: { id: string; name: string; isDefault: boolean }[]
  invoiceTemplates: { id: string; name: string; isDefault: boolean }[]
  rooms: RoomOption[]; tenants: TenantOption[]; feeTypes: FeeOption[]; initial?: Initial
  defaults: { proration: 'days_30' | 'actual_days'; dueRuleLabel: string }
}


const TOO_BIG = `Số tiền quá lớn, tối đa ${MAX_MONEY.toLocaleString('vi-VN')} VND`

export function LeaseWizard({ templates, invoiceTemplates, assets, canManageAssets, moveTargets, feeDefaults, roomMeters, rooms, tenants, feeTypes, initial = {}, defaults }: Props) {
  const goToContract = useGoToContract()
  const [pending, start] = useTransition()
  const [received, setReceived] = useState(String(initial.receivedDeposit ?? 0))
  const [note, setNote] = useState('')
  const [contractTemplateId, setContractTemplateId] = useState(templates.find(t => t.isDefault)?.id ?? templates[0]?.id ?? '')
  const [invoiceTemplateId, setInvoiceTemplateId] = useState('')
  const [changes, setChanges] = useState(emptyChanges)
  const [photos, setPhotos] = useState<File[]>([])
  const [assetPhotos, setAssetPhotos] = useState<Record<string, File[]>>({})
  const [assetConditions, setAssetConditions] = useState<Record<string, string>>({})
  const [failedPhotos, setFailedPhotos] = useState<PendingPhoto<File>[]>([])
  const [createdId, setCreatedId] = useState<string | null>(null)
  const submitting = useRef(false)
  const [roomId, setRoomId] = useState(initial.roomId ?? '')
  const [tenantId, setTenantId] = useState(initial.tenantId ?? '')
  const [additionalOccupantIds, setAdditionalOccupantIds] = useState<string[]>([])
  const [addingOccupant, setAddingOccupant] = useState(false)
  const occupantIds = replaceSigner(tenantId, additionalOccupantIds)
  const [startDate, setStartDate] = useState(initial.startDate ?? '')
  const [endDate, setEndDate] = useState('')
  const [rent, setRent] = useState(String(initial.rent ?? ''))
  const [deposit, setDeposit] = useState(String(initial.deposit ?? ''))
  const makeFee = (f: FeeOption, facilityId?: string): FeeDraft => ({ key: crypto.randomUUID(), feeTypeId: f.id, name: f.name, unit: f.unit, quantitySource: f.quantityFrom === 'manual' ? 'period_input' : f.quantityFrom as FeeDraft['quantitySource'], legacyFixed: f.quantityFrom === 'manual', price: String(resolveFeePrice(f.defaultPrice, f.prices, facilityId ?? null)), quantity: '1', initialReading: '' })
  const defaultFees = (facilityId?: string) => feeTypes.filter(f => (feeDefaults[facilityId ?? ''] ?? []).includes(f.id)).map(f => makeFee(f, facilityId))
  const [fees, setFees] = useState<FeeDraft[]>(() => defaultFees(rooms.find(r => r.id === initial.roomId)?.facilityId))
  const [overrideProration, setOverrideProration] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [cycle, setCycle] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const fieldError = (name: string) => fieldErrors[name] ? <p role="alert" className="text-sm text-destructive">{fieldErrors[name]}</p> : null

  // Cảnh báo ngay khi gõ, không đợi bấm tạo
  const warnBig = (v: string) => Number(v) > MAX_MONEY ? <p role="alert" className="text-sm text-destructive">{TOO_BIG}</p> : null

  const individuals = tenants.filter((t) => t.kind !== 'company' && !occupantIds.includes(t.id))
  const tenant = tenants.find((t) => t.id === tenantId)
  const handoverAssets = [
    ...assets.filter(a => a.locationKind === 'room' && a.locationId === roomId && !changes.remove.some(r => r.assetId === a.id)),
    ...assets.filter(a => changes.addAssetIds.includes(a.id)),
    ...changes.newAssets,
  ]
  const monthlyFixed = fees.filter(f => f.quantitySource === 'room' || f.quantitySource === 'occupants' || f.legacyFixed).reduce((sum, f) => sum + (f.quantitySource === 'occupants' ? occupantIds.length : f.legacyFixed ? Number(f.quantity) : 1) * (Number(f.price) || 0), 0)

  function pickTenant(id: string) { setTenantId(id) }

  async function uploadPhotos(id: string, list: PendingPhoto<File>[]) {
    const failed = await uploadLeasePhotos(id, list, photo => {
      if (!photo.ownerId) throw new Error('Không tìm thấy tài sản bàn giao')
      return uploadOne(photo.file, photo.ownerType, photo.ownerId)
    })
    setFailedPhotos(failed)
    if (failed.length === 0) goToContract(id)
  }

  function submit() {
    if (submitting.current || createdId) return
    setError(null)
    const errors: Record<string, string> = {}
    if (!roomId) errors.roomId = 'Chọn phòng'
    if (!tenantId) errors.tenantId = 'Chọn bên thuê'
    if (!occupantIds.length) errors.occupantIds = 'Chọn ít nhất một người ở'
    if (!startDate) errors.startDate = 'Chọn ngày bắt đầu'
    if (!endDate || endDate < startDate) errors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu'
    if (!rent || !Number.isSafeInteger(Number(rent)) || Number(rent) < 0) errors.monthlyRent = 'Nhập giá thuê hợp lệ'
    else if (Number(rent) > MAX_MONEY) errors.monthlyRent = TOO_BIG
    if (!deposit || !Number.isSafeInteger(Number(deposit)) || Number(deposit) < 0) errors.depositAmount = 'Nhập tiền cọc hợp lệ'
    else if (Number(deposit) > MAX_MONEY) errors.depositAmount = TOO_BIG
    if (!Number.isSafeInteger(Number(received)) || Number(received) < (initial.receivedDeposit ?? 0) || Number(received) > Number(deposit)) errors.receivedDeposit = 'Tiền thực nhận phải từ cọc kế thừa đến tiền cọc'
    if (handoverAssets.some(asset => !(assetEntry(assetConditions, asset.code) ?? asset.condition).trim())) errors.handover = 'Nhập tình trạng cho từng tài sản bàn giao'
    const pickedMeters = resolveMeterIds({ roomMeters, roomId, fees })
    for (const fee of fees) {
      if (!Number.isSafeInteger(Number(fee.price)) || fee.price.trim() === '' || Number(fee.price) < 0 || (fee.legacyFixed && (!Number.isSafeInteger(Number(fee.quantity)) || Number(fee.quantity) < 0))) errors.fees = `Kiểm tra đơn giá hoặc số lượng phí ${fee.name}`
      const meterError = meterFeeError(fee, pickedMeters[fee.key])
      if (meterError) errors.fees = meterError
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    submitting.current = true
    const meterIds = resolveMeterIds({ roomMeters, roomId, fees })
    const input = {
      roomId, tenantId, occupantIds, startDate, endDate, monthlyRent: Number(rent), depositAmount: Number(deposit), receivedDeposit: Number(received), note, contractTemplateId: contractTemplateId || null, invoiceTemplateId: invoiceTemplateId || null,
      handover: { expectedRoomAssetIds: assets.filter(a => a.locationKind === 'room' && a.locationId === roomId).map(a => a.id), expectedAddedLocations: changes.addAssetIds.map(id => { const a = assets.find(x => x.id === id)!; return { assetId: id, kind: a.locationKind, id: a.locationId } }), ...changes, conditions: handoverAssets.map(asset => ({ assetCode: asset.code, condition: assetEntry(assetConditions, asset.code) ?? asset.condition })) },
      fees: fees.map(f => ({ feeTypeId: f.feeTypeId, name: f.name, unit: f.unit, quantitySource: f.quantitySource, unitPrice: Number(f.price), quantity: Number(f.quantity), initialReading: f.initialReading.trim() === '' ? undefined : Number(f.initialReading), existingMeterId: meterIds[f.key] })),
      proration: overrideProration || null, billingCycleMonths: Number(cycle) || 1,
      dueRule: dayOfMonth ? { kind: 'day_of_next_month', day: Number(dayOfMonth) } : null,
    }
    start(async () => {
      try {
      const r = initial.depositId ? await convertDepositToLeaseAction(initial.depositId, input as never) : await createLeaseAction(input as never)
      if (!r.ok) { submitting.current = false; setError(r.error); setFieldErrors(r.fieldErrors ?? {}); return }
      setCreatedId(r.data.id)
      const pendingPhotos = buildHandoverPhotoTasks(r.data.id, photos, handoverAssets.map(asset => asset.code), assetPhotos, r.data.handoverItems)
      await uploadPhotos(r.data.id, pendingPhotos)
      } catch { submitting.current = false; setError('Không thể tạo hợp đồng. Vui lòng thử lại.') }
    })
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1"><Label htmlFor="contract-template">Mẫu hợp đồng</Label>
        {templates.length ? <select id="contract-template" value={contractTemplateId} onChange={e => setContractTemplateId(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">{templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (mặc định)' : ''}</option>)}</select> : <p className="text-sm text-muted-foreground">Chưa có mẫu hợp đồng. Có thể thêm mẫu trong Cài đặt → Mẫu giấy tờ.</p>}{fieldError('contractTemplateId')}
      </div>
      <div className="space-y-1"><Label htmlFor="invoice-template">Mẫu hóa đơn</Label><select id="invoice-template" value={invoiceTemplateId} onChange={e => setInvoiceTemplateId(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm"><option value="">Theo mặc định hệ thống</option>{invoiceTemplates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (mặc định)' : ''}</option>)}</select>{fieldError('invoiceTemplateId')}</div>
      <h2 className="font-semibold">Bên thuê & người ở</h2>
        <div className="space-y-4">
          <div className="space-y-1"><Label htmlFor="room">Phòng</Label>
            <select id="room" value={roomId} disabled={!!initial.depositId} onChange={(e) => { const oldFacility = rooms.find(r => r.id === roomId)?.facilityId; setRoomId(e.target.value); setChanges(emptyChanges()); setAssetConditions({}); setAssetPhotos({}); const room = rooms.find((r) => r.id === e.target.value); if (room?.facilityId !== oldFacility) setFees(defaultFees(room?.facilityId)); else setFees(previous => previous.map(f => f.quantitySource === 'meter' ? { ...f, initialReading: '', existingMeterId: undefined } : f)); const p = room?.listPrice; if (p && !rent) setRent(String(p)) }} className="h-8 w-full rounded-lg border px-2 text-sm">
              <option value="">— chọn phòng —</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>{fieldError('roomId')}</div>
          <div className="space-y-1"><Label htmlFor="tenant">Bên thuê (khách hoặc công ty)</Label>
            <select id="tenant" value={tenantId} onChange={(e) => pickTenant(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
              <option value="">— chọn —</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{fieldError('tenantId')}</div>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Người ở trong phòng ({occupantIds.length})</legend>
            <div className="space-y-2 rounded-md border bg-card p-3">
              {tenant ? <p className="text-sm">{tenant.name} (bên ký)</p> : <p className="text-sm text-muted-foreground">Chọn bên thuê để thêm người ký.</p>}
              {occupantIds.filter(id => id !== tenantId).map(id => <div key={id} className="flex items-center justify-between gap-2 text-sm"><span>{tenants.find(t => t.id === id)?.name}</span><button type="button" aria-label={`Bỏ người ở ${tenants.find(t => t.id === id)?.name ?? ''}`} onClick={() => setAdditionalOccupantIds(previous => previous.filter(value => value !== id))}>×</button></div>)}
              <button type="button" aria-label="Thêm người ở cùng" aria-expanded={addingOccupant} className="rounded border px-2 text-sm" onClick={() => setAddingOccupant(!addingOccupant)}>+</button>
              {addingOccupant && <select aria-label="Chọn người ở cùng" className="block h-9 w-full rounded border px-2 text-sm" value="" onChange={e => { const id = e.target.value; if (id) setAdditionalOccupantIds(previous => [...previous, id]); setAddingOccupant(false) }}><option value="">— chọn người ở cùng —</option>{individuals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
            </div>{fieldError('occupantIds')}</fieldset>
        </div>
      <h2 className="font-semibold">Thời hạn & giá</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="start">Ngày bắt đầu</Label><Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />{fieldError('startDate')}</div>
          <div className="space-y-1"><Label htmlFor="end">Ngày kết thúc</Label><Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            {fieldError('endDate')}{startDate && <button type="button" className="text-xs underline" onClick={() => { const [y, m, d] = startDate.split('-').map(Number); setEndDate(addDays(`${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, -1)) }}>+12 tháng</button>}</div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="rent">Giá thuê tháng (VND)</Label><MoneyInput id="rent" value={rent} onValueChange={setRent} />{fieldError('monthlyRent') ?? warnBig(rent)}</div>
          <div className="space-y-1"><Label htmlFor="deposit">Tiền cọc (VND)</Label><MoneyInput id="deposit" value={deposit} onValueChange={setDeposit} />{fieldError('depositAmount') ?? warnBig(deposit)}</div>
          <div className="space-y-1"><Label htmlFor="received">Tiền đã cọc (VND)</Label><MoneyInput id="received" value={received} onValueChange={setReceived} />{fieldError('receivedDeposit')}<p className="text-sm text-muted-foreground">Còn thiếu: {formatVND(Math.max(0, Number(deposit) - Number(received)))}</p></div>
        </div>
      <LeaseFees feeTypes={feeTypes} roomMeters={roomMeters} roomId={roomId} fees={fees} onChange={setFees} onAddCommon={id => { const fee = feeTypes.find(f => f.id === id); if (fee) setFees(previous => [...previous, makeFee(fee, rooms.find(r => r.id === roomId)?.facilityId)]) }} />
      {fieldError('fees')}
      <h2 className="font-semibold">Thanh toán & lẻ ngày</h2>

        <div className="space-y-4">
          <div className="space-y-1"><Label htmlFor="due">Hạn thanh toán: ngày … của tháng sau (để trống = theo mặc định: {defaults.dueRuleLabel})</Label><Input id="due" inputMode="numeric" className="w-24" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="pro">Cách tính lẻ ngày</Label>
            <select id="pro" value={overrideProration} onChange={(e) => setOverrideProration(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
              <option value="">Theo mặc định hệ thống ({defaults.proration === 'days_30' ? 'chia 30' : 'số ngày thực của tháng'})</option><option value="days_30">Chia 30</option><option value="actual_days">Số ngày thực của tháng</option></select></div>
          <div className="space-y-1"><Label htmlFor="cycle">Kỳ thanh toán mặc định (số tháng mỗi hoá đơn)</Label>
            <select id="cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} className="h-8 w-full rounded-lg border px-2 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} tháng</option>)}</select></div>
        </div>
      <div><Label htmlFor="note">Ghi chú</Label><textarea id="note" className="w-full rounded border p-2" value={note} onChange={e => setNote(e.target.value)} /></div>
      <LeaseAssets key={roomId} assets={assets} roomId={roomId} facilityId={rooms.find(r => r.id === roomId)?.facilityId} canManageAssets={canManageAssets} moveTargets={moveTargets} changes={changes} onChange={setChanges} conditions={assetConditions} onCondition={(code, value) => setAssetConditions(previous => ({ ...previous, [code]: value }))} photos={assetPhotos} onPhotos={(code, files) => setAssetPhotos(previous => ({ ...previous, [code]: files }))} onForget={code => { setAssetConditions(previous => { const next = { ...previous }; delete next[code]; return next }); setAssetPhotos(previous => { const next = { ...previous }; delete next[code]; return next }) }} />
      {fieldError('handover')}
      <div><Label htmlFor="photos">Ảnh hợp đồng</Label><Input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => setPhotos(Array.from(e.target.files ?? []))} /></div>
      <h2 className="font-semibold">Tóm tắt</h2>

        <dl className="grid grid-cols-2 gap-2 rounded-md border bg-card p-3 text-sm">
          <dt className="text-muted-foreground">Phòng</dt><dd>{rooms.find((r) => r.id === roomId)?.label}</dd>
          <dt className="text-muted-foreground">Bên thuê</dt><dd>{tenant?.name}</dd>
          <dt className="text-muted-foreground">Số người ở</dt><dd>{occupantIds.length}</dd>
          <dt className="text-muted-foreground">Thời hạn</dt><dd>{startDate} → {endDate}</dd>
          <dt className="text-muted-foreground">Giá thuê</dt><dd>{formatVND(Number(rent))} /tháng</dd>
          <dt className="text-muted-foreground">Tiền cọc</dt><dd>{formatVND(Number(deposit))}</dd>
          <dt className="text-muted-foreground">Phí cố định hằng tháng</dt><dd>{formatVND(monthlyFixed)}</dd>
        </dl>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {createdId && failedPhotos.length > 0 ? <div className="space-y-2"><p className="text-destructive">Hợp đồng đã tạo. Chưa tải được: {failedPhotos.map(f => f.file.name).join(', ')}</p><Button disabled={pending} onClick={() => start(async () => uploadPhotos(createdId, failedPhotos))}>Thử tải lại ảnh lỗi</Button> <Button variant="outline" onClick={() => goToContract(createdId)}>Tiếp tục đến hợp đồng</Button></div> : <Button disabled={pending || !!createdId} onClick={submit}>Tạo hợp đồng thuê</Button>}
    </div>
  )
}
