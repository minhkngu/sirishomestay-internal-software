import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../src/db'
import type { DB } from '../src/db/client'
import { ensureUtilityFeeTypes } from '../src/server/fees/service'

try { process.loadEnvFile('.env.local') } catch { /* không có .env.local: dùng biến môi trường hiện có */ }

/** Nạp sẵn loại phí Điện và Nước tính theo đồng hồ; chạy lại nhiều lần an toàn. */
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Thiếu DATABASE_URL')
  const client = postgres(url, { prepare: false })
  const db = drizzle(client, { schema }) as unknown as DB
  const admin = { userId: crypto.randomUUID(), email: 'script@siris.local', fullName: 'Script nạp loại phí', permissions: new Set(['settings' as const]), facilityIds: new Set<string>(), isAdmin: true }
  const { electric, water } = await ensureUtilityFeeTypes(db, admin)
  await client.end()
  console.log(`Điện: ${electric.id} (giá mặc định ${electric.defaultPrice})\nNước: ${water.id} (giá mặc định ${water.defaultPrice})`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
