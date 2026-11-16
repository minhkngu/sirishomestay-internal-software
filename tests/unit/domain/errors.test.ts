import { describe, it, expect } from 'vitest'
import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { toActionResult } from '@/lib/action-result'

describe('toActionResult', () => {
  it('thành công → ok + data', async () => {
    expect(await toActionResult(async () => 5)).toEqual({ ok: true, data: 5 })
  })
  it('NotFoundError → "Không tìm thấy"', async () => {
    expect(await toActionResult(async () => { throw new NotFoundError() })).toEqual({ ok: false, error: 'Không tìm thấy' })
  })
  it('ForbiddenError giữ thông báo', async () => {
    const r = await toActionResult(async () => { throw new ForbiddenError() })
    expect(r).toMatchObject({ ok: false, error: 'Bạn không có quyền thực hiện thao tác này' })
  })
  it('ValidationError mang fieldErrors', async () => {
    const r = await toActionResult(async () => { throw new ValidationError('Sai', { phone: 'Trùng' }) })
    expect(r).toEqual({ ok: false, error: 'Sai', fieldErrors: { phone: 'Trùng' } })
  })
  it('lỗi lạ được ném tiếp', async () => {
    await expect(toActionResult(async () => { throw new Error('boom') })).rejects.toThrow('boom')
  })
})
