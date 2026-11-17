import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Không tìm thấy trang này</h1>
      <p>Đường dẫn không đúng hoặc dữ liệu đã bị xoá.</p>
      <Link href="/" className="underline">Về trang Nhắc việc</Link>
    </div>
  )
}
