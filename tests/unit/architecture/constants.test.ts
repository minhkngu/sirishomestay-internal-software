import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Quét file nguồn bằng regex để chặn việc viết lại giá trị đã có một nguồn.
const ROOT = process.cwd()

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const sources = walk(join(ROOT, 'src'))
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ path: relative(ROOT, f).split(sep).join('/'), text: readFileSync(f, 'utf8') }))

/** File nguồn có dòng khớp `re`. */
const filesMatching = (re: RegExp) => sources.filter((s) => re.test(s.text)).map((s) => s.path)
/** Số lần `re` (cờ g) khớp trong toàn bộ nguồn. */
const countMatches = (re: RegExp) => sources.reduce((n, s) => n + (s.text.match(re)?.length ?? 0), 0)

describe('hằng số chỉ có một nguồn', () => {
  it('giới hạn int4 chỉ nằm trong src/domain/money.ts', () => {
    expect(filesMatching(/2_?147_?483_?647/)).toEqual(['src/domain/money.ts'])
  })

  it("múi giờ 'Asia/Ho_Chi_Minh' chỉ nằm trong src/domain/dates.ts", () => {
    expect(filesMatching(/['"`]Asia\/Ho_Chi_Minh['"`]/)).toEqual(['src/domain/dates.ts'])
  })

  it("nhãn thu tiền cash: 'Tiền mặt' chỉ định nghĩa một lần", () => {
    expect(countMatches(/cash: 'Tiền mặt'/g)).toBe(1)
  })

  it('thứ hạng trạng thái ký (draft: 0) chỉ định nghĩa một lần', () => {
    expect(countMatches(/draft: 0\b/g)).toBe(1)
  })

  it("nhãn trạng thái ký ('Đã xuất', 'Chưa ký' gộp) chỉ nằm trong src/domain/sign-labels.ts", () => {
    // Khớp cả dạng map (`exported: 'Đã xuất'`) lẫn ternary (`=== 'exported' ? 'Đã xuất'`); thông báo "Đã xuất" sau khi xuất tệp không tính.
    expect(filesMatching(/exported'?\s*[:?]\s*'Đã xuất'/)).toEqual(['src/domain/sign-labels.ts'])
    expect(filesMatching(/\? 'Đã ký' : 'Chưa ký'/)).toEqual(['src/domain/sign-labels.ts'])
  })

  it('chữ tình trạng tài sản (Tốt, Trầy xước, Hư, Mất) chỉ nằm trong src/domain/asset-labels.ts', () => {
    // Chỉ khớp nguyên cả chuỗi trong dấu nháy; schema DB giữ giá trị mặc định cố ý (db chỉ import type từ domain).
    const literal = /(['"`])(Tốt|Trầy xước|Hư|Mất)\1/
    const allowed = (p: string) => p === 'src/domain/asset-labels.ts' || p.startsWith('src/db/schema/')
    expect(sources.filter((s) => !allowed(s.path) && literal.test(s.text)).map((s) => s.path)).toEqual([])
  })
})
