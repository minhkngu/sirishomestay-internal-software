'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Msg, useRun } from '@/components/use-run'
import { createMeterTypeAction, deleteMeterTypeAction, updateMeterTypeAction } from '../server/meter-types/actions'

export type MeterTypeRow = { id: string; name: string; unit: string; isSystem: boolean }

/** Loại đồng hồ: tên và đơn vị. Điện, Nước có sẵn (chỉ sửa đơn vị); loại khác thêm, sửa, xoá được. */
export function MeterTypeSettings({ types }: { types: MeterTypeRow[] }) {
  const { pending, error, ok, run } = useRun()
  const [edits, setEdits] = useState<Record<string, { name: string; unit: string }>>(
    Object.fromEntries(types.map((t) => [t.id, { name: t.name, unit: t.unit }])),
  )
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Các loại đồng hồ dùng khi thêm đồng hồ cho phòng và để lọc ở trang Chỉ số. Điện, Nước có sẵn; thêm loại khác như
        máy giặt, hồ bơi.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/70 text-left">
            <tr>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground">Tên loại</th>
              <th className="px-3 py-2.5 text-[13px] font-medium text-muted-foreground">Đơn vị</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const e = edits[t.id] ?? { name: t.name, unit: t.unit }
              return (
                <tr key={t.id} className="border-t">
                  <td className="p-2">
                    <Input
                      aria-label={`Tên loại ${t.name}`}
                      disabled={t.isSystem}
                      value={e.name}
                      onChange={(ev) => setEdits({ ...edits, [t.id]: { ...e, name: ev.target.value } })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      aria-label={`Đơn vị ${t.name}`}
                      className="w-36"
                      value={e.unit}
                      onChange={(ev) => setEdits({ ...edits, [t.id]: { ...e, unit: ev.target.value } })}
                    />
                  </td>
                  <td className="space-x-2 whitespace-nowrap p-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => updateMeterTypeAction(t.id, { name: e.name, unit: e.unit }), 'Đã lưu')}
                    >
                      Lưu
                    </Button>
                    {!t.isSystem && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => deleteMeterTypeAction(t.id), 'Đã xoá')}
                      >
                        Xoá
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="max-w-md space-y-2.5 rounded-2xl border border-border/80 bg-card p-4">
        <h3 className="text-sm font-medium">Thêm loại đồng hồ</h3>
        <div className="flex gap-2">
          <Input
            aria-label="Tên loại đồng hồ mới"
            placeholder="Ví dụ: Máy giặt"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            aria-label="Đơn vị"
            className="w-36"
            placeholder="Đơn vị: lần"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await createMeterTypeAction({ name, unit })
              if (r.ok) {
                setName('')
                setUnit('')
              }
              return r
            }, 'Đã thêm')
          }
        >
          Thêm
        </Button>
      </div>
      <Msg error={error} ok={ok} />
    </div>
  )
}
