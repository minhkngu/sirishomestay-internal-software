// Kiểm tra nhanh môi trường trước khi chạy `npm run test:e2e`.
// Thoát mã khác 0 kèm lý do nếu thiếu điều kiện, để không tốn thời gian chạy Playwright vô ích.
import { existsSync } from 'node:fs'
import { chromium } from '@playwright/test'

const fail = (msg) => {
  console.error(`e2e preflight: ${msg}`)
  process.exit(1)
}

const baseURL = process.env.E2E_BASE_URL
if (!baseURL) fail('thiếu E2E_BASE_URL (môi trường thử có dữ liệu mẫu và NEXT_PUBLIC_DEMO_MODE=1)')

if (!existsSync(chromium.executablePath()))
  fail('chưa cài Chromium cho Playwright, chạy: npx playwright install chromium')

let res
try {
  res = await fetch(new URL('/login', baseURL), {
    signal: AbortSignal.timeout(15_000),
    headers: process.env.E2E_VERCEL_OIDC ? { 'x-vercel-trusted-oidc-idp-token': process.env.E2E_VERCEL_OIDC } : {},
  })
} catch (e) {
  fail(`không kết nối được ${baseURL}/login (${e.cause?.code ?? e.message})`)
}
if (!res.ok) fail(`${baseURL}/login trả về HTTP ${res.status}`)
if (!(await res.text()).includes('Đăng nhập nhanh bằng tài khoản mẫu'))
  fail(`${baseURL} không bật chế độ thử (NEXT_PUBLIC_DEMO_MODE=1), test đăng nhập nhanh sẽ hỏng`)

console.log(`e2e preflight: ok (${baseURL})`)
