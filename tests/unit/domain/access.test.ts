import { describe, it, expect } from 'vitest'
import {
  can, assertCan, facilityScope, NotFoundError, ForbiddenError, PERMISSIONS, PERMISSION_LABELS,
  type AccessContext, type Permission,
} from '@/domain/access'

const A = 'facility-a'
const B = 'facility-b'

function ctx(perms: Permission[], facilities: string[]): AccessContext {
  return {
    userId: 'u1', email: 'u@x.com', fullName: 'U',
    permissions: new Set(perms), facilityIds: new Set(facilities), isAdmin: perms.includes('settings'),
  }
}

describe('access', () => {
  it('has a Vietnamese label for each permission', () => {
    for (const p of PERMISSIONS) expect(PERMISSION_LABELS[p]).toBeTruthy()
  })
  it('can: cần đúng nhóm quyền và đúng cơ sở', () => {
    const c = ctx(['meters'], [A])
    expect(can(c, 'meters', A)).toBe(true)
    expect(can(c, 'meters', B)).toBe(false)
    expect(can(c, 'billing', A)).toBe(false)
    expect(can(c, 'meters')).toBe(true)
  })
  it('admin (settings) thấy mọi thứ', () => {
    const c = ctx(['settings'], [])
    expect(can(c, 'billing', B)).toBe(true)
    expect(can(c, 'tenants_contracts', A)).toBe(true)
    expect(facilityScope(c)).toBe('all')
  })
  it('facilityScope trả danh sách cơ sở của người thường', () => {
    expect((facilityScope(ctx(['meters'], [A, B])) as string[]).sort()).toEqual([A, B])
  })
  it('assertCan: sai cơ sở → NotFoundError, thiếu quyền → ForbiddenError', () => {
    const c = ctx(['meters'], [A])
    expect(() => assertCan(c, 'meters', B)).toThrow(NotFoundError)
    expect(() => assertCan(c, 'billing', A)).toThrow(ForbiddenError)
    expect(() => assertCan(c, 'meters', A)).not.toThrow()
  })
  it('assertCan: cơ sở ngoài phạm vi và thiếu quyền → NotFoundError (không lộ sự tồn tại)', () => {
    expect(() => assertCan(ctx(['meters'], [A]), 'billing', B)).toThrow(NotFoundError)
  })
})
