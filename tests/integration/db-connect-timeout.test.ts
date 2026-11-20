import { createServer, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'

// client.ts đặt connect_timeout = 5 giây; hạn chót rộng hơn gấp đôi cộng 5 giây để chịu tải khi chạy song song.
const DEADLINE_MS = 15000

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('rejects promptly when the database accepts a connection but never completes startup', async () => {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No TCP address')
  vi.stubEnv('DATABASE_URL', `postgres://test:test@127.0.0.1:${address.port}/test`)

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const { db } = await import('@/db/client')
    const query = db.execute(sql`select 1`)
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Database connection did not time out promptly')), DEADLINE_MS)
    })
    await expect(Promise.race([query, deadline])).rejects.toMatchObject({
      cause: { code: 'CONNECT_TIMEOUT' },
    })
  } finally {
    clearTimeout(timer)
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}, DEADLINE_MS + 5000)
