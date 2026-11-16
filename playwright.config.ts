import { defineConfig } from '@playwright/test'

const hasCreds = !!process.env.E2E_EMAIL && !!process.env.E2E_PASSWORD

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000' },
  // Chỉ khởi động dev server khi thật sự chạy smoke test (cần Supabase dev + biến môi trường trong .env.local)
  webServer: hasCreds
    ? { command: 'npm run dev', url: 'http://localhost:3000/login', reuseExistingServer: true, timeout: 120_000 }
    : undefined,
})
