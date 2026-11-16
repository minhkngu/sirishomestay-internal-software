import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('function Vercel chạy cùng vùng với Supabase', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  expect(config.regions).toEqual(['bom1'])
})
