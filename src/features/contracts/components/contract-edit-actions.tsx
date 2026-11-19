'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { previewInvoiceTemplateByIdAction } from '@/server/invoice-templates/actions'
import { previewTemplateByIdAction } from '@/server/templates/actions'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormDialog } from '@/components/form-dialog'
import { formatVND } from '@/domain/money'
import { todayVN } from '@/domain/dates'
import { formatPhoneDisplay } from '@/domain/phone'
import { createOccupantChangeAction } from '@/server/addenda/actions'
import { createFeeTypeAction } from '@/server/fees/actions'
import { createTenantAction } from '@/server/tenants/actions'
import { addDepositEntryAction, markDepositDoneAction } from '@/server/charges/actions'
import { uploadOne } from '@/components/file-upload'
import { PdfBlobDialog } from '@/components/pdf-blob-dialog'
import { EditAssets, assetsDraftChanged, emptyAssetsDraft, type AssetRow } from './edit-assets'
import { EditDocuments, docsDraftChanged, emptyDocsDraft, type DepositRow } from './edit-documents'
import {
  deleteContractAction,
  retryContractFileCleanupAction,
  setSignStatusAction,
  updateDepositContractAction,
  updateLeaseAction,
  updateLeaseAssetsAction,
  refreshContractDocumentsAction,
} from '@/server/contracts/actions'

type Common = { id: string; roomId: string; tenantId: string; depositAmount: number; signStatus: string }
type Contract =
  | (Common & { kind: 'lease'; startDate: string; endDate: string; monthlyRent: number; note: string })
  | (Common & { kind: 'deposit'; expectedMoveIn: string; agreedRent: number })
type Option = { id: string; label: string }
/** `draft`: khách mới chưa tạo, chỉ được tạo khi bấm "Lưu thay đổi". */
export type Person = {
  id: string
  name: string
  idNumber: string | null
  phone: string | null
  isCompany: boolean
  draft?: Record<string, unknown>
}

export type RenderCreatePerson = (p: {
  facility: { id: string; name: string }
  onCreated: (person: Person) => void
}) => React.ReactNode
export type RenderCreateFee = (p: {
  units: { id: string; name: string }[]
  onCreated: (fee: { id: string; name: string; unit: string; price: number; draft: Record<string, unknown> }) => void
}) => React.ReactNode

export type FeeData = {
  editable: boolean
  units: { id: string; name: string }[]
  current: {
    leaseFeeId: string | null
    feeTypeId: string | null
    name: string
    unit: string
    unitPrice: number
    locked: boolean
    draft?: Record<string, unknown>
    meterInit?: { initialReading: number; existingMeterId?: string }
  }[]
  meterSupported: boolean
  roomMeters: { id: string; feeTypeId: string | null; label: string; busy: boolean }[]
  options: { id: string; name: string; unit: string; price: number; meter: boolean }[]
}

