import type { BankAccount } from '@/domain/types'
export type InvoicePdfData = {
  kind: 'monthly' | 'termination'
  code: string; issueDate: string; periodStart: string; periodEnd: string; dueDate: string | null
  facility: { name: string; address: string }; room: string
  tenant: { name: string; phone: string | null }
  lines: { description: string; quantity: number; unitLabel: string; unitPrice: number; amount: number }[]
  total: number; paid: number; bank: BankAccount | null
}
export type ReceiptPdfData = {
  code: string; invoiceCode: string; paidOn: string; amount: number; method: string; receivedBy: string
  facility: { name: string; address: string }; room: string; tenant: { name: string; phone: string | null }
}
