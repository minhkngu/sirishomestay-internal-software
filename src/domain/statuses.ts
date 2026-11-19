// Các tập giá trị trạng thái dùng chung: schema `db` và các module `server` cùng dựa vào đây.
export type LeaseStatus = 'active' | 'ended'
export type DepositContractStatus = 'pending' | 'converted' | 'cancelled'
export type CancelOutcome = 'forfeit' | 'refund'
export type SignStatus = 'draft' | 'exported' | 'signed'
export type DepositEntryType = 'collect' | 'topup' | 'deduct' | 'refund' | 'forfeit'
export type DepositEntryStatus = 'pending' | 'done'
export type AssetStatus = 'in_use' | 'broken' | 'disposed'
export type IncidentStatus = 'new' | 'in_progress' | 'done' | 'cancelled'
export type HandoverKind = 'check_in' | 'check_out'
// Cột `invoices.status` chỉ ghi draft/approved; unpaid/partial/overdue/paid là trạng thái suy ra khi đọc.
export type InvoiceStatus = 'draft' | 'approved'
