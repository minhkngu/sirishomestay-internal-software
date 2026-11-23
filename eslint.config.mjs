import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import boundaries from 'eslint-plugin-boundaries'

// Thứ tự tầng của module trong src/modules: module chỉ import module tầng thấp hơn.
// Nguồn duy nhất: tests/unit/architecture/import-graph.ts import lại từ đây. Thêm module mới thì thêm vào đây.
export const MODULE_TIERS = Object.freeze({
  platform: 1,
  users: 2,
  tenants: 2,
  facilities: 2,
  documents: 2,
  assets: 3,
  meters: 3,
  leasing: 4,
  import: 5,
  dashboard: 5,
  cashbook: 5,
})

const moduleNames = Object.keys(MODULE_TIERS)
const lowerThan = (name) => moduleNames.filter((n) => MODULE_TIERS[n] < MODULE_TIERS[name])
const sameModule = { name: '{{ from.element.captured.name }}' }
// File ở gốc module (element `module`); cổng công khai là index.ts (server), actions.ts (server action), ui.ts (component).
const moduleEntry = (files, captured) => ({ element: { type: 'module', fileInternalPath: files, captured } })
const ENTRIES = ['index.ts', 'actions.ts', 'ui.ts']

// Luật của src/modules (kiến trúc đích, docs/architecture.md mục 4) và luật chuyển tiếp (bỏ ở Task 22).
const modulePolicies = [
  // Gốc module (cổng và file khác ở gốc) dùng được mọi phần của chính module.
  {
    from: { element: { type: 'module' } },
    allow: {
      to: {
        element: { types: { anyOf: ['module', 'module-domain', 'module-server', 'module-ui'] }, captured: sameModule },
      },
    },
  },
  // domain chỉ import domain của chính module và src/domain.
  {
    from: { element: { type: 'module-domain' } },
    allow: [
      { to: { element: { type: 'module-domain', captured: sameModule } } },
      { to: { element: { type: 'domain' } } },
    ],
  },
  // server: domain, server của chính module; src/db, src/domain, src/lib.
  {
    from: { element: { type: 'module-server' } },
    allow: [
      { to: { element: { types: { anyOf: ['module-domain', 'module-server'] }, captured: sameModule } } },
      { to: { element: { types: { anyOf: ['db', 'domain', 'lib'] } } } },
    ],
  },
  // ui: domain, cổng actions.ts và server/**/actions.ts của chính module; `import type` từ index.ts, server/** của chính module
  // (kiểu không vào bundle trình duyệt); src/components, src/domain, src/lib.
  {
    from: { element: { type: 'module-ui' } },
    allow: [
      { to: { element: { type: 'module-domain', captured: sameModule } } },
      { to: { element: { type: 'module', fileInternalPath: 'actions.ts', captured: sameModule } } },
      { to: { element: { type: 'module-server', fileInternalPath: '**/actions.ts', captured: sameModule } } },
      {
        to: { element: { types: { anyOf: ['module', 'module-server'] }, captured: sameModule } },
        dependency: { kind: 'type' },
      },
      { to: { element: { types: { anyOf: ['components', 'domain', 'lib'] } } } },
    ],
  },
  // Giữa các module: chỉ module tầng thấp hơn, chỉ qua cổng. server → index.ts; ui → ui.ts, actions.ts và `import type` từ index.ts.
  ...moduleNames
    .filter((name) => lowerThan(name).length > 0)
    .flatMap((name) => {
      const lower = lowerThan(name).map((n) => ({ name: n }))
      return [
        {
          from: { element: { type: 'module-server', captured: { name } } },
          allow: { to: moduleEntry('index.ts', lower) },
        },
        {
          from: { element: { type: 'module-ui', captured: { name } } },
          allow: [
            { to: moduleEntry(['ui.ts', 'actions.ts'], lower) },
            { to: moduleEntry('index.ts', lower), dependency: { kind: 'type' } },
          ],
        },
      ]
    }),
  // registrations.ts là điểm ghép (nhận diện bằng file category), không phải module: import được mọi module và src/server.
  {
    from: { file: { categories: 'registrations' } },
    allow: { to: { element: { types: { anyOf: ['module', 'module-domain', 'module-server', 'server'] } } } },
  },
  // Điểm vào được import registrations: src/app, actions.ts cũ, cổng actions.ts và server/**/actions.ts của module.
  {
    from: [
      { element: { type: 'app' } },
      { element: { type: 'server', fileInternalPath: '**/actions.ts' } },
      { element: { type: 'module', fileInternalPath: 'actions.ts' } },
      { element: { type: 'module-server', fileInternalPath: '**/actions.ts' } },
    ],
    allow: { to: { file: { categories: 'registrations' } } },
  },
  // Chuyển tiếp: code cũ được import module qua cổng công khai.
  { from: { element: { types: { anyOf: ['server', 'feature', 'app'] } } }, allow: { to: moduleEntry(ENTRIES) } },
]

// Quy tắc import giữa các lớp, khớp mục Architecture trong CLAUDE.md.
const layers = ['components', 'server', 'domain', 'db', 'lib']
const boundariesConfig = {
  files: ['src/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
    'import/resolver': { typescript: { alwaysTryTypes: true } },
    'boundaries/elements': [
      { type: 'module-domain', pattern: 'src/modules/*/domain', partialMatch: false, capture: ['name'] },
      { type: 'module-server', pattern: 'src/modules/*/server', partialMatch: false, capture: ['name'] },
      { type: 'module-ui', pattern: 'src/modules/*/ui', partialMatch: false, capture: ['name'] },
      { type: 'module', pattern: 'src/modules/*', partialMatch: false, capture: ['name'] },
      { type: 'app', pattern: 'src/app', partialMatch: false },
      { type: 'feature', pattern: 'src/features/*', partialMatch: false, capture: ['name'] },
      ...layers.map((l) => ({ type: l, pattern: `src/${l}`, partialMatch: false })),
    ],
    // registrations.ts nằm ở src/modules nên cũng khớp element `module`; luật của nó viết theo category này.
    'boundaries/files': [{ category: 'registrations', pattern: 'src/modules/registrations.ts' }],
  },
  rules: {
    'boundaries/dependencies': [
      2,
      {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
          { from: { element: { type: 'db' } }, allow: { to: { element: { type: 'db' } } } },
          // db chỉ được import kiểu từ domain (không phụ thuộc lúc chạy).
          {
            from: { element: { type: 'db' } },
            allow: { to: { element: { type: 'domain' } }, dependency: { kind: 'type' } },
          },
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
          ...modulePolicies,
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
