import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import postgres from 'postgres'
import * as schema from './index'

export type DB = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>

let _db: PostgresJsDatabase<typeof schema> | undefined

function connect() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Thiếu biến môi trường DATABASE_URL')
  // prepare:false để chạy được qua Supabase transaction pooler
  // Mỗi instance serverless giữ ít kết nối để nhiều instance chạy song song không vượt giới hạn của pooler (session pooler chỉ ~15)
  return drizzle(postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX) || 3 }), { schema })
}

/** Kết nối Drizzle dùng chung (khởi tạo khi dùng lần đầu). */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop, receiver) {
    _db ??= connect()
    return Reflect.get(_db, prop, receiver)
  },
})
