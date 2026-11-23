import { Badge } from '@/components/ui/badge'

const LABEL: Record<string, string> = {
  draft: 'Nháp',
  unpaid: 'Chưa thu',
  partial: 'Thu một phần',
  paid: 'Đã thu đủ',
  overdue: 'Quá hạn',
  refund_pending: 'Chờ hoàn khách',
  refunded: 'Đã hoàn',
}
export const invoiceStatusLabel = (state: string) => LABEL[state] ?? state
export function InvoiceStatus({ state }: { state: string }) {
  const bad = state === 'overdue'
  return (
    <Badge variant={bad ? 'destructive' : state === 'paid' || state === 'refunded' ? 'secondary' : 'outline'}>
      {invoiceStatusLabel(state)}
    </Badge>
  )
}
