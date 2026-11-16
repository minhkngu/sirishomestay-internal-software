import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { db } from '@/db/client'
import { NotFoundError } from '@/domain/errors'
import { depositBalance } from '@/domain/deposit'
import { formatDateVN } from '@/domain/dates'
import { formatVND } from '@/domain/money'
import { getAccessContext } from '@/server/session'
import { listFiles } from '@/server/files/service'
import { listTemplates } from '@/server/templates/service'
import { listHandovers } from '@/server/handovers/service'
import { StartHandoverButtons } from '@/features/handovers/components/start-handover-buttons'
import { getDepositContract, getLease } from '@/server/contracts/service'
import { ExportMenu } from '@/features/contracts/components/export-menu'
import { SignStatus } from '@/features/contracts/components/sign-status'

const ENTRY: Record<string, string> = { collect: 'Thu cọc', topup: 'Thu cọc bổ sung', deduct: 'Khấu trừ', refund: 'Hoàn cọc', forfeit: 'Mất cọc' }

type Entry = { id: string; date: string; type: string; amount: number; status: string }

function runningBalances(entries: Entry[]): number[] {
  const out: number[] = []
  let run = 0
  for (const e of entries) {
    if (e.status === 'done') run += e.type === 'collect' || e.type === 'topup' ? e.amount : -e.amount
    out.push(run)
  }
  return out
}

function Ledger({ entries }: { entries: Entry[] }) {
  const done = runningBalances(entries)
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Ngày</th><th className="p-2">Loại</th><th className="p-2">Số tiền</th><th className="p-2">Trạng thái</th><th className="p-2">Số dư luỹ kế</th></tr></thead>
          <tbody>
            {entries.map((e, i) => <tr key={e.id} className="border-t"><td className="p-2">{formatDateVN(e.date)}</td><td className="p-2">{ENTRY[e.type]}</td><td className="p-2">{formatVND(e.amount)}</td><td className="p-2">{e.status === 'done' ? 'Đã xong' : 'Chờ'}</td><td className="p-2">{formatVND(done[i])}</td></tr>)}
            {entries.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Chưa có dòng nào</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-sm">Số dư cọc: <strong>{formatVND(depositBalance(entries.map((e) => ({ id: e.id, date: e.date, type: e.type as 'collect', amount: e.amount, status: e.status as 'done' }))))}</strong></p>
    </div>
  )
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  let lease: Awaited<ReturnType<typeof getLease>> | null = null
  try { lease = await getLease(db, ctx, id) } catch (e) { if (!(e instanceof NotFoundError)) throw e }

  if (!lease) {
    let deposit
    try { deposit = await getDepositContract(db, ctx, id) } catch (e) { if (e instanceof NotFoundError) notFound(); throw e }
    const templates = (await listTemplates(db, ctx, 'deposit_contract')).filter((t) => t.fileId)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Hợp đồng cọc — phòng {deposit.roomCode}</h1>
        <dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Bên thuê</dt><dd>{deposit.tenantName}</dd>
          <dt className="text-muted-foreground">Tiền cọc</dt><dd>{formatVND(deposit.depositAmount)}</dd>
          <dt className="text-muted-foreground">Giá thuê thoả thuận</dt><dd>{formatVND(deposit.agreedRent)}</dd>
          <dt className="text-muted-foreground">Vào ở dự kiến</dt><dd>{formatDateVN(deposit.expectedMoveIn)}</dd>
          <dt className="text-muted-foreground">Trạng thái</dt><dd>{{ pending: 'Đang chờ', converted: 'Đã chuyển thành hợp đồng thuê', cancelled: 'Đã huỷ' }[deposit.status]}</dd>
        </dl>
        {deposit.status === 'pending' && <Link href={`/contracts/new?deposit=${deposit.id}`} className={buttonVariants()}>Chuyển thành hợp đồng thuê</Link>}
        <SignStatus kind="deposit" id={deposit.id} status={deposit.signStatus as 'draft'} signedFileId={deposit.signedFileId} />
        <ExportMenu kind="deposit" id={deposit.id} templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))} />
        <h2 className="font-medium">Sổ cọc</h2><Ledger entries={deposit.entries} />
      </div>
    )
  }

  const handoverList = await listHandovers(db, ctx, lease.id)
  const [templates, exports] = await Promise.all([
    listTemplates(db, ctx, 'lease').then((t) => t.filter((x) => x.fileId)),
    listFiles(db, ctx, 'export', lease.id),
  ])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{lease.code}</h1>
        <p className="text-sm text-muted-foreground">Phòng {lease.roomCode} · {lease.tenantName} · {lease.status === 'active' ? 'Đang hiệu lực' : 'Đã kết thúc'}</p>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Tổng quan</TabsTrigger><TabsTrigger value="addenda">Phụ lục</TabsTrigger><TabsTrigger value="handover">Bàn giao</TabsTrigger>
          <TabsTrigger value="invoices">Hoá đơn</TabsTrigger><TabsTrigger value="deposit">Sổ cọc</TabsTrigger><TabsTrigger value="docs">Giấy tờ</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <dl className="grid max-w-lg grid-cols-2 gap-2 py-3 text-sm">
            <dt className="text-muted-foreground">Thời hạn</dt><dd>{formatDateVN(lease.startDate)} – {formatDateVN(lease.endDate)}</dd>
            <dt className="text-muted-foreground">Giá thuê</dt><dd>{formatVND(lease.monthlyRent)} /tháng</dd>
            <dt className="text-muted-foreground">Tiền cọc</dt><dd>{formatVND(lease.depositAmount)}</dd>
            <dt className="text-muted-foreground">Số người ở</dt><dd>{lease.occupantCount}</dd>
            <dt className="text-muted-foreground">Phí dịch vụ</dt><dd>{lease.fees.map((f) => `${f.name} ${formatVND(f.unitPrice)}`).join(', ') || '—'}</dd>
          </dl>
        </TabsContent>
        <TabsContent value="addenda"><p className="py-3 text-sm text-muted-foreground">Phụ lục gia hạn, chuyển phòng, thanh lý sẽ có ở bước sau.</p></TabsContent>
        <TabsContent value="handover">
          <div className="space-y-3 py-3">
            <StartHandoverButtons leaseId={lease.id} />
            <ul className="space-y-1 text-sm">{handoverList.map((h) => <li key={h.id}><Link className="underline" href={`/handovers/${h.id}`}>{h.kind === 'check_in' ? 'Check-in' : 'Check-out'} {formatDateVN(h.date)}</Link> — {h.status === 'done' ? 'Đã hoàn tất' : 'Nháp'}</li>)}
              {handoverList.length === 0 && <li className="text-muted-foreground">Chưa có biên bản nào.</li>}</ul>
          </div>
        </TabsContent>
        <TabsContent value="invoices"><p className="py-3 text-sm text-muted-foreground">Hoá đơn sẽ có ở bước sau.</p></TabsContent>
        <TabsContent value="deposit"><div className="py-3"><Ledger entries={lease.depositEntries} /></div></TabsContent>
        <TabsContent value="docs">
          <div className="space-y-3 py-3">
            <SignStatus kind="lease" id={lease.id} status={lease.signStatus as 'draft'} signedFileId={lease.signedFileId} />
            <ExportMenu kind="lease" id={lease.id} templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))} />
            {exports.length > 0 && <ul className="space-y-1 text-sm">{exports.map((f) => <li key={f.id}><a className="underline" href={`/api/files/${f.id}`}>{f.name}</a></li>)}</ul>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
