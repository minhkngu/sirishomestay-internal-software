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
  // max_pipeline:1 — Supavisor (cổng 6543) trước 2.10 treo khi nhận nhiều truy vấn gửi dồn trên một kết nối (Promise.all)
  // query_timeout — pooler im lặng thì truy vấn báo lỗi sau vài giây, không treo trang tới khi function hết giờ
  return drizzle(postgres(url, {
    prepare: false,
    connect_timeout: 5,
    max: Number(process.env.DATABASE_POOL_MAX) || 3,
    max_pipeline: 1,
    query_timeout: Number(process.env.DATABASE_QUERY_TIMEOUT) || 20,
  }), { schema })
}

/** Kết nối Drizzle dùng chung (khởi tạo khi dùng lần đầu). */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop, receiver) {
    _db ??= connect()
    return Reflect.get(_db, prop, receiver)
  },
})
