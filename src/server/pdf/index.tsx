import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { buildVietQrPayload, toQrAddInfo } from '@/domain/vietqr'
import { InvoiceDocument } from './invoice-pdf'
import { ReceiptDocument } from './receipt-pdf'
import type { InvoicePdfData, ReceiptPdfData } from './types'
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const remaining = data.total - data.paid
  const qr = data.bank && data.total >= 0 && remaining > 0 ? await QRCode.toDataURL(buildVietQrPayload({ bankBin: data.bank.bankBin, accountNumber: data.bank.accountNumber, amount: remaining, addInfo: toQrAddInfo(data.code) }), { errorCorrectionLevel: 'M', margin: 1, width: 360 }) : null
  return renderToBuffer(<InvoiceDocument data={data} qr={qr} />)
}
export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array> {
  return renderToBuffer(<ReceiptDocument data={data} />)
}
