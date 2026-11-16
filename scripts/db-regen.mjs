// Sinh lại toàn bộ migration từ schema Drizzle (chưa triển khai ở đâu nên được phép gộp) + bật RLS cho mọi bảng.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

rmSync('drizzle', { recursive: true, force: true })
execSync('npx drizzle-kit generate --name init', { stdio: 'inherit' })
const sql = readdirSync('drizzle').filter((f) => f.endsWith('.sql')).map((f) => readFileSync(`drizzle/${f}`, 'utf8')).join('\n')
const tables = [...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1])
execSync('npx drizzle-kit generate --custom --name enable_rls', { stdio: 'inherit' })
const rlsFile = readdirSync('drizzle').find((f) => f.endsWith('enable_rls.sql'))
writeFileSync(
  `drizzle/${rlsFile}`,
  '-- Bật RLS cho mọi bảng, không tạo policy: chặn mọi truy cập qua anon key / PostgREST.\n' +
    tables.map((t) => `alter table "${t}" enable row level security;`).join('\n--> statement-breakpoint\n') + '\n',
)
console.log(`RLS cho ${tables.length} bảng`)
