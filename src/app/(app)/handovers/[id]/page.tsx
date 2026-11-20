import { RequirePermission, getAccessContext } from '@/modules/platform'
import { db } from '@/db/client'
import { formatDateVN } from '@/domain/dates'
import { orNotFound } from '@/lib/or-not-found'
import { getHandover, listHandovers } from '@/modules/leasing'
import { isUsableTemplate, listTemplates } from '@/modules/documents'
import { HandoverForm } from '@/modules/leasing/ui'

export default async function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <RequirePermission perm="tenants_contracts">
      <Handover params={params} />
    </RequirePermission>
  )
}

async function Handover({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getAccessContext()
  const h = await orNotFound(getHandover(db, ctx, id))
  const kindLabel = h.kind === 'check_in' ? 'check-in' : 'check-out'
  const checkInConditions: Record<string, string> = {}
  if (h.kind === 'check_out') {
    const all = await listHandovers(db, ctx, h.leaseId)
    const ci = all.find((x) => x.kind === 'check_in')
    if (ci) for (const i of (await getHandover(db, ctx, ci.id)).items) checkInConditions[i.assetCode] = i.condition
  }
  const templates = (
    await listTemplates(db, ctx, h.kind === 'check_in' ? 'handover_check_in' : 'handover_check_out')
  ).filter(isUsableTemplate)
  const readByMeter = new Map(h.readings.map((r) => [r.meterId, r.value]))
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          Biên bản {kindLabel} — phòng {h.roomCode}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ngày {formatDateVN(h.date)} · {h.status === 'done' ? 'Đã hoàn tất' : 'Nháp'}
        </p>
      </div>
      <HandoverForm
        id={h.id}
        kind={h.kind as 'check_in'}
        readOnly={h.status === 'done'}
        hasTemplate={templates.length > 0}
        checkInConditions={checkInConditions}
        meters={h.meters.map((m) => ({ ...m, value: readByMeter.get(m.meterId) ?? null }))}
        items={h.items.map((i) => ({
          id: i.id,
          assetCode: i.assetCode,
          assetName: i.assetName,
          assetValue: i.assetValue,
          condition: i.condition,
          note: i.note,
          damaged: i.damaged,
          missing: i.missing,
          penalty: i.penalty,
          photoIds: i.photoIds,
        }))}
      />
    </div>
  )
}
