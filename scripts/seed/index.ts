import { sql } from 'drizzle-orm'
import type { DB } from '@/db/client'
import { userProfiles } from '@/db'
import { eq } from 'drizzle-orm'
import { createRng } from './rng'
import { ensureSeedBucket } from './bucket'
import { facilitySeed } from './facilities'
import { assetSeed } from './assets'
import { stockSeed } from './stock'
import { chargesSeed } from './charges'
import { loadSeedState } from './state'
import { contractSeed } from './contracts'
import { handoverSeed } from './handovers'
import { meterSeed } from './meters'
import { settingsSeed } from './settings'
import { templateSeed } from './templates'
import { tenantSeed } from './tenants'
import { MemoryStorage } from '@/server/storage/memory'
import type { StorageAdapter } from '@/server/storage/types'
import { userSeed } from './users'
import type { AuthAdmin, SeedCtx, SeedModule } from './types'

export type { AuthAdmin } from './types'

/** Thứ tự nạp: mỗi task thêm module của mình vào đây. */
export const SEED_MODULES: SeedModule[] = [facilitySeed, settingsSeed, userSeed, tenantSeed, templateSeed, contractSeed, assetSeed, stockSeed, meterSeed, handoverSeed, chargesSeed]

export type SeedOptions = { today?: string; password: string; reset?: boolean; storage?: StorageAdapter }

async function resetAll(db: DB, auth: AuthAdmin) {
  const demoUsers = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.isDemo, true))
  for (const u of demoUsers) await auth.deleteUser(u.id)
  const res = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { rows?: { tablename: string }[] } | { tablename: string }[]
  const rows = Array.isArray(res) ? res : res.rows ?? []
  if (rows.length) await db.execute(sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`))
}

export async function runSeed(db: DB, auth: AuthAdmin, opts: SeedOptions): Promise<void> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  if (opts.reset) await resetAll(db, auth)
  const ctx: SeedCtx = { db, auth, today, password: opts.password, storage: opts.storage ?? new MemoryStorage(), rng: createRng(), state: { facilityIds: {}, roomIds: {}, userIds: {} } }
  if (!opts.reset) await loadSeedState(ctx)
  for (const m of SEED_MODULES) {
    if (!opts.reset && await m.isSeeded(ctx)) continue
    let seed = 2166136261
    for (const c of m.name) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619)
    ctx.rng = createRng(seed >>> 0)
    if (m.name === 'users' || m.name === 'templates') await m.run(ctx)
    else await db.transaction(async (tx) => m.run({ ...ctx, db: tx as unknown as DB }))
  }
}

async function main() {
  try { process.loadEnvFile('.env.local') } catch { /* dùng biến môi trường hiện có */ }
  const [{ drizzle }, { default: postgres }, { createClient }, { todayVN }] = await Promise.all([
    import('drizzle-orm/postgres-js'), import('postgres'), import('@supabase/supabase-js'), import('@/domain/dates'),
  ])
  const schema = await import('@/db')
  const url = process.env.DATABASE_URL
  const password = process.env.DEMO_PASSWORD
  if (!url || !password) throw new Error('Cần DATABASE_URL và DEMO_PASSWORD')
  const client = postgres(url, { prepare: false })
  const db = drizzle(client, { schema }) as unknown as DB
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const auth: AuthAdmin = {
    async createUser(email, pw) {
      const { data, error } = await supabase.auth.admin.createUser({ email, password: pw, email_confirm: true })
      if (error || !data.user) throw new Error(`Không tạo được ${email}: ${error?.message}`)
      return data.user.id
    },
    async deleteUser(id) { await supabase.auth.admin.deleteUser(id) },
  }
  if ((process.env.STORAGE_DRIVER ?? 'supabase') === 'supabase') await ensureSeedBucket(supabase.storage)
  const { getStorage } = await import('@/server/storage')
  await runSeed(db, auth, { today: todayVN(), password, reset: process.argv.includes('--reset'), storage: getStorage() })
  await client.end()
  console.log('Đã nạp dữ liệu giả.')
}

if (process.argv[1]?.endsWith('seed/index.ts')) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
