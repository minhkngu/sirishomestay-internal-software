import { notFound } from 'next/navigation'

// Khung (app) có slot @modal bắt mọi đường dẫn; trang chính không khớp thì coi như không tìm thấy.
export default function AppDefault() {
  notFound()
}
