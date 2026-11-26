'use client'

import { useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeftRight,
  CalendarPlus,
  FilePenLine,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  UserRoundPlus,
  CircleStop,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { IconTip, IconTipGroup } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  quickContractDataAction,
  previewContractRestoreAction,
  restoreContractAction,
} from '../../server/contracts/actions'
import { createAssignmentAction } from '../../server/addenda/actions'
import { ContractEditActions, type RenderCreateFee, type RenderCreatePerson } from './contract-edit-actions'
import { ExtensionDialog } from './extension-dialog'
import { TerminationWizard } from './termination-wizard'
import { TransferWizard } from './transfer-wizard'
import { BareSelect } from './contract-form-ui'

type Action = 'edit' | 'delete' | 'termination' | 'assignment' | 'extension' | 'transfer' | 'restore'
type Data = Extract<Awaited<ReturnType<typeof quickContractDataAction>>, { ok: true }>['data']
type Preview = Extract<Awaited<ReturnType<typeof previewContractRestoreAction>>, { ok: true }>['data']
const ACTIONS = [
  { key: 'edit', label: 'Sửa hợp đồng', icon: FilePenLine },
  { key: 'delete', label: 'Xóa hợp đồng', icon: Trash2 },
  { key: 'termination', label: 'Thanh lý hợp đồng', icon: CircleStop },
  { key: 'assignment', label: 'Chuyển nhượng hợp đồng', icon: UserRoundPlus },
  { key: 'extension', label: 'Gia hạn hợp đồng', icon: CalendarPlus },
  { key: 'transfer', label: 'Chuyển phòng', icon: ArrowLeftRight },
  { key: 'restore', label: 'Khôi phục hợp đồng', icon: RotateCcw },
] as const

