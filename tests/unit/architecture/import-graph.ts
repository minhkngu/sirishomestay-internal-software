import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { MODULE_TIERS } from '../../../eslint.config.mjs'

// Nguồn duy nhất của thứ tự tầng là eslint.config.mjs; test dùng lại để hai nơi không lệch nhau.
export { MODULE_TIERS }

/** Cổng công khai của module: phía server, server action, component. */
const ENTRIES = ['index.ts', 'actions.ts', 'ui.ts']
const REGISTRATIONS = 'src/modules/registrations.ts'
const PROXY = 'src/proxy.ts'

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function resolveFile(base: string): string | null {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
  return candidates.find((p) => existsSync(p) && statSync(p).isFile()) ?? null
}

// Phân tích bằng regex (không parse AST). Phần giữa `import`/`export` và `from` chỉ gồm tên, `*`, `{}`, `,`
// nên không bắt nhầm qua câu lệnh khác; import nhiều dòng vẫn khớp. Bỏ chú thích khối và dòng chỉ có chú thích.
const STATIC = /\b(?:import|export)\s+(type\s+)?([\w$*{},\s]*?)\s*from\s*['"]([^'"]+)['"]/g
const SIDE_EFFECT = /\bimport\s*['"]([^'"]+)['"]/g
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/** Câu lệnh đầu file (bỏ chú thích và dòng trống) là `'use client'`. */
const isClientComponent = (code: string) => /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(['"])use client\1/.test(code)

/** File `'use client'` của từng đồ thị, để `moduleViolations` biết mà không đổi kiểu trả về của `buildImportGraph`. */
const clientFiles = new WeakMap<Map<string, Set<string>>, Set<string>>()

function specifiers(code: string): string[] {
  const src = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out: string[] = []
  for (const m of src.matchAll(STATIC)) if (!m[1]) out.push(m[3])
  for (const m of src.matchAll(SIDE_EFFECT)) out.push(m[1])
  for (const m of src.matchAll(DYNAMIC)) out.push(m[1])
  return out
}

/**
 * Đồ thị import của thư mục `srcDir` (ứng với `src/`): khoá và đích là đường dẫn dạng `src/...`.
 * Tính `import … from`, `export … from`, `import '…'`, `import('…')`; bỏ `import type`/`export type`.
 * Chỉ giữ đích là file trong dự án (`@/` → `srcDir`, đường dẫn tương đối); bỏ package ngoài.
 */
export function buildImportGraph(srcDir: string): Map<string, Set<string>> {
  const root = dirname(resolve(srcDir))
  const key = (p: string) => relative(root, p).split(sep).join('/')
  const graph = new Map<string, Set<string>>()
  const clients = new Set<string>()
  for (const file of walk(resolve(srcDir)).filter((f) => /\.tsx?$/.test(f))) {
    const targets = new Set<string>()
    const code = readFileSync(file, 'utf8')
    for (const spec of specifiers(code)) {
      const base = spec.startsWith('@/')
        ? join(resolve(srcDir), spec.slice(2))
        : spec.startsWith('.')
          ? resolve(dirname(file), spec)
          : null
      const target = base && resolveFile(base)
      if (target) targets.add(key(target))
    }
    graph.set(key(file), targets)
    if (isClientComponent(code)) clients.add(key(file))
  }
  clientFiles.set(graph, clients)
  return graph
}

type Place =
  | { kind: 'module'; name: string; part: 'domain' | 'server' | 'ui' | 'root'; rest: string }
  | { kind: 'registrations' }
  | { kind: 'shared' }
  | { kind: 'app' }
  | { kind: 'proxy' }
  | { kind: 'other' }

function place(file: string): Place {
  if (file === REGISTRATIONS) return { kind: 'registrations' }
  if (file === PROXY) return { kind: 'proxy' }
  const mod = /^src\/modules\/([^/]+)\/(.+)$/.exec(file)
  if (mod) {
    const [, name, rest] = mod
    const first = rest.split('/')[0]
    const part = first === 'domain' || first === 'server' || first === 'ui' ? first : 'root'
    return { kind: 'module', name, part, rest }
  }
  if (/^src\/(domain|components|lib|db)\//.test(file)) return { kind: 'shared' }
  if (file.startsWith('src/app/')) return { kind: 'app' }
  return { kind: 'other' }
}

/** Điểm vào được import registrations: route/layout trong src/app và server/**\/actions.ts của module (cổng actions.ts không import). */
function isEntryPoint(file: string): boolean {
  return file.startsWith('src/app/') || /^src\/modules\/[^/]+\/server\/(.+\/)?actions\.ts$/.test(file)
}

const tierOf = (name: string): number | undefined => (MODULE_TIERS as Record<string, number>)[name]

/**
 * Vi phạm ranh giới module, dạng `"<file> -> <file>: <lý do>"`. Lý do: `tầng không thấp hơn`,
 * `không qua cổng công khai`, `dùng chung import module`, `proxy chỉ import lib/domain` (src/proxy.ts chỉ import
 * src/lib, src/domain), `client import cổng server` (file `'use client'` trong src/app import giá trị từ index.ts
 * của module; `import type` đã bỏ khỏi đồ thị). Cạnh đi ra từ registrations không kiểm;
 * cạnh tới registrations từ điểm vào được bỏ qua. Luật bên trong một module do ESLint kiểm.
 */
export function moduleViolations(graph: Map<string, Set<string>>): string[] {
  const out: string[] = []
  for (const [from, targets] of graph) {
    const f = place(from)
    if (f.kind === 'registrations') continue
    const isClient = f.kind === 'app' && clientFiles.get(graph)?.has(from)
    for (const to of targets) {
      const t = place(to)
      const report = (reason: string) => out.push(`${from} -> ${to}: ${reason}`)
      if (f.kind === 'proxy') {
        if (!/^src\/(lib|domain)\//.test(to)) report('proxy chỉ import lib/domain')
        continue
      }
      if (t.kind !== 'module' && t.kind !== 'registrations') continue
      if (f.kind === 'shared') {
        report('dùng chung import module')
        continue
      }
      if (t.kind === 'registrations') {
        if (!isEntryPoint(from)) report('không qua cổng công khai')
        continue
      }
      if (f.kind === 'module' && f.name === t.name) continue
      if (f.kind === 'module') {
        const [ft, tt] = [tierOf(f.name), tierOf(t.name)]
        if (ft === undefined || tt === undefined || tt >= ft) report('tầng không thấp hơn')
      }
      // ui chỉ được import giá trị qua actions.ts/ui.ts; index.ts chỉ cho `import type` (đã bỏ khỏi đồ thị).
      const entries = f.kind === 'module' && f.part === 'ui' ? ENTRIES.filter((e) => e !== 'index.ts') : ENTRIES
      if (f.kind === 'module' || f.kind === 'app') {
        if (!entries.includes(t.rest)) report('không qua cổng công khai')
        else if (isClient && t.rest === 'index.ts') report('client import cổng server')
      }
    }
  }
  return out
}
