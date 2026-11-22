import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'

// Mô phỏng Supavisor (cổng 6543, chế độ transaction): bắt tay xong bình thường, nhận truy vấn nhưng không bao giờ trả lời.
// Supavisor trước 2.10 treo đúng như vậy khi client gửi dồn nhiều truy vấn trên một kết nối (xem README của postgres, mục Supavisor).

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

function msg(type: string, body: Buffer = Buffer.alloc(0)) {
  const head = Buffer.alloc(5)
  head.write(type, 0, 'latin1')
  head.writeInt32BE(body.length + 4, 1)
  return Buffer.concat([head, body])
}
function int32s(...n: number[]) {
  const b = Buffer.alloc(4 * n.length)
  n.forEach((v, i) => b.writeInt32BE(v, i * 4))
  return b
}

/** Server Postgres giả: trả lời bắt tay, đếm số lệnh Parse nhận được, không trả lời truy vấn nào. */
async function silentPooler() {
  const sockets = new Set<Socket>()
  const stats = { parses: 0 }
  const server: Server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    let buf = Buffer.alloc(0)
    let started = false
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        if (!started) {
          if (buf.length < 8) return
          const len = buf.readInt32BE(0)
          if (buf.length < len) return
          const code = buf.readInt32BE(4)
          buf = buf.subarray(len)
          if (code === 80877102) {
            socket.destroy()
            return
          } // CancelRequest: bỏ qua, như pooler im lặng
          started = true
          socket.write(Buffer.concat([msg('R', int32s(0)), msg('K', int32s(1, 2)), msg('Z', Buffer.from('I'))]))
          continue
        }
        if (buf.length < 5) return
        const len = buf.readInt32BE(1)
        if (buf.length < len + 1) return
        if (buf[0] === 0x50 || buf[0] === 0x51) stats.parses++ // 'P' (Parse) hoặc 'Q' (Query)
        buf = buf.subarray(len + 1)
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No TCP address')
  const close = async () => {
    for (const s of sockets) s.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return { url: `postgres://test:test@127.0.0.1:${address.port}/test`, stats, close }
}

it('không gửi dồn truy vấn trên một kết nối (Supavisor treo khi bị gửi dồn)', async () => {
  const pooler = await silentPooler()
  vi.stubEnv('DATABASE_URL', pooler.url)
  vi.stubEnv('DATABASE_POOL_MAX', '1')
  vi.stubEnv('DATABASE_QUERY_TIMEOUT', '1')
  try {
    const { db } = await import('@/db/client')
    const all = Promise.allSettled([db.execute(sql`select 1`), db.execute(sql`select 2`)])
    // Chờ truy vấn đầu tới pooler (máy tải nặng có thể chậm hơn vài trăm ms), rồi cho truy vấn thứ hai thêm thời gian:
    // nếu client gửi dồn, Parse thứ hai sẽ tới trong khoảng này.
    await vi.waitFor(() => expect(pooler.stats.parses).toBeGreaterThanOrEqual(1), { timeout: 5000, interval: 50 })
    await new Promise((r) => setTimeout(r, 500))
    expect(pooler.stats.parses).toBe(1)
    await all
  } finally {
    await pooler.close()
  }
}, 15000)

it('pooler nhận truy vấn mà im lặng → báo QUERY_TIMEOUT thay vì treo', async () => {
  const pooler = await silentPooler()
  vi.stubEnv('DATABASE_URL', pooler.url)
  vi.stubEnv('DATABASE_QUERY_TIMEOUT', '1')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const { db } = await import('@/db/client')
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Truy vấn treo, không hết giờ')), 9000)
    })
    await expect(Promise.race([db.execute(sql`select 1`), deadline])).rejects.toMatchObject({
      cause: { code: 'QUERY_TIMEOUT' },
    })
  } finally {
    clearTimeout(timer)
    await pooler.close()
  }
}, 15000)
