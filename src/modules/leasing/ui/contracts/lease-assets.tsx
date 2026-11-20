'use client'

import { useEffect, useState } from 'react'
import { ASSET_CONDITION } from '@/domain/asset-labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { assetEntry } from './lease-photo-retry'

export type AssetOption = {
  id: string
  code: string
  name: string
  model: string
  condition: string
  facilityId: string
  locationKind: string
  locationId: string
}
export type NewAsset = { code: string; name: string; model: string; category: string; value: number; condition: string }
export type MoveTargets = { facilities: { id: string; name: string; rooms: { id: string; code: string }[] }[] }
export type AssetRemoval =
  | { assetId: string; action: 'dispose' }
  | { assetId: string; action: 'move'; to: { kind: 'warehouse' | 'room'; id: string } }
export type AssetChanges = { addAssetIds: string[]; newAssets: NewAsset[]; remove: AssetRemoval[] }
export const emptyChanges = (): AssetChanges => ({ addAssetIds: [], newAssets: [], remove: [] })
const noPhotos: File[] = []

function PhotoPreview({
  file,
  name,
  index,
  onRemove,
}: {
  file: File
  name: string
  index: number
  onRemove: () => void
}) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = () => setUrl(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
    return () => {
      if (reader.readyState === FileReader.LOADING) reader.abort()
    }
  }, [file])
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh vừa chọn bằng data URL, next/image không xử lý được */}
      {url && <img src={url} alt={`Ảnh ${name} ${index + 1}`} className="size-16 rounded border object-cover" />}
      <button
        type="button"
        aria-label={`Xóa ảnh ${index + 1} của ${name}`}
        className="absolute right-0 top-0 rounded bg-background px-1"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}

