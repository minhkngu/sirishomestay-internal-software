import { afterAll, afterEach, beforeEach } from 'vitest'
import { closeTestDbs, setInTest } from './db'

// Nạp cho mọi tệp test (setupFiles). Hook ở đây đăng ký trước hook của tệp test nên afterEach/afterAll
// chạy sau cùng: tệp test dọn dữ liệu xong thì DB mới bị đóng.
beforeEach(() => setInTest(true))
afterEach(async () => {
  setInTest(false)
  await closeTestDbs('test')
})
afterAll(() => closeTestDbs('file'))
