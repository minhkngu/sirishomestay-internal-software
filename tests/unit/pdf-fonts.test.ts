import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

const root = process.cwd()
const fontsSource = path.join(root, 'src/server/pdf/fonts.ts')

// Lấy các đường dẫn font viết cứng dạng 'src/.../x.ttf' trong fonts.ts
function fontPaths(): string[] {
  const source = readFileSync(fontsSource, 'utf8')
  return [...new Set([...source.matchAll(/'(src\/[^']+\.ttf)'/g)].map((m) => m[1]))]
}

// Chỉ hỗ trợ dạng `thư-mục/*.ttf` (đủ cho cấu hình hiện tại)
function matchesGlob(file: string, glob: string): boolean {
  const g = glob.replace(/^\.\//, '')
  const m = g.match(/^(.+)\/\*\.ttf$/)
  if (!m) return false
  return path.posix.dirname(file) === m[1] && file.endsWith('.ttf')
}

describe('phông PDF', () => {
  it('có đường dẫn font trong fonts.ts', () => {
    expect(fontPaths().length).toBeGreaterThan(0)
  })
  it('mọi font tồn tại trên đĩa', () => {
    for (const p of fontPaths()) expect(existsSync(path.join(root, p)), p).toBe(true)
  })
  it('mọi font khớp một glob trong outputFileTracingIncludes', () => {
    const globs = nextConfig.outputFileTracingIncludes?.['/*'] ?? []
    for (const p of fontPaths()) {
      expect(
        globs.some((g) => matchesGlob(p, g)),
        `${p} không khớp glob nào trong next.config.ts`,
      ).toBe(true)
    }
  })
  it('glob khớp ít nhất một tệp thật', () => {
    const globs = (nextConfig.outputFileTracingIncludes?.['/*'] ?? []).filter((g) => g.endsWith('.ttf'))
    for (const g of globs) {
      const dir = path.join(root, g.replace(/^\.\//, '').replace(/\/\*\.ttf$/, ''))
      expect(existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.ttf')), g).toBe(true)
    }
  })
})
