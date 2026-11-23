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

// PGlite không tự giải phóng bộ nhớ khi hết tham chiếu: mỗi DB phải được đóng, nếu không một worker
// chạy nhiều tệp test sẽ phình tới hàng GB (CI 16 GB bị hết bộ nhớ). tests/helpers/close-test-dbs.ts gọi các hàm dưới.
let inTest = false
const testClients: PGlite[] = []
const fileClients: PGlite[] = []

/** Đánh dấu đang trong một test (từ beforeEach tới afterEach): DB tạo lúc này đóng sau test đó. */
export function setInTest(value: boolean) {
  inTest = value
}

/** Đóng DB tạo trong test vừa xong (`'test'`) hoặc DB tạo ở beforeAll/cấp tệp (`'file'`). */
export async function closeTestDbs(scope: 'test' | 'file') {
  const list = scope === 'test' ? testClients : fileClients
  const clients = list.splice(0)
  await Promise.allSettled(clients.map((c) => c.close()))
}

/**
 * PGlite mới (trong bộ nhớ), đã chạy toàn bộ migration trong drizzle/.
 * Tạo trong test hoặc beforeEach thì bị đóng sau test đó; tạo ở beforeAll, hoặc `keepUntilFileEnd`
 * (DB dùng chung được tạo lười bên trong một test), thì đóng khi hết tệp.
 */
export async function createTestDb(options?: { keepUntilFileEnd?: boolean }): Promise<DB> {
  migratedDataDir ??= buildMigratedDataDir()
  const client = new PGlite({ loadDataDir: await migratedDataDir })
  ;(inTest && !options?.keepUntilFileEnd ? testClients : fileClients).push(client)
  return drizzle(client, { schema })
}