export function ContractRowActions({
  id,
  kind,
  active,
  canDelete,
  redirectAfterDelete,
  presentation = 'row',
  renderCreatePerson,
  renderCreateFee,
}: {
  id: string
  kind: 'lease' | 'deposit'
  active: boolean
  canDelete: boolean
  redirectAfterDelete?: string
  /** 'row' xếp mọi thao tác thành một hàng biểu tượng; 'detail' đưa thao tác chính ra nút có nhãn, phần còn lại vào menu. */ presentation?:
    'row' | 'detail'
  /** Các mục sửa kèm theo (phí phát sinh, mẫu hoá đơn, giấy tờ, sổ cọc...) do tầng route cấp vì chúng thuộc nhiều tính năng. */ renderCreatePerson?: RenderCreatePerson
  renderCreateFee?: RenderCreateFee
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [action, setAction] = useState<Action | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [recipient, setRecipient] = useState('')
  const [date, setDate] = useState('')
  const [pending, start] = useTransition()
  // Nạp dữ liệu từ lúc rê chuột/focus vào biểu tượng để popup có nội dung ngay khi bấm
  const prefetched = useRef<ReturnType<typeof quickContractDataAction> | null>(null)
  const prefetch = () => {
    prefetched.current ??= quickContractDataAction(kind, id)
  }
  const close = () => {
    prefetched.current = null
    setAction(null)
    setData(null)
    setPreview(null)
    setError('')
    router.refresh()
  }
  /** Lưu xong: đóng popup sửa và mở lại hợp đồng vừa sửa (đang ở chính hợp đồng đó thì chỉ làm mới). */
  const saved = () => {
    close()
    if (pathname !== `/contracts/${id}`) router.push(`/contracts/${id}`)
  }
  const open = (next: Action) => {
    setAction(next)
    setData(null)
    setPreview(null)
    setError('')
    setRecipient('')
    setDate('')
    start(async () => {
      if (next === 'restore') {
        const result = await previewContractRestoreAction(kind, id)
        if (result.ok) setPreview(result.data)
        else setError(result.error)
      } else {
        const result = await (prefetched.current ?? quickContractDataAction(kind, id))
        prefetched.current = null
        if (result.ok) {
          setData(result.data)
          setDate(result.data.form?.today ?? '')
        } else setError(result.error)
      }
    })
  }
  const label = ACTIONS.find((item) => item.key === action)?.label ?? ''
  // Menu nổi: cần đục hoàn toàn, không dùng backdrop blur của component dùng chung.
  const menuClass = 'w-56 border-border/80 bg-popover shadow-lg backdrop-blur-none' // taste-skill-ignore
  const available = ACTIONS.filter(
    (item) =>
      (item.key !== 'delete' || canDelete) &&
      (item.key !== 'edit' || kind !== 'lease' || active) &&
      (!['termination', 'assignment', 'extension', 'transfer'].includes(item.key) || (kind === 'lease' && active)),
  )
  const rest = available.filter((item) => item.key !== 'edit')
  const canEdit = kind !== 'lease' || active
  return (
    <>
      {presentation === 'row' ? (
        <IconTipGroup>
          <div className="flex flex-nowrap items-center justify-start gap-0.5">
            {available.map((item) => (
              <IconTip key={item.key} label={item.label}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={item.label}
                  className="text-muted-foreground hover:text-foreground"
                  onPointerEnter={item.key === 'edit' ? prefetch : undefined}
                  onFocus={item.key === 'edit' ? prefetch : undefined}
                  onClick={() => open(item.key)}
                >
                  <item.icon className="size-4" />
                </Button>
              </IconTip>
            ))}
          </div>
        </IconTipGroup>
      ) : (
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant={kind === 'lease' ? 'default' : 'outline'}
              onPointerEnter={prefetch}
              onFocus={prefetch}
              onClick={() => open('edit')}
            >
              <FilePenLine className="size-3.5" />
              Sửa hợp đồng
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Thao tác khác"
              className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={menuClass}>
              {rest.map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  variant={item.key === 'delete' ? 'destructive' : 'default'}
                  onClick={() => open(item.key)}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
              {rest.length === 0 && <DropdownMenuItem disabled>Không có thao tác khác</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          className={`max-h-[94vh] overflow-y-auto ${action === 'edit' || action === 'termination' ? 'sm:max-w-3xl' : 'sm:max-w-2xl'}`}
        >
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>Hợp đồng và dữ liệu liên quan sẽ được kiểm tra trước khi lưu.</DialogDescription>
          </DialogHeader>
          {pending && !data && !preview && !error && (
            <div className="space-y-3" aria-busy="true">
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-40 rounded-xl bg-muted" />
              <div className="h-24 rounded-xl bg-muted" />
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {data && (action === 'edit' || action === 'delete') && (
            <ContractEditActions
              assets={data.assetData}
              documents={{
                signedFileId: data.extras?.signedFileId ?? null,
                entries: data.extras?.depositEntries ?? [],
                canEditDeposit: data.extras?.billing ?? false,
              }}
              facility={data.facility}
              renderCreatePerson={renderCreatePerson}
              renderCreateFee={renderCreateFee}
              contract={data.contract}
              canDelete={canDelete}
              rooms={data.rooms}
              tenants={data.tenants}
              occupants={kind === 'lease' ? data.occupants : undefined}
              people={kind === 'lease' && data.form ? data.people : undefined}
              feeData={kind === 'lease' ? data.feeData : undefined}
              templates={
                data.extras
                  ? {
                      contract: data.extras.contractTemplates,
                      contractId: data.extras.contractTemplateId,
                      invoice: data.extras.invoiceTemplates,
                      invoiceId: data.extras.invoiceTemplateId,
                    }
                  : undefined
              }
              mode={action}
              onCompleted={
                action === 'delete' && redirectAfterDelete ? () => router.replace(redirectAfterDelete) : close
              }
              onSaved={saved}
            />
          )}
          {data?.form && action === 'extension' && (
            <ExtensionDialog
              leaseId={id}
              endDate={data.form.endDate}
              today={data.form.today}
              defaultOpen
              onCompleted={close}
            />
          )}
          {data?.form && action === 'transfer' && (
            <TransferWizard
              leaseId={id}
              currentRoomId={data.form.currentRoomId}
              freeRooms={data.form.freeRooms}
              meters={data.form.meters}
              today={data.form.today}
              defaultOpen
              onCompleted={close}
            />
          )}
          {data?.form && action === 'termination' && (
            <TerminationWizard
              leaseId={id}
              meters={data.form.terminationMeters}
              today={data.form.today}
              assets={data.form.checkoutAssets}
              depositBalance={data.form.depositBalance}
              defaultOpen
              onCompleted={close}
            />
          )}
          {data?.form && action === 'assignment' && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                setError('')
                start(async () => {
                  const result = await createAssignmentAction(id, { effectiveDate: date, newTenantId: recipient })
                  if (!result.ok) setError(result.error)
                  else close()
                })
              }}
            >
              <p>
                Người nhận kế thừa hợp đồng; người cũ được đưa khỏi danh sách người ở. Bản hợp đồng đã ký được giữ
                nguyên.
              </p>
              <div className="grid gap-1">
                <span className="text-sm font-medium">Người nhận</span>
                <BareSelect
                  ariaLabel="Người nhận"
                  value={recipient}
                  onValueChange={setRecipient}
                  options={data.tenants
                    .filter((t) => t.id !== data.contract.tenantId)
                    .map((t) => ({ value: t.id, label: t.label }))}
                  placeholder="Chọn người nhận"
                />
              </div>
              <label className="grid gap-1">
                Ngày hiệu lực
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-9 rounded border px-2"
                />
              </label>
              <Button disabled={pending} type="submit">
                Lưu phụ lục
              </Button>
            </form>
          )}
          {preview && action === 'restore' && (
            <div className="space-y-3">
              <p>
                Khôi phục trạng thái trước lần thay đổi gần nhất. Các mục sau sẽ bị xóa vĩnh viễn hoặc đưa về trạng thái
                trước đó:
              </p>
              <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5">
                {preview.items.map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    {(
                      {
                        invoice: 'Hóa đơn',
                        payment: 'Thanh toán',
                        deposit: 'Tiền cọc',
                        addendum: 'Phụ lục',
                        handover: 'Bàn giao',
                        file: 'Tệp',
                        file_retention: 'Hạn lưu tệp',
                        meter_reading: 'Chỉ số',
                        adjustment: 'Điều chỉnh',
                        invoice_line: 'Dòng hóa đơn',
                      } as Record<string, string>
                    )[item.type] ?? item.type}
                    : {item.label}
                  </li>
                ))}
              </ul>
              {!preview.items.length && <p>Không có dữ liệu phát sinh cần xóa.</p>}
              {preview.blockedReason && (
                <p role="alert" className="text-destructive">
                  {preview.blockedReason}
                </p>
              )}
              <Button
                variant="destructive"
                disabled={pending || !!preview.blockedReason}
                onClick={() =>
                  start(async () => {
                    const result = await restoreContractAction(kind, id, preview.token)
                    if (!result.ok) {
                      setError(result.error)
                      setPreview(null)
                    } else if (result.data.pendingFiles) {
                      setPreview(null)
                      setError(
                        `Đã khôi phục; còn ${result.data.pendingFiles} tệp chưa xóa được. Đóng cửa sổ để thử lại trên danh sách.`,
                      )
                      router.refresh()
                    } else close()
                  })
                }
              >
                Xác nhận khôi phục
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
