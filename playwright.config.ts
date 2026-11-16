import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:3100' },
  webServer: { command: 'npx next dev -p 3100', url: 'http://localhost:3100', reuseExistingServer: true, timeout: 180_000 },
})
