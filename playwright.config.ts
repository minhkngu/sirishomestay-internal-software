import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL,
    // Preview Vercel có Deployment Protection: gửi token OIDC tạm thời (lấy bằng `vc env run`) để qua lớp bảo vệ
    extraHTTPHeaders: process.env.E2E_VERCEL_OIDC ? { 'x-vercel-trusted-oidc-idp-token': process.env.E2E_VERCEL_OIDC } : undefined,
  },
})