function AssetPhotos({ name, files, onChange }: { name: string; files: File[]; onChange: (files: File[]) => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        Ảnh lúc bàn giao
        <Input
          aria-label={`Ảnh ${name}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            onChange([...files, ...Array.from(e.target.files ?? [])])
            e.currentTarget.value = ''
          }}
        />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <PhotoPreview
              key={`${file.name}-${file.lastModified}-${index}`}
              file={file}
              name={name}
              index={index}
              onRemove={() => onChange(files.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type Props = {
  assets: AssetOption[]
  roomId: string
  facilityId?: string
  canManageAssets: boolean
  moveTargets: MoveTargets
  changes: AssetChanges
  onChange: (v: AssetChanges) => void
  conditions: Record<string, string>
  onCondition: (code: string, value: string) => void
  photos: Record<string, File[]>
  onPhotos: (code: string, files: File[]) => void
  onForget: (code: string) => void
}

export function LeaseAssets({
  assets,
  roomId,
  facilityId,
  canManageAssets,
  moveTargets,
  changes,
  onChange,
  conditions,
  onCondition,
  photos,
  onPhotos,
  onForget,
}: Props) {
  const [open, setOpen] = useState(true)
  const [menu, setMenu] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [moveKind, setMoveKind] = useState<'' | 'warehouse' | 'room'>('')
  const [moveFacility, setMoveFacility] = useState('')
  const [moveRoom, setMoveRoom] = useState('')
  const resetMove = () => {
    setMoveKind('')
    setMoveFacility('')
    setMoveRoom('')
  }
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [category, setCategory] = useState('')
  const [value, setValue] = useState('0')
  const [condition, setCondition] = useState<string>(ASSET_CONDITION.good)
  const targetLabel = (kind: string, id: string) => {
    if (kind === 'warehouse') {
      const f = moveTargets.facilities.find((x) => x.id === id)
      return f ? `Kho ${f.name}` : ''
    }
    for (const f of moveTargets.facilities) {
      const r = f.rooms.find((x) => x.id === id)
      if (r) return `${f.name} · ${r.code}`
    }
    return ''
  }
  const removalLabel = (removal: AssetRemoval) =>
    removal.action === 'dispose' ? 'Thanh lý' : `Di chuyển → ${targetLabel(removal.to.kind, removal.to.id)}`
  const setRemoval = (removal: AssetRemoval) => {
    onChange({ ...changes, remove: [...changes.remove.filter((r) => r.assetId !== removal.assetId), removal] })
    setMenu(null)
    setMoving(null)
    resetMove()
  }
  const roomAssets = assets.filter((a) => a.locationKind === 'room' && a.locationId === roomId)
  const candidates = assets.filter((a) => a.facilityId === facilityId && !roomAssets.some((r) => r.id === a.id))
  const fields = (asset: { code: string; name: string; model: string; condition: string }) => (
    <div className="space-y-2">
      <div>
        <strong className="text-sm">{asset.name}</strong>
        <span className="ml-2 text-sm text-muted-foreground">
          {asset.code}
          {asset.model ? ` · ${asset.model}` : ''}
        </span>
      </div>
      <label className="block text-sm">
        Tình trạng lúc bàn giao
        <Input
          aria-label={`Tình trạng ${asset.name}`}
          value={assetEntry(conditions, asset.code) ?? asset.condition}
          maxLength={300}
          onChange={(e) => onCondition(asset.code, e.target.value)}
        />
      </label>
      <AssetPhotos
        name={asset.name}
        files={assetEntry(photos, asset.code) ?? noPhotos}
        onChange={(files) => onPhotos(asset.code, files)}
      />
    </div>
  )
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <button type="button" className="font-semibold" aria-expanded={open} onClick={() => setOpen(!open)}>
        Tài sản bàn giao {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="space-y-3">
          {!roomId && <p className="text-sm">Chọn phòng để xem tài sản.</p>}
          {roomId && roomAssets.length === 0 && changes.addAssetIds.length === 0 && changes.newAssets.length === 0 && (
            <p className="text-sm text-muted-foreground">Phòng chưa có tài sản bàn giao.</p>
          )}
          {roomAssets.map((asset) => {
            const removal = changes.remove.find((r) => r.assetId === asset.id)
            return (
              <div key={asset.id} className="space-y-2 rounded-lg border bg-card p-3">
                {removal ? (
                  <p className="text-sm">
                    {asset.name} · {removalLabel(removal)}
                  </p>
                ) : (
                  fields(asset)
                )}
                {canManageAssets && (
                  <div className="relative">
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => {
                        setMenu(menu === asset.id ? null : asset.id)
                        setMoving(null)
                      }}
                    >
                      {removal ? 'Đổi cách xử lý' : 'Xử lý tài sản'}
                    </button>
                    {menu === asset.id && (
                      <div className="absolute left-0 top-full z-10 grid min-w-40 rounded border bg-card p-1 shadow">
                        <button
                          type="button"
                          className="p-2 text-left text-sm hover:bg-muted"
                          onClick={() => setMoving(moving === asset.id ? null : asset.id)}
                        >
                          Di chuyển
                        </button>
                        {moving === asset.id && (
                          <div className="m-1 grid gap-1">
                            <select
                              aria-label={`Loại đích ${asset.name}`}
                              className="rounded border p-2 text-sm"
                              value={moveKind}
                              onChange={(e) => {
                                setMoveKind(e.target.value as '' | 'warehouse' | 'room')
                                setMoveFacility('')
                                setMoveRoom('')
                              }}
                            >
                              <option value="">— kho hoặc phòng —</option>
                              <option value="warehouse">Kho</option>
                              <option value="room">Phòng</option>
                            </select>
                            {moveKind && (
                              <select
                                aria-label={`Tòa ${asset.name}`}
                                className="rounded border p-2 text-sm"
                                value={moveFacility}
                                onChange={(e) => {
                                  setMoveFacility(e.target.value)
                                  setMoveRoom('')
                                }}
                              >
                                <option value="">— chọn tòa —</option>
                                {moveTargets.facilities.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {moveKind === 'room' && moveFacility && (
                              <select
                                aria-label={`Phòng đích ${asset.name}`}
                                className="rounded border p-2 text-sm"
                                value={moveRoom}
                                onChange={(e) => setMoveRoom(e.target.value)}
                              >
                                <option value="">— chọn phòng —</option>
                                {(moveTargets.facilities.find((f) => f.id === moveFacility)?.rooms ?? [])
                                  .filter((r) => r.id !== roomId)
                                  .map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.code}
                                    </option>
                                  ))}
                              </select>
                            )}
                            <button
                              type="button"
                              className="rounded border p-2 text-sm disabled:opacity-50"
                              disabled={
                                !(moveKind === 'warehouse' ? moveFacility : moveKind === 'room' ? moveRoom : '')
                              }
                              onClick={() => {
                                if (moveKind === 'warehouse')
                                  setRemoval({
                                    assetId: asset.id,
                                    action: 'move',
                                    to: { kind: 'warehouse', id: moveFacility },
                                  })
                                else if (moveKind === 'room')
                                  setRemoval({ assetId: asset.id, action: 'move', to: { kind: 'room', id: moveRoom } })
                              }}
                            >
                              Áp dụng
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          className="p-2 text-left text-sm hover:bg-muted"
                          onClick={() => setRemoval({ assetId: asset.id, action: 'dispose' })}
                        >
                          Thanh lý
                        </button>
                        {removal && (
                          <button
                            type="button"
                            className="p-2 text-left text-sm"
                            onClick={() => {
                              onChange({ ...changes, remove: changes.remove.filter((r) => r.assetId !== asset.id) })
                              setMenu(null)
                              setMoving(null)
                              resetMove()
                            }}
                          >
                            Giữ lại
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {changes.addAssetIds.map((id) => {
            const asset = assets.find((a) => a.id === id)
            return (
              asset && (
                <div key={id} className="space-y-2 rounded-lg border bg-card p-3">
                  {fields(asset)}
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => {
                      onForget(asset.code)
                      onChange({ ...changes, addAssetIds: changes.addAssetIds.filter((x) => x !== id) })
                    }}
                  >
                    Gỡ {asset.name}
                  </button>
                </div>
              )
            )
          })}
          {changes.newAssets.map((asset) => (
            <div key={asset.code} className="space-y-2 rounded-lg border bg-card p-3">
              {fields(asset)}
              <button
                type="button"
                className="text-sm underline"
                onClick={() => {
                  onForget(asset.code)
                  onChange({ ...changes, newAssets: changes.newAssets.filter((a) => a.code !== asset.code) })
                }}
              >
                Gỡ {asset.name}
              </button>
            </div>
          ))}
          {roomId && canManageAssets && (
            <>
              <Button type="button" variant="outline" aria-expanded={adding} onClick={() => setAdding(!adding)}>
                <span aria-hidden="true">{adding ? '−' : '+'}</span> Thêm tài sản
              </Button>
              {adding && (
                <div className="space-y-3">
                  <label className="block text-sm">
                    Thêm tài sản có sẵn
                    <select
                      className="block w-full rounded border p-2"
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          onChange({ ...changes, addAssetIds: [...changes.addAssetIds, e.target.value] })
                      }}
                    >
                      <option value="">— chọn tài sản —</option>
                      {candidates
                        .filter((a) => !changes.addAssetIds.includes(a.id))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} {a.model}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      aria-label="Mã tài sản mới"
                      placeholder="Mã tài sản"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    <Input
                      aria-label="Tên tài sản mới"
                      placeholder="Tên tài sản"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <Input
                      aria-label="Model tài sản mới"
                      placeholder="Model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                    <Input
                      aria-label="Loại tài sản mới"
                      placeholder="Loại tài sản"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    />
                    <MoneyInput aria-label="Giá trị tài sản mới" value={value} onValueChange={setValue} />
                    <Input
                      aria-label="Tình trạng tài sản mới"
                      placeholder="Tình trạng"
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !code.trim() ||
                      !name.trim() ||
                      changes.newAssets.some((a) => a.code === code.trim()) ||
                      assets.some((a) => a.code === code.trim()) ||
                      !Number.isSafeInteger(Number(value)) ||
                      Number(value) < 0
                    }
                    onClick={() => {
                      onChange({
                        ...changes,
                        newAssets: [
                          ...changes.newAssets,
                          { code: code.trim(), name: name.trim(), model, category, value: Number(value), condition },
                        ],
                      })
                      setCode('')
                      setName('')
                      setModel('')
                      setCategory('')
                      setValue('0')
                      setCondition(ASSET_CONDITION.good)
                    }}
                  >
                    Thêm tài sản mới
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
