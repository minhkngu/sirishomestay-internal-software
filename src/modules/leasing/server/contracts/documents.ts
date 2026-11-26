import { eq } from 'drizzle-orm'
import { handovers, leases } from '@/db'
import type { DB } from '@/db/client'
import type { AccessContext } from '@/domain/access'
import { NotFoundError } from '@/domain/errors'
import type { StorageAdapter } from '@/modules/platform'
import { exportDocument } from '@/modules/documents'

type Job = {
  label: string
  docType: 'lease' | 'handover_check_in' | 'handover_check_out'
  entityId: string
  templateId?: string
}

/**
 * Tạo lại bản PDF của hợp đồng và của từng biên bản bàn giao rồi lưu vào "Văn bản đã lưu".
 * Bản tự tạo lần trước bị thay bằng bản mới; bản người dùng tự xuất (Word, PDF) được giữ nguyên.
 * Một bản lỗi (thiếu mẫu, dịch vụ chuyển PDF không chạy) không chặn các bản khác; lỗi trả về trong `warnings`.
 */
export async function syncContractDocuments(
  db: DB,
  ctx: AccessContext,
  storage: StorageAdapter,
  leaseId: string,
): Promise<{ warnings: string[] }> {
  const [lease] = await db.select({ templateId: leases.contractTemplateId }).from(leases).where(eq(leases.id, leaseId))
  if (!lease) throw new NotFoundError()
  const hands = await db
    .select({ id: handovers.id, kind: handovers.kind })
    .from(handovers)
    .where(eq(handovers.leaseId, leaseId))
  const jobs: Job[] = [
    { label: 'hợp đồng', docType: 'lease', entityId: leaseId, templateId: lease.templateId ?? undefined },
    ...hands.map((h): Job => ({
      label: h.kind === 'check_in' ? 'biên bản check-in' : 'biên bản check-out',
      docType: h.kind === 'check_in' ? 'handover_check_in' : 'handover_check_out',
      entityId: h.id,
    })),
  ]
  const warnings: string[] = []
  for (const job of jobs) {
    try {
      await exportDocument(db, ctx, storage, {
        docType: job.docType,
        entityId: job.entityId,
        templateId: job.templateId,
        format: 'pdf',
        auto: true,
      })
    } catch (e) {
      warnings.push(`Chưa tạo được bản PDF của ${job.label}: ${e instanceof Error ? e.message : 'lỗi không xác định'}`)
    }
  }
  return { warnings }
}
