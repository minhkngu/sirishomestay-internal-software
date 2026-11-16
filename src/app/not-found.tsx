import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy</h1>
      <p className="text-sm text-muted-foreground">Trang không tồn tại hoặc bạn không có quyền xem.</p>
      <Link href="/" className="underline">Về trang Nhắc việc</Link>
    </div>
  )
}
