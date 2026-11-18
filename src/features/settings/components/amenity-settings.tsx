'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Msg, useRun } from '@/features/settings/components/use-run'
import { createAmenityAction, updateAmenityAction } from '@/server/amenities/actions'

export type AmenityRow = { id: string; name: string; isActive: boolean }

export function AmenitySettings({ amenities }: { amenities: AmenityRow[] }) {
  const { pending, error, ok, run } = useRun()
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(amenities.map((a) => [a.id, a.name])))
  const [name, setName] = useState('')
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">Danh mục tiện ích dùng khi tạo và sửa phòng. Tiện ích ngừng dùng vẫn hiện ở phòng đã gắn nhưng không chọn được cho phòng mới.</p>
      {amenities.length > 0 && (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Tên tiện ích</th><th className="p-2">Trạng thái</th><th className="p-2" /></tr></thead>
            <tbody>
              {amenities.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2"><Input aria-label={`Tên tiện ích ${a.name}`} value={names[a.id] ?? a.name} onChange={(e) => setNames({ ...names, [a.id]: e.target.value })} /></td>
                  <td className="p-2">{a.isActive ? 'Đang dùng' : 'Ngừng dùng'}</td>
                  <td className="space-x-2 whitespace-nowrap p-2">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateAmenityAction(a.id, { name: names[a.id] }))}>Lưu</Button>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateAmenityAction(a.id, { isActive: !a.isActive }), a.isActive ? 'Đã ngừng dùng' : 'Đã dùng lại')}>
                      {a.isActive ? 'Ngừng dùng' : 'Dùng lại'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="max-w-md space-y-2 rounded-md border bg-card p-3">
        <h3 className="text-sm font-medium">Thêm tiện ích</h3>
        <Input aria-label="Tên tiện ích mới" placeholder="Ví dụ: Ban công, Bếp, Giặt sấy" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={pending} onClick={() => run(async () => { const r = await createAmenityAction({ name }); if (r.ok) setName(''); return r }, 'Đã thêm')}>Thêm</Button>
      </div>
      <Msg error={error} ok={ok} />
    </div>
  )
}
