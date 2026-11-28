// Cổng phía server của module leasing: chỉ những gì nơi ngoài module đang dùng.
export { INVOICE_STATUS_LABELS, WALLET_ENTRY_LABELS } from './domain/labels'
export type { WalletEntryView } from './domain/wallet'
export { listAddenda } from './server/addenda/service'
export { referenceChanges } from './domain/extension-reference'
export { listOneOffs } from './server/charges/service'
export {
  getDepositContract,
  getLease,
  getPendingDepositContract,
  listDepositContracts,
  listLeaseOccupants,
  listLeases,
  nextLeaseCode,
} from './server/contracts/service'
export type { DepositListItem, LeaseListItem } from './server/contracts/service'
export { getRoomDetail, listRoomsWithStatus } from './server/contracts/room-view'
export { getHandover, listHandovers } from './server/handovers/service'
export { getIncident, incidentsForAsset, listAssignees, listIncidents } from './server/incidents/service'
export {
  getInvoiceDetail,
  listInvoices,
  nextInvoiceCode,
  previewNewInvoice,
  leaseWalletBalance,
  previewPaymentRemoval,
  removePayment,
  tenantBalance,
  updatePayment,
} from './server/invoices/service'
export { computeDueDate } from './domain/due-date'
export {
  addWalletEntry,
  type PaymentRemoval,
  settleRemovedPayments,
  listWalletCashEntries,
  listWalletEntries,
  listWalletView,
  walletBalance,
} from './server/wallet/service'
