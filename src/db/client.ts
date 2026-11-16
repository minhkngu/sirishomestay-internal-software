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
  return drizzle(postgres(url, { prepare: false }), { schema })
}

/** Kết nối Drizzle dùng chung (khởi tạo khi dùng lần đầu). */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop, receiver) {
    _db ??= connect()
    return Reflect.get(_db, prop, receiver)
  },
})
