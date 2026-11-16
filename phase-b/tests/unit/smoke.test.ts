import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '../helpers/db'

describe('test database', () => {
  it('runs select 1 on PGlite', async () => {
    const db = await createTestDb()
    const res = await db.execute(sql`select 1 as x`)
    const rows = (res as unknown as { rows: { x: number }[] }).rows
    expect(rows[0].x).toBe(1)
  })
})
