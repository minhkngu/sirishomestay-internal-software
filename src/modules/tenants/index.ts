// Cổng phía server của module tenants: chỉ những gì nơi ngoài module đang dùng.
export {
  searchTenants,
  getTenant,
  displayName,
  findDuplicateField,
  toTenantRow,
  type Tenant,
} from './server/tenants/service'
export { tenantInput, type TenantInput } from './server/tenants/schemas'
