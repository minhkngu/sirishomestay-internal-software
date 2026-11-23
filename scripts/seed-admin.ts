import { randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { userProfiles, userPermissions } from '../src/db'

try {
  process.loadEnvFile('.env.local')
} catch {
  /* không có .env.local: dùng biến môi trường hiện có */
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const email = arg('email')
  const name = arg('name')
  if (!email || !name) throw new Error('Cách dùng: npm run seed:admin -- --email x@y.com --name "Tên"')
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Thiếu DATABASE_URL')

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const password = randomBytes(12).toString('base64url')
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`Không tạo được người dùng: ${error?.message}`)

  const client = postgres(url, { prepare: false })
  const db = drizzle(client)
  await db.insert(userProfiles).values({ id: data.user.id, email, fullName: name })
  await db.insert(userPermissions).values({ userId: data.user.id, permission: 'settings' })
  await client.end()

  console.log(`Đã tạo quản trị viên ${email}\nMật khẩu tạm (chỉ hiện một lần): ${password}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
