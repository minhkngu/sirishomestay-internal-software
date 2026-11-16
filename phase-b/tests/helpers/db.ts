import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import path from 'node:path'
import * as schema from '@/db'
import type { DB } from '@/db/client'

/** PGlite mới (trong bộ nhớ), đã chạy toàn bộ migration trong drizzle/. */
export async function createTestDb(): Promise<DB> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  const folder = path.resolve(process.cwd(), 'drizzle')
  try {
    await migrate(db, { migrationsFolder: folder })
  } catch (e) {
    // Chưa có migration nào (Task 1): bỏ qua
    if (!(e instanceof Error) || !/meta\/_journal\.json/.test(e.message)) throw e
  }
  return db
}