export function ContractEditActions({
  contract,
  canDelete,
  rooms,
  tenants,
  mode,
  onCompleted,
  onSaved,
  occupants,
  people,
  templates,
  feeData,
  documents,
  assets,
  facility,
  renderCreatePerson,
  renderCreateFee,
}: {
  /** Gọi sau khi lưu xong (thay cho `onCompleted`), để quay về hợp đồng vừa sửa. */ onSaved?: () => void
  facility?: { id: string; name: string }
  /** Form tạo nhanh khách / loại phí do tầng route cấp (thuộc tính năng khác). */ renderCreatePerson?: RenderCreatePerson
  renderCreateFee?: RenderCreateFee
  contract: Contract
  canDelete: boolean
  rooms: Option[]
  tenants: Option[]
  /** Người ở hiện tại và những người có thể thêm (chỉ hợp đồng thuê). */ occupants?: Person[]
  people?: Person[]
  /** Phí dịch vụ của hợp đồng thuê và các loại phí đã cài đặt để thêm. */ feeData?: FeeData | null
  /** Mẫu hợp đồng và mẫu hoá đơn của hợp đồng thuê; lưu cùng nút "Lưu thay đổi". */ templates?: {
    contract: { id: string; name: string; isDefault: boolean }[]
    contractId: string | null
    invoice: { id: string; name: string; isDefault: boolean }[]
    invoiceId: string | null
  }
  /** Tài sản trong phòng (chỉ hợp đồng thuê, cần quyền tài sản). */ assets?: {
    inRoom: AssetRow[]
    available: AssetRow[]
  } | null
  /** Giấy tờ, sổ cọc của hợp đồng; chỉnh dạng nháp, lưu cùng nút "Lưu thay đổi". */ documents?: {
    signedFileId: string | null
    entries: DepositRow[]
    canEditDeposit: boolean
  }
  mode?: 'edit' | 'delete'
  onCompleted?: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(mode === 'edit')
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState(0)
  const [deleted, setDeleted] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(mode === 'delete')
  const [roomId, setRoomId] = useState(contract.roomId)
  const [tenantId, setTenantId] = useState(contract.tenantId)
  const [deposit, setDeposit] = useState(String(contract.depositAmount))
  const [rent, setRent] = useState(String(contract.kind === 'lease' ? contract.monthlyRent : contract.agreedRent))
  const [startDate, setStartDate] = useState(contract.kind === 'lease' ? contract.startDate : contract.expectedMoveIn)
  const [endDate, setEndDate] = useState(contract.kind === 'lease' ? contract.endDate : '')
  const [note, setNote] = useState(contract.kind === 'lease' ? contract.note : '')
  const signed = contract.signStatus === 'signed'
  // Người ở: thêm, xoá nhanh, chọn đại diện (người ký hợp đồng); tất cả chỉ lưu khi bấm "Lưu thay đổi"
  const [occ, setOcc] = useState<Person[]>(occupants ?? [])
  const [adding, setAdding] = useState(false)
  const [docs, setDocs] = useState(emptyDocsDraft)
  const [assetDraft, setAssetDraft] = useState(emptyAssetsDraft)
  const [filter, setFilter] = useState('')
  const [creatingPerson, setCreatingPerson] = useState(false)
  const [creatingFee, setCreatingFee] = useState(false)
  const [feeRows, setFeeRows] = useState((feeData?.current ?? []).map((f) => ({ ...f, price: String(f.unitPrice) })))
  const [addingFee, setAddingFee] = useState(false)
  const feeOptions = (feeData?.options ?? []).filter((o) => o.meter || !feeRows.some((r) => r.feeTypeId === o.id))
  // Phí theo đồng hồ (điện, nước): cần chỉ số ban đầu, và có thể dùng lại đồng hồ có sẵn của phòng
  const [meterFee, setMeterFee] = useState<NonNullable<FeeData['options']>[number] | null>(null)
  const [meterReading, setMeterReading] = useState('')
  const [meterId, setMeterId] = useState('')
  const defaultContractTemplate =
    templates?.contract.find((t) => t.id === templates.contractId)?.id ??
    templates?.contract.find((t) => t.isDefault)?.id ??
    templates?.contract[0]?.id ??
    ''
  const [contractTpl, setContractTpl] = useState(defaultContractTemplate)
  const [tplPdf, setTplPdf] = useState<{ base64: string; title: string } | null>(null)
  const [previewingTpl, setPreviewingTpl] = useState<string | null>(null)
  /** Xem nhanh mẫu đang chọn với dữ liệu mẫu, không cần dữ liệu hợp đồng. */
  async function previewTemplate(id: string) {
    setPreviewingTpl(id)
    const r = await previewTemplateByIdAction(id)
    setPreviewingTpl(null)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setTplPdf({ base64: r.data.base64, title: templates?.contract.find((t) => t.id === id)?.name ?? 'Xem nhanh mẫu' })
  }
  /** Xem nhanh mẫu hoá đơn với dữ liệu mẫu. */
  async function previewInvoiceTemplate(id: string) {
    setPreviewingTpl(id)
    const r = await previewInvoiceTemplateByIdAction(id)
    setPreviewingTpl(null)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setTplPdf({
      base64: r.data.base64,
      title: templates?.invoice.find((t) => t.id === id)?.name ?? 'Xem nhanh mẫu hoá đơn',
    })
  }
  const [invoiceTpl, setInvoiceTpl] = useState(templates?.invoiceId ?? '')
  const editOccupants = contract.kind === 'lease' && occupants !== undefined && !!people
  const initialIds = (occupants ?? [])
    .filter((o) => !o.isCompany)
    .map((o) => o.id)
    .sort()
    .join(',')
  const occIds = occ.filter((o) => !o.isCompany).map((o) => o.id)
  const addable = (people ?? []).filter((p) => !occ.some((o) => o.id === p.id))

  const [confirmingSave, setConfirmingSave] = useState(false)
  function save(e: React.FormEvent) {
    e.preventDefault()
    if (signed) {
      setConfirmingSave(true)
      return
    }
    doSave()
  }
  function doSave() {
    setError('')
    start(async () => {
      if (editOccupants && !occ.some((o) => o.id === tenantId)) {
        setError('Người đại diện phải nằm trong danh sách người ở')
        return
      }
      // Khách và loại phí mới chỉ được tạo ở bước này; id tạm được đổi sang id thật
      const realId = new Map<string, string>()
      for (const person of occ) {
        if (!person.draft) continue
        const r = await createTenantAction(person.draft)
        if (!r.ok) {
          setError(`Không tạo được khách ${person.name}: ${r.error}`)
          return
        }
        realId.set(person.id, (r.data as { id: string }).id)
      }
      const feeTypeIds = new Map<number, string>()
      for (const [index, row] of feeRows.entries()) {
        if (!row.draft) continue
        const r = await createFeeTypeAction(row.draft)
        if (!r.ok) {
          setError(`Không tạo được loại phí ${row.name}: ${r.error}`)
          return
        }
        feeTypeIds.set(index, (r.data as { id: string }).id)
      }
      const resolve = (id: string) => realId.get(id) ?? id
      // Đã tạo thì bỏ bản nháp, nếu các bước sau lỗi thì bấm lưu lại sẽ không tạo trùng
      if (realId.size) {
        setOcc(occ.map((o) => ({ ...o, id: resolve(o.id), draft: undefined })))
        setTenantId(resolve(tenantId))
      }
      if (feeTypeIds.size)
        setFeeRows(
          feeRows.map((r, i) => (feeTypeIds.has(i) ? { ...r, feeTypeId: feeTypeIds.get(i)!, draft: undefined } : r)),
        )
      const finalTenantId = resolve(tenantId)
      const finalOccIds = occ.filter((o) => !o.isCompany).map((o) => resolve(o.id))
      const common = { roomId, tenantId: finalTenantId, depositAmount: Number(deposit) }
      const result =
        contract.kind === 'lease'
          ? await updateLeaseAction(
              contract.id,
              {
                ...common,
                startDate,
                endDate,
                monthlyRent: Number(rent),
                note,
                ...(feeData?.editable && {
                  fees: feeRows.map((r, i) => ({
                    leaseFeeId: r.leaseFeeId ?? undefined,
                    feeTypeId: feeTypeIds.get(i) ?? r.feeTypeId,
                    unitPrice: Number(r.price),
                    ...(r.meterInit && {
                      initialReading: r.meterInit.initialReading,
                      existingMeterId: r.meterInit.existingMeterId,
                    }),
                  })),
                }),
                ...(templates && {
                  contractTemplateId:
                    contractTpl && contractTpl !== (templates.contractId ?? defaultContractTemplate)
                      ? contractTpl
                      : undefined,
                  invoiceTemplateId: invoiceTpl || null,
                }),
              },
              signed,
            )
          : await updateDepositContractAction(
              contract.id,
              { ...common, expectedMoveIn: startDate, agreedRent: Number(rent) },
              signed,
            )
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (editOccupants && [...finalOccIds].sort().join(',') !== initialIds) {
        const r2 = await createOccupantChangeAction(contract.id, {
          effectiveDate: todayVN(),
          occupantIds: finalOccIds,
          adjustmentTarget: 'next',
        })
        if (!r2.ok) {
          setError(r2.error)
          return
        }
      }
      if (assets && assetsDraftChanged(assetDraft)) {
        const r = await updateLeaseAssetsAction(contract.id, {
          add: assetDraft.add.map((a) => a.id),
          create: assetDraft.create.map(({ key: _key, ...a }) => a),
          remove: Object.entries(assetDraft.remove).map(([assetId, action]) => ({ assetId, action })),
        })
        if (!r.ok) {
          setError(r.error)
          return
        }
        setAssetDraft(emptyAssetsDraft)
      }
      // Giấy tờ, sổ cọc: ghi nháp ở trên, lưu ở bước này
      if (docsDraftChanged(docs)) {
        try {
          if (docs.signedFile) {
            const fileId = await uploadOne(docs.signedFile, 'signed_contract', contract.id)
            const r = await setSignStatusAction(contract.kind, contract.id, 'signed', fileId)
            if (!r.ok) {
              setError(r.error)
              return
            }
          }
          for (const photo of docs.photos) await uploadOne(photo, 'lease_photo', contract.id)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Không tải được tệp')
          return
        }
        for (const entry of docs.newEntries) {
          const r = await addDepositEntryAction(contract.id, {
            date: entry.date,
            type: entry.type,
            amount: entry.amount,
            status: 'pending',
          })
          if (!r.ok) {
            setError(r.error)
            return
          }
        }
        for (const [id, done] of Object.entries(docs.doneEntries)) {
          const r = await markDepositDoneAction(id, done)
          if (!r.ok) {
            setError(r.error)
            return
          }
        }
        setDocs(emptyDocsDraft)
      }
      // Hợp đồng và biên bản bàn giao có thay đổi: tạo lại bản PDF trong "Văn bản đã lưu"
      if (contract.kind === 'lease') {
        const r = await refreshContractDocumentsAction(contract.id)
        if (!r.ok) toast.error(r.error)
        else for (const w of r.data.warnings) toast.warning(w)
      }
      setEditing(false)
      router.refresh()
      if (onSaved) onSaved()
      else onCompleted?.()
    })
  }
  const deleteWarning = `${signed ? 'Hợp đồng đã ký. ' : ''}Xoá vĩnh viễn hợp đồng này cùng các hoá đơn, khoản tiền cọc, thanh toán, phụ lục, biên bản bàn giao và tệp đính kèm liên quan. Thao tác không thể hoàn tác. Bạn có chắc chắn muốn xoá?`
  function remove() {
    setError('')
    start(async () => {
      const result = await deleteContractAction(contract.kind, contract.id, true)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.data.pendingFiles) {
        setDeleted(true)
        setPendingFiles(result.data.pendingFiles)
        return
      }
      if (onCompleted) {
        onCompleted()
        router.refresh()
      } else {
        router.push('/contracts')
        router.refresh()
      }
    })
  }
  if (deleted)
    return (
      <div className="space-y-3 rounded-xl border p-4" role="alert">
        <p>Hợp đồng đã được xoá. Còn {pendingFiles} tệp chưa xoá được khỏi kho lưu trữ; hãy thử lại.</p>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await retryContractFileCleanupAction()
              if (!result.ok) {
                setError(result.error)
                return
              }
              if (result.data.pendingFiles) {
                setPendingFiles(result.data.pendingFiles)
                return
              }
              router.push('/contracts')
              router.refresh()
            })
          }
        >
          Thử xoá tệp lại
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!mode && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setError('')
              setEditing(!editing)
            }}
          >
            {editing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa hợp đồng'}
          </Button>
        )}
        {canDelete && mode !== 'edit' && !confirmingDelete && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setError('')
              setConfirmingDelete(true)
            }}
          >
            Xoá hợp đồng
          </Button>
        )}
      </div>
      {confirmingDelete && (
        <div
          className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          role="alertdialog"
          aria-label="Xác nhận xoá hợp đồng"
        >
          <p className="text-sm">{deleteWarning}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>
              Xác nhận xoá
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmingDelete(false)}
            >
              Huỷ
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <form id="edit-contract-form" onSubmit={save} className="space-y-3 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            Hoá đơn và các khoản tiền cọc hiện có sẽ được giữ nguyên. Vui lòng tự kiểm tra và điều chỉnh nếu cần.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="edit-room">Phòng</Label>
              <select
                id="edit-room"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
              >
                {rooms.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {!editOccupants && (
              <div className="space-y-1">
                <Label htmlFor="edit-tenant">Bên thuê</Label>
                <select
                  id="edit-tenant"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                >
                  {tenants.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="edit-rent">Giá thuê (VND/tháng)</Label>
              <MoneyInput id="edit-rent" required value={rent} onValueChange={setRent} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-deposit">Tiền cọc (VND)</Label>
              <MoneyInput id="edit-deposit" required value={deposit} onValueChange={setDeposit} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-start">{contract.kind === 'lease' ? 'Ngày bắt đầu' : 'Ngày vào ở dự kiến'}</Label>
              <Input
                id="edit-start"
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {contract.kind === 'lease' && (
              <div className="space-y-1">
                <Label htmlFor="edit-end">Ngày kết thúc</Label>
                <Input
                  id="edit-end"
                  required
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}
          </div>
          {contract.kind === 'lease' && (
            <div className="space-y-1">
              <Label htmlFor="edit-note">Ghi chú</Label>
              <textarea
                id="edit-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-20 w-full rounded-lg border bg-background p-2 text-sm"
              />
            </div>
          )}
          {templates && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TemplatePicker
                label="Mẫu hợp đồng"
                name="edit-contract-tpl"
                items={templates.contract.map((t) => ({
                  id: t.id,
                  name: `${t.name}${t.isDefault ? ' (mặc định)' : ''}`,
                }))}
                value={contractTpl}
                onChange={setContractTpl}
                onView={previewTemplate}
                viewing={previewingTpl}
                emptyLabel="Mẫu mặc định của hệ thống"
              />
              <TemplatePicker
                label="Mẫu hoá đơn"
                name="edit-invoice-tpl"
                items={[
                  { id: '', name: 'Theo mặc định hệ thống', noView: true },
                  ...templates.invoice.map((t) => ({ id: t.id, name: `${t.name}${t.isDefault ? ' (mặc định)' : ''}` })),
                ]}
                value={invoiceTpl}
                onChange={setInvoiceTpl}
                onView={previewInvoiceTemplate}
                viewing={previewingTpl}
              />
            </div>
          )}
          {editOccupants && (
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Người ở</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilter('')
                    setCreatingPerson(false)
                    setAdding(true)
                  }}
                >
                  Thêm người
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Họ và tên</th>
                      <th className="py-1 pr-3 font-medium">Căn cước / Passport</th>
                      <th className="py-1 pr-3 font-medium">Số điện thoại</th>
                      <th className="py-1 font-medium">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {occ.map((o) => (
                      <tr key={o.id}>
                        <td className="py-1.5 pr-3 font-medium">
                          {o.name}
                          {o.id === tenantId && (
                            <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              Đại diện
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">{o.idNumber ?? '—'}</td>
                        <td className="py-1.5 pr-3">{o.phone ? formatPhoneDisplay(o.phone) : '—'}</td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            {o.id !== tenantId && (
                              <Button type="button" size="sm" variant="outline" onClick={() => setTenantId(o.id)}>
                                Đặt làm đại diện
                              </Button>
                            )}
                            {(o.id !== tenantId || occ.length > 1) && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Xoá ${o.name}`}
                                onClick={() => {
                                  if (o.id === tenantId)
                                    setTenantId(
                                      (occ.find((x) => x.id !== o.id && !x.isCompany) ??
                                        occ.find((x) => x.id !== o.id))!.id,
                                    )
                                  setOcc(occ.filter((x) => x.id !== o.id))
                                }}
                              >
                                Xoá
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {occ.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-2 text-muted-foreground">
                          Chưa có người ở.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Người ở được ghi nhận từ ngày lưu; hoá đơn tạo sau đó tự tính theo số người mới. Xoá người đại diện thì
                người ở kế tiếp trong danh sách sẽ thành đại diện; phải còn ít nhất một người. Khách hoặc loại phí mới
                chỉ được tạo khi bấm &ldquo;Lưu thay đổi&rdquo;.
              </p>
            </div>
          )}
          {feeData && (
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Phí dịch vụ của hợp đồng</h3>
                {feeData.editable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCreatingFee(false)
                      setAddingFee(true)
                    }}
                  >
                    Thêm phí
                  </Button>
                )}
              </div>
              {feeRows.length === 0 && <p className="text-xs text-muted-foreground">Hợp đồng chưa có phí dịch vụ.</p>}
              <div className="space-y-1.5">
                {feeRows.map((r, i) => (
                  <div key={r.leaseFeeId ?? r.feeTypeId ?? i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-40 flex-1 font-medium">
                      {r.name} <span className="font-normal text-muted-foreground">· {r.unit}</span>
                    </span>
                    {feeData.editable ? (
                      <>
                        <Input
                          aria-label={`Đơn giá ${r.name}`}
                          className="h-8 w-36"
                          type="number"
                          min="0"
                          step="1"
                          value={r.price}
                          onChange={(e) =>
                            setFeeRows(feeRows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                          }
                        />
                        {r.locked ? (
                          <span className="w-12 text-xs text-muted-foreground">Theo đồng hồ</span>
                        ) : r.meterInit ? (
                          <span className="text-xs text-muted-foreground">
                            Đồng hồ, chỉ số đầu {r.meterInit.initialReading}
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Xoá phí ${r.name}`}
                            onClick={() => setFeeRows(feeRows.filter((_, j) => j !== i))}
                          >
                            Xoá
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="tabular-nums">{formatVND(r.unitPrice)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {assets && (
            <EditAssets
              inRoom={assets.inRoom}
              available={assets.available}
              draft={assetDraft}
              onChange={setAssetDraft}
            />
          )}
          {documents && (
            <EditDocuments
              kind={contract.kind}
              signed={signed}
              signedFileId={documents.signedFileId}
              entries={documents.entries}
              canEditDeposit={documents.canEditDeposit}
              draft={docs}
              onChange={setDocs}
            />
          )}
        </form>
      )}
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Thêm người ở"
        description="Chọn một người đã có trong danh sách khách của cơ sở, hoặc tạo khách mới."
        size="md"
      >
        {creatingPerson && facility && renderCreatePerson ? (
          <div className="space-y-3">
            <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingPerson(false)}>
              ← Quay lại danh sách
            </Button>
            {renderCreatePerson({
              facility,
              onCreated: (person) => {
                setOcc([...occ, person])
                setCreatingPerson(false)
                setAdding(false)
              },
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Tìm người"
                placeholder="Tìm theo tên, căn cước, số điện thoại…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              {renderCreatePerson && (
                <Button type="button" size="sm" variant="outline" onClick={() => setCreatingPerson(true)}>
                  + Tạo mới
                </Button>
              )}
            </div>
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {addable
                .filter((p) =>
                  `${p.name} ${p.idNumber ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()),
                )
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setOcc([...occ, p])
                        setAdding(false)
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.idNumber ?? '—'} · {p.phone ? formatPhoneDisplay(p.phone) : '—'}
                      </span>
                    </button>
                  </li>
                ))}
              {addable.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  Chưa có người phù hợp trong danh sách. Bấm &ldquo;Tạo mới&rdquo; để thêm khách.
                </li>
              )}
            </ul>
          </div>
        )}
      </FormDialog>
      <FormDialog
        open={addingFee}
        onOpenChange={setAddingFee}
        title="Thêm phí"
        description="Chọn từ các loại phí đã cài đặt (Cài đặt → Phí dịch vụ). Đơn giá lấy theo cơ sở, có thể sửa sau khi thêm."
        size="md"
      >
        {creatingFee && renderCreateFee ? (
          <div className="space-y-3">
            <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingFee(false)}>
              ← Quay lại danh sách
            </Button>
            {renderCreateFee({
              units: feeData?.units ?? [],
              onCreated: (fee) => {
                setFeeRows([
                  ...feeRows,
                  {
                    leaseFeeId: null,
                    feeTypeId: null,
                    draft: fee.draft,
                    name: fee.name,
                    unit: fee.unit,
                    unitPrice: fee.price,
                    price: String(fee.price),
                    locked: false,
                  },
                ])
                setCreatingFee(false)
                setAddingFee(false)
              },
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {renderCreateFee && (
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => setCreatingFee(true)}>
                  + Tạo loại phí mới
                </Button>
              </div>
            )}
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {feeOptions.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
                    onClick={() => {
                      if (o.meter) {
                        setMeterFee(o)
                        setMeterReading('')
                        setMeterId('')
                        return
                      }
                      setFeeRows([
                        ...feeRows,
                        {
                          leaseFeeId: null,
                          feeTypeId: o.id,
                          name: o.name,
                          unit: o.unit,
                          unitPrice: o.price,
                          price: String(o.price),
                          locked: false,
                        },
                      ])
                      setAddingFee(false)
                    }}
                  >
                    <span className="font-medium">
                      {o.name}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {o.unit}
                        {o.meter ? ' · theo đồng hồ' : ''}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatVND(o.price)}</span>
                  </button>
                </li>
              ))}
              {feeOptions.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  Chưa có loại phí nào để thêm. Bấm &ldquo;Tạo loại phí mới&rdquo;.
                </li>
              )}
            </ul>
          </div>
        )}
      </FormDialog>
      {tplPdf && <PdfBlobDialog base64={tplPdf.base64} title={tplPdf.title} onClose={() => setTplPdf(null)} />}
      <ConfirmDialog
        open={confirmingSave}
        onOpenChange={setConfirmingSave}
        title="Lưu thay đổi hợp đồng đã ký?"
        description="Hợp đồng đã ký. Hãy kiểm tra lại bản đã ký trước khi lưu."
        confirmLabel="Lưu thay đổi"
        onConfirm={doSave}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background px-1 pt-3">
          <Button type="submit" form="edit-contract-form" disabled={pending}>
            Lưu thay đổi
          </Button>
          <p className="text-xs text-muted-foreground">
            Mọi thay đổi trong cửa sổ này (thông tin, người ở, phí, mẫu, tài sản, giấy tờ, sổ cọc) chỉ được lưu khi bấm
            nút này.
          </p>
        </div>
      )}
      <FormDialog
        open={meterFee !== null}
        onOpenChange={(o) => {
          if (!o) setMeterFee(null)
        }}
        title={meterFee ? `Thêm phí ${meterFee.name}` : 'Thêm phí'}
        description="Bắt buộc chọn đồng hồ và nhập chỉ số ban đầu. Dùng lại đồng hồ có sẵn của phòng hoặc tạo đồng hồ mới."
        size="sm"
      >
        {meterFee && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="meter-pick">Đồng hồ</Label>
              <select
                id="meter-pick"
                value={meterId}
                onChange={(e) => setMeterId(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
              >
                <option value="">— Chọn đồng hồ —</option>
                <option value="__new__">Tạo đồng hồ mới</option>
                {(feeData?.roomMeters ?? [])
                  .filter((m) => m.feeTypeId === meterFee.id && !m.busy)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="meter-reading">
                {meterId && meterId !== '__new__' ? 'Chỉ số hiện tại của đồng hồ' : 'Chỉ số ban đầu'}
              </Label>
              <Input
                id="meter-reading"
                inputMode="numeric"
                value={meterReading}
                onChange={(e) => setMeterReading(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={!meterId || !/^\d+$/.test(meterReading.trim())}
              onClick={() => {
                setFeeRows([
                  ...feeRows,
                  {
                    leaseFeeId: null,
                    feeTypeId: meterFee.id,
                    name: meterFee.name,
                    unit: meterFee.unit,
                    unitPrice: meterFee.price,
                    price: String(meterFee.price),
                    locked: false,
                    meterInit: {
                      initialReading: Number(meterReading),
                      existingMeterId: meterId === '__new__' ? undefined : meterId,
                    },
                  },
                ])
                setMeterFee(null)
                setAddingFee(false)
              }}
            >
              Thêm vào hợp đồng
            </Button>
          </div>
        )}
      </FormDialog>
    </div>
  )
}

/** Chọn một mẫu trong danh sách, mỗi mẫu có nút Xem nhanh (dữ liệu mẫu) mà không đổi lựa chọn. */
function TemplatePicker({
  label,
  name,
  items,
  value,
  onChange,
  onView,
  viewing,
  emptyLabel,
}: {
  label: string
  name: string
  items: { id: string; name: string; noView?: boolean }[]
  value: string
  onChange: (id: string) => void
  onView: (id: string) => void
  viewing: string | null
  emptyLabel?: string
}) {
  return (
    <div className="space-y-1">
      <Label id={`${name}-label`}>{label}</Label>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul role="radiogroup" aria-labelledby={`${name}-label`} className="divide-y divide-border/60 rounded-lg border">
          {items.map((t) => (
            <li key={t.id || 'default'} className="flex items-center gap-2 px-2 py-1">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-sm">
                <input type="radio" name={name} checked={value === t.id} onChange={() => onChange(t.id)} />
                <span className="truncate">{t.name}</span>
              </label>
              {!t.noView && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={viewing !== null}
                  onClick={() => onView(t.id)}
                >
                  {viewing === t.id ? 'Đang dựng…' : 'Xem'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
