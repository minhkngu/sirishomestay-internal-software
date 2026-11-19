import { and, eq, sql } from 'drizzle-orm'
import { files, handovers, leases } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { NotFoundError } from '@/domain/errors'
import { deleteFile } from '@/server/files/service'
import type { StorageAdapter } from '@/server/storage/types'
import { exportDocument } from '@/server/templates/service'

type Job = { label: string; docType: 'lease' | 'handover_check_in' | 'handover_check_out'; entityId: string; templateId?: string }

/**
 * Tạo lại bản PDF của hợp đồng và của từng biên bản bàn giao rồi lưu vào "Văn bản đã lưu".
 * Bản tự tạo lần trước bị thay bằng bản mới; bản người dùng tự xuất (Word, PDF) được giữ nguyên.
 * Một bản lỗi (thiếu mẫu, dịch vụ chuyển PDF không chạy) không chặn các bản khác; lỗi trả về trong `warnings`.
 */
export async function syncContractDocuments(db: DB, ctx: AccessContext, storage: StorageAdapter, leaseId: string): Promise<{ warnings: string[] }> {
  const [lease] = await db.select({ templateId: leases.contractTemplateId }).from(leases).where(eq(leases.id, leaseId))
  if (!lease) throw new NotFoundError()
  const hands = await db.select({ id: handovers.id, kind: handovers.kind }).from(handovers).where(eq(handovers.leaseId, leaseId))
  const jobs: Job[] = [
    { label: 'hợp đồng', docType: 'lease', entityId: leaseId, templateId: lease.templateId ?? undefined },
    ...hands.map((h): Job => ({ label: h.kind === 'check_in' ? 'biên bản check-in' : 'biên bản check-out', docType: h.kind === 'check_in' ? 'handover_check_in' : 'handover_check_out', entityId: h.id })),
  ]
  const warnings: string[] = []
  for (const job of jobs) {
    try {
      const old = await db.select({ id: files.id }).from(files).where(and(eq(files.ownerType, 'export'), eq(files.ownerId, job.entityId), sql`${files.meta}->>'auto' = 'true'`))
      await exportDocument(db, ctx, storage, { docType: job.docType, entityId: job.entityId, templateId: job.templateId, format: 'pdf', auto: true })
      for (const f of old) await deleteFile(db, ctx, storage, f.id)
    } catch (e) {
      warnings.push(`Chưa tạo được bản PDF của ${job.label}: ${e instanceof Error ? e.message : 'lỗi không xác định'}`)
    }
  }
  return { warnings }
}
