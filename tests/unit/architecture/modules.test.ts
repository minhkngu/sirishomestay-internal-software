import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MODULE_TIERS, buildImportGraph, moduleViolations } from './import-graph'

const ROOT = process.cwd()
const FIXTURE = join(ROOT, 'tests/fixtures/import-graph/src')
const SRC = join(ROOT, 'src')

describe('đồ thị import', () => {
  const graph = buildImportGraph(FIXTURE)
  const edges = (file: string) => [...(graph.get(file) ?? [])].sort()

  it('có mọi file .ts/.tsx làm khoá', () => {
    expect(graph.has('src/lib/util.ts')).toBe(true)
    expect(graph.has('src/modules/leasing/ui/view.tsx')).toBe(true)
  })

  it('tính import nhiều dòng, export … from tương đối (tới index.ts) và import động', () => {
    expect(edges('src/modules/leasing/server/service.ts')).toEqual([
      'src/modules/assets/server/register.ts',
      'src/modules/users/index.ts',
      'src/modules/users/server/service.ts',
    ])
  })

  it('bỏ import type, giữ import giá trị', () => {
    expect(edges('src/modules/users/server/service.ts')).toEqual(['src/modules/assets/index.ts'])
    expect(edges('src/modules/leasing/ui/view.tsx')).toEqual(['src/modules/users/index.ts'])
  })

  it('tính import side-effect', () => {
    expect(edges('src/modules/leasing/actions.ts')).toEqual([
      'src/modules/leasing/server/service.ts',
      'src/modules/registrations.ts',
    ])
  })
})

describe('vi phạm ranh giới module', () => {
  it('fixture: báo đúng từng lý do', () => {
    expect(moduleViolations(buildImportGraph(FIXTURE)).sort()).toEqual([
      'src/lib/util.ts -> src/modules/users/index.ts: dùng chung import module',
      'src/modules/leasing/actions.ts -> src/modules/registrations.ts: không qua cổng công khai',
      'src/modules/leasing/server/service.ts -> src/modules/assets/server/register.ts: không qua cổng công khai',
      'src/modules/leasing/server/service.ts -> src/modules/users/server/service.ts: không qua cổng công khai',
      'src/modules/leasing/ui/view.tsx -> src/modules/users/index.ts: không qua cổng công khai',
      'src/modules/users/server/service.ts -> src/modules/assets/index.ts: tầng không thấp hơn',
      'src/server/legacy/actions.ts -> src/modules/users/server/service.ts: không qua cổng công khai',
      'src/server/legacy/service.ts -> src/modules/registrations.ts: không qua cổng công khai',
    ])
  })

  it('src thật: không có vi phạm', () => {
    const graph = buildImportGraph(SRC)
    // Kiểm helper thật sự quét được src: layout (app) import registrations.
    expect(graph.get('src/app/(app)/layout.tsx')?.has('src/modules/registrations.ts')).toBe(true)
    expect(moduleViolations(graph)).toEqual([])
  })

  it('mọi thư mục trong src/modules có trong MODULE_TIERS', () => {
    const dir = join(SRC, 'modules')
    const names = existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()) : []
    expect(names.filter((n) => !(n in MODULE_TIERS))).toEqual([])
  })
})

describe('MODULE_TIERS', () => {
  it('khớp thứ tự tầng đã chốt', () => {
    expect(MODULE_TIERS).toEqual({
      platform: 1,
      users: 2,
      tenants: 2,
      facilities: 2,
      documents: 2,
      assets: 3,
      meters: 3,
      leasing: 4,
      import: 5,
      dashboard: 5,
      cashbook: 5,
    })
  })

  it('cùng một bản với eslint.config.mjs', async () => {
    const eslintConfig = await import('../../../eslint.config.mjs')
    expect(eslintConfig.MODULE_TIERS).toBe(MODULE_TIERS)
  })
})
