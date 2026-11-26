import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, sql } from 'drizzle-orm'
import * as schema from '../src/db'
import type { DB } from '../src/db/client'
import { syncDepositWithInvoice } from '../src/modules/leasing/server/invoices/deposit-sync'

try {
  process.loadEnvFile('.env.local')
} catch {
  /* không có .env.local: dùng biến môi trường hiện có */
}

/**
 * Đồng bộ sổ cọc với các hoá đơn đã duyệt có dòng "Tiền cọc còn thiếu": phần cọc đã thu thì dòng thu cọc chờ chuyển đã xong.
 * Chạy lại nhiều lần an toàn; chỉ cần chạy một lần cho các hoá đơn đã thu trước khi có cách tách cọc khỏi tiền thuê.
 */
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Thiếu DATABASE_URL')
  const client = postgres(url, { prepare: false, max: 1 })
  const db = drizzle(client, { schema }) as unknown as DB
  const admin = {
    userId: crypto.randomUUID(),
    email: 'script@siris.local',
    fullName: 'Script đồng bộ cọc',
    permissions: new Set(['settings' as const]),
    facilityIds: new Set<string>(),
    isAdmin: true,
  }
  const invoices = await db
    .selectDistinct({ id: schema.invoices.id, code: schema.invoices.code })
    .from(schema.invoices)
    .innerJoin(schema.invoiceLines, eq(schema.invoiceLines.invoiceId, schema.invoices.id))
    .where(sql`${schema.invoiceLines.type} = 'deposit' and ${schema.invoices.status} = 'approved'`)
  console.log('Hoá đơn đã duyệt có dòng cọc:', invoices.map((i) => i.code).join(', ') || '(không có)')
  for (const invoice of invoices)
    await db.transaction(async (tx) => syncDepositWithInvoice(tx as unknown as DB, admin, invoice.id))
  const entries = await db.select().from(schema.depositEntries)
  const done = entries.filter((e) => e.note.includes('Thu cùng hoá đơn'))
  console.log(`Dòng sổ cọc đã hoàn tất qua hoá đơn: ${done.length}`)
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
