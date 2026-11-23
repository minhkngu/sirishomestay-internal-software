import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import boundaries from 'eslint-plugin-boundaries'

// Quy tắc import giữa các lớp, khớp mục Architecture trong CLAUDE.md.
const layers = ['components', 'server', 'domain', 'db', 'lib']
const boundariesConfig = {
  files: ['src/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
    'import/resolver': { typescript: { alwaysTryTypes: true } },
    'boundaries/elements': [
      { type: 'app', pattern: 'src/app', partialMatch: false },
      { type: 'feature', pattern: 'src/features/*', partialMatch: false, capture: ['name'] },
      ...layers.map((l) => ({ type: l, pattern: `src/${l}`, partialMatch: false })),
    ],
  },
  rules: {
    'boundaries/dependencies': [
      2,
      {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
          { from: { element: { type: 'db' } }, allow: { to: { element: { type: 'db' } } } },
          { from: { element: { type: 'lib' } }, allow: { to: { element: { types: { anyOf: ['lib', 'domain'] } } } } },
          {
            from: { element: { type: 'server' } },
            allow: { to: { element: { types: { anyOf: ['server', 'db', 'domain', 'lib'] } } } },
          },
          {
            from: { element: { type: 'components' } },
            allow: { to: { element: { types: { anyOf: ['components', 'server', 'domain', 'lib'] } } } },
          },
          {
            from: { element: { type: 'feature' } },
            allow: { to: { element: { types: { anyOf: ['components', 'server', 'domain', 'lib'] } } } },
          },
          {
            from: { element: { type: 'feature' } },
            allow: { to: { element: { type: 'feature', captured: { name: '{{ from.element.captured.name }}' } } } },
          },
          {
            from: { element: { type: 'app' } },
            allow: { to: { element: { types: { anyOf: ['app', 'feature', ...layers] } } } },
          },
        ],
      },
    ],
  },
}

// Trang và route không tự truy vấn DB: đi qua service trong src/server (vẫn được dùng client `@/db/client` để truyền cho service).
const appNoDbConfig = {
  files: ['src/app/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: '@/db', message: 'Trang không tự truy vấn DB: thêm hàm vào service trong src/server rồi gọi.' },
          {
            name: '@/db/schema',
            message: 'Trang không tự truy vấn DB: thêm hàm vào service trong src/server rồi gọi.',
          },
          {
            name: 'drizzle-orm',
            message: 'Trang không tự truy vấn DB: thêm hàm vào service trong src/server rồi gọi.',
          },
        ],
        patterns: [
          {
            group: ['@/db/schema/*'],
            message: 'Trang không tự truy vấn DB: thêm hàm vào service trong src/server rồi gọi.',
          },
        ],
      },
    ],
  },
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  boundariesConfig,
  appNoDbConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Script do ai-rules quản lý (CommonJS), ghi đè mỗi lần sync.
    '.claude/**',
  ]),
])

export default eslintConfig
