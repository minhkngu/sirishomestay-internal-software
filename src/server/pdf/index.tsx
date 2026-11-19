import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { buildVietQrPayload, toQrAddInfo } from '@/domain/vietqr'
import { InvoiceDocument } from './invoice-pdf'
import { ReceiptDocument } from './receipt-pdf'
import type { InvoicePdfData, ReceiptPdfData } from './types'
import { formatDateVN } from '@/domain/dates'
import { renderTemplate, type TemplateStyle } from '@/domain/doc-template'
import { buildTemplateData, type DocEntities } from '@/domain/template-fields'
import { renderTemplatePdf } from './template-pdf'
import { defaultInvoiceTemplate, type InvoiceTemplateConfig } from '@/domain/invoice-template'
/** Hoá đơn dựng từ mẫu HTML soạn trong app (cùng bộ dựng với hợp đồng), có mã QR thanh toán nếu còn tiền phải trả. */
export async function renderInvoiceFromTemplate(
  data: InvoicePdfData,
  html: { body: string; style: TemplateStyle },
  options: { sample?: boolean } = {},
): Promise<Uint8Array> {
  const qr = await invoiceQr(data, options.sample)
  const t = data.tenant
  const entities: DocEntities = {
    tenant: {
      kind: t.kind ?? 'vietnamese',
      fullName: t.kind === 'company' ? null : t.name,
      companyName: t.kind === 'company' ? t.name : null,
      idDocument: t.idDocument,
      taxCode: t.taxCode,
      phone: t.phone,
      email: t.email,
    },
    facility: data.facility,
    room: { code: data.room },
    invoice: {
      code: data.code,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      dueDate: data.dueDate,
      paid: data.paid,
      bank: data.bank,
      lines: data.lines,
    },
  }
  const { doc } = renderTemplate(html.body, {
    ...buildTemplateData(data.kind === 'termination' ? 'invoice_termination' : 'invoice_monthly', entities),
    ngay_lap: formatDateVN(data.issueDate),
  })
  return renderTemplatePdf(doc, html.style, { qr })
}
async function invoiceQr(data: InvoicePdfData, sample?: boolean) {
  const remaining = data.total - data.paid
  return data.bank && data.total >= 0 && remaining > 0
    ? await QRCode.toDataURL(
        sample
          ? 'DU LIEU MAU - KHONG THANH TOAN'
          : buildVietQrPayload({
              bankBin: data.bank.bankBin,
              accountNumber: data.bank.accountNumber,
              amount: remaining,
              addInfo: toQrAddInfo(data.code),
            }),
        { errorCorrectionLevel: 'M', margin: 1, width: 360 },
      )
    : null
}
export async function renderInvoicePdf(
  data: InvoicePdfData,
  template: InvoiceTemplateConfig = defaultInvoiceTemplate,
  options: { sample?: boolean } = {},
): Promise<Uint8Array> {
  const remaining = data.total - data.paid
  const qr =
    data.bank && data.total >= 0 && remaining > 0
      ? await QRCode.toDataURL(
          options.sample
            ? 'DU LIEU MAU - KHONG THANH TOAN'
            : buildVietQrPayload({
                bankBin: data.bank.bankBin,
                accountNumber: data.bank.accountNumber,
                amount: remaining,
                addInfo: toQrAddInfo(data.code),
              }),
          { errorCorrectionLevel: 'M', margin: 1, width: 360 },
        )
      : null
  return renderToBuffer(<InvoiceDocument data={data} qr={qr} template={template} sample={options.sample} />)
}
export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array> {
  return renderToBuffer(<ReceiptDocument data={data} />)
}
