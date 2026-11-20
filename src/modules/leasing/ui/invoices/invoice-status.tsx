import { Badge } from '@/components/ui/badge'
import { INVOICE_STATUS_LABELS, type InvoiceState } from '../../domain/labels'

export const invoiceStatusLabel = (state: string) => INVOICE_STATUS_LABELS[state as InvoiceState] ?? state
export function InvoiceStatus({ state }: { state: string }) {
  const bad = state === 'overdue'
  return (
    <Badge variant={bad ? 'destructive' : state === 'paid' || state === 'refunded' ? 'secondary' : 'outline'}>
      {invoiceStatusLabel(state)}
    </Badge>
  )
}
