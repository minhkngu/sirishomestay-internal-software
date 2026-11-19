import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Kiểm tra bằng regex đơn giản (không parse AST): "lời gọi cấp module" là dòng bắt đầu bằng
// `register…(` với thụt lề tối đa 2 ký tự, nằm ngoài định nghĩa `function register…`.
// Lời gọi trong vòng lặp/hàm (thụt lề sâu hơn) vẫn được tính vì dòng `for`/`function` mở ở cấp module.
const ROOT = process.cwd()
const REGISTER_CALL = /^ {0,2}register(OwnerResolver|ExportOwnerResolver|DocLoader|PdfLoader)\(/
const REGISTER_CALL_IN_BLOCK = /^\s+register(OwnerResolver|ExportOwnerResolver|DocLoader|PdfLoader)\(/

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const rel = (p: string) => relative(ROOT, p).split(sep).join('/')
const read = (p: string) => readFileSync(p, 'utf8')

/** File có lời gọi register* ở cấp module, hoặc trong khối cấp module (for/if) — loại trừ phần định nghĩa. */
function registeringFiles(): string[] {
  const files = [...walk(join(ROOT, 'src/server')), ...walk(join(ROOT, 'src/modules'))].filter((f) => /\.tsx?$/.test(f))
  return files.filter((f) => {
    const lines = read(f).split('\n')
    let inDefinition = false
    for (const line of lines) {
      if (/^(export )?(async )?function register/.test(line)) inDefinition = true
      else if (/^\}/.test(line)) inDefinition = false
      if (inDefinition) continue
      if (REGISTER_CALL.test(line) || REGISTER_CALL_IN_BLOCK.test(line)) return true
    }
    return false
  })
}

function registrationsFile(): string {
  return 'src/modules/registrations.ts'
}

const importsOf = (src: string) => [...src.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
const registrationsSpecifier = /^(@\/modules\/registrations|(\.\.?\/)+registrations)$/

describe('đăng ký resolver và loader', () => {
  it('có file registrations', () => {
    expect(existsSync(join(ROOT, registrationsFile()))).toBe(true)
  })

  it('mọi file gọi register* ở cấp module đều được import trong registrations', () => {
    const reg = registrationsFile()
    const imported = importsOf(read(join(ROOT, reg)))
    const missing = registeringFiles().filter((f) => {
      const noExt = rel(f).replace(/\.tsx?$/, '')
      const alias = '@/' + noExt.replace(/^src\//, '')
      return !imported.includes(alias)
    })
    expect(registeringFiles().length).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })

  it('mọi actions.ts import registrations', () => {
    const bad = [...walk(join(ROOT, 'src/server')), ...walk(join(ROOT, 'src/modules'))]
      .filter((f) => /(\\|\/)actions\.ts$/.test(f))
      .filter((f) => !importsOf(read(f)).some((s) => registrationsSpecifier.test(s)))
      .map(rel)
    expect(bad).toEqual([])
  })

  it('mọi API route.ts import registrations', () => {
    const routes = walk(join(ROOT, 'src/app/api')).filter((f) => /(\\|\/)route\.ts$/.test(f))
    expect(routes.length).toBeGreaterThan(0)
    const bad = routes.filter((f) => !importsOf(read(f)).some((s) => registrationsSpecifier.test(s))).map(rel)
    expect(bad).toEqual([])
  })

  it('layout (app) import registrations', () => {
    const layout = read(join(ROOT, 'src/app/(app)/layout.tsx'))
    expect(importsOf(layout).some((s) => registrationsSpecifier.test(s))).toBe(true)
  })

  it('templates/service.ts không nạp invoices bằng import động', () => {
    expect(read(join(ROOT, 'src/server/templates/service.ts'))).not.toContain("import('@/server/invoices")
  })

  describe('ranh giới tầng giữa các module', () => {
    const filesIn = (dir: string) => walk(join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f))
    const offenders = (dir: string, pattern: RegExp) =>
      filesIn(dir)
        .filter((f) => pattern.test(read(f)))
        .map(rel)

    it('src/server/rooms không import @/server/invoices', () => {
      expect(offenders('src/server/rooms', /@\/server\/invoices/)).toEqual([])
    })

    it('src/server/assets không import @/server/incidents', () => {
      expect(offenders('src/server/assets', /@\/server\/incidents/)).toEqual([])
    })

    it('src/server/invoice-templates không ghi bảng invoices, leases', () => {
      expect(offenders('src/server/invoice-templates', /\.update\((invoices|leases)\b/)).toEqual([])
    })

    it('src/server/invoice-templates không import @/server/invoices', () => {
      expect(offenders('src/server/invoice-templates', /@\/server\/invoices/)).toEqual([])
    })
  })
})
