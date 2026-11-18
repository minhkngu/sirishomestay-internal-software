import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import path from 'node:path'
import * as schema from '@/db'
import type { DB } from '@/db/client'

// Chạy migration một lần cho mỗi tệp test rồi lưu thư mục dữ liệu; mỗi test nạp lại bản sao, nhanh hơn chạy lại toàn bộ migration.
let migratedDataDir: Promise<File | Blob> | undefined

async function buildMigratedDataDir(): Promise<File | Blob> {
  const client = new PGlite()
  await migrate(drizzle(client), { migrationsFolder: path.resolve(process.cwd(), 'drizzle') })
  const dump = await client.dumpDataDir('none')
  await client.close()
  return dump
}

/** PGlite mới (trong bộ nhớ), đã chạy toàn bộ migration trong drizzle/. */
export async function createTestDb(): Promise<DB> {
  migratedDataDir ??= buildMigratedDataDir()
  const client = new PGlite({ loadDataDir: await migratedDataDir })
  return drizzle(client, { schema })
}
