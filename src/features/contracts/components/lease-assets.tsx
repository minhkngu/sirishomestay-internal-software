'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { assetEntry } from '../lease-photo-retry'
import { BareSelect } from './contract-form-ui'

export type AssetOption = { id: string; code: string; name: string; model: string; condition: string; facilityId: string; locationKind: string; locationId: string }
export type NewAsset = { code: string; name: string; model: string; category: string; value: number; condition: string }
export type MoveTargets = { facilities: { id: string; name: string; rooms: { id: string; code: string }[] }[] }
export type AssetRemoval = { assetId: string; action: 'dispose' } | { assetId: string; action: 'move'; to: { kind: 'warehouse' | 'room'; id: string } }
export type AssetChanges = { addAssetIds: string[]; newAssets: NewAsset[]; remove: AssetRemoval[] }
export const emptyChanges = (): AssetChanges => ({ addAssetIds: [], newAssets: [], remove: [] })
const noPhotos: File[] = []
const actionMenuClass = 'absolute left-0 top-full z-10 grid min-w-44 rounded-xl border border-border/80 bg-popover p-1.5 shadow-lg' // taste-skill-ignore: menu nổi

function PhotoPreview({ file, name, index, onRemove }: { file: File; name: string; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = () => setUrl(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
    return () => { if (reader.readyState === FileReader.LOADING) reader.abort() }
  }, [file])
  return <div className="relative">{url && <img src={url} alt={`Ảnh ${name} ${index + 1}`} className="size-16 rounded-lg border border-border/70 object-cover" />}<button type="button" aria-label={`Xóa ảnh ${index + 1} của ${name}`} className="absolute right-0 top-0 rounded-md bg-background/90 px-1 text-sm text-muted-foreground hover:text-destructive" onClick={onRemove}>×</button></div>
}

function AssetPhotos({ name, files, onChange }: { name: string; files: File[]; onChange: (files: File[]) => void }) {
  return <div className="space-y-2"><label className="block space-y-1.5 text-xs text-muted-foreground">Ảnh lúc bàn giao<Input aria-label={`Ảnh ${name}`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { onChange([...files, ...Array.from(e.target.files ?? [])]); e.currentTarget.value = '' }} /></label>
    {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((file, index) => <PhotoPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} name={name} index={index} onRemove={() => onChange(files.filter((_, i) => i !== index))} />)}</div>}
  </div>
}

type Props = { assets: AssetOption[]; roomId: string; facilityId?: string; canManageAssets: boolean; moveTargets: MoveTargets; changes: AssetChanges; onChange: (v: AssetChanges) => void; conditions: Record<string, string>; onCondition: (code: string, value: string) => void; photos: Record<string, File[]>; onPhotos: (code: string, files: File[]) => void; onForget: (code: string) => void }

export function LeaseAssets({ assets, roomId, facilityId, canManageAssets, moveTargets, changes, onChange, conditions, onCondition, photos, onPhotos, onForget }: Props) {
  const [open, setOpen] = useState(true)
  const [menu, setMenu] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [moveKind, setMoveKind] = useState<'' | 'warehouse' | 'room'>('')
  const [moveFacility, setMoveFacility] = useState('')
  const [moveRoom, setMoveRoom] = useState('')
  const resetMove = () => { setMoveKind(''); setMoveFacility(''); setMoveRoom('') }
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [model, setModel] = useState(''); const [category, setCategory] = useState(''); const [value, setValue] = useState('0'); const [condition, setCondition] = useState('Tốt')
  const targetLabel = (kind: string, id: string) => {
    if (kind === 'warehouse') { const f = moveTargets.facilities.find(x => x.id === id); return f ? `Kho ${f.name}` : '' }
    for (const f of moveTargets.facilities) { const r = f.rooms.find(x => x.id === id); if (r) return `${f.name} · ${r.code}` }
    return ''
  }
  const removalLabel = (removal: AssetRemoval) => removal.action === 'dispose' ? 'Thanh lý' : `Di chuyển → ${targetLabel(removal.to.kind, removal.to.id)}`
  const setRemoval = (removal: AssetRemoval) => { onChange({ ...changes, remove: [...changes.remove.filter(r => r.assetId !== removal.assetId), removal] }); setMenu(null); setMoving(null); resetMove() }
  const roomAssets = assets.filter(a => a.locationKind === 'room' && a.locationId === roomId)
  const candidates = assets.filter(a => a.facilityId === facilityId && !roomAssets.some(r => r.id === a.id))
  const fields = (asset: { code: string; name: string; model: string; condition: string }) => <div className="space-y-3">
    <div><p className="text-[13px] font-medium text-foreground">{asset.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{asset.code}{asset.model ? ` · ${asset.model}` : ''}</p></div>
    <label className="block space-y-1.5 text-xs text-muted-foreground">Tình trạng lúc bàn giao<Input aria-label={`Tình trạng ${asset.name}`} value={assetEntry(conditions, asset.code) ?? asset.condition} maxLength={300} onChange={e => onCondition(asset.code, e.target.value)} /></label>
    <AssetPhotos name={asset.name} files={assetEntry(photos, asset.code) ?? noPhotos} onChange={files => onPhotos(asset.code, files)} />
  </div>
  return <div className="space-y-3">
    <button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2.5 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="text-[13px] font-medium text-foreground">Tài sản bàn giao</span>
      <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
    {open && <div className="space-y-3">
      {!roomId && <p className="rounded-xl border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">Chọn phòng để xem tài sản.</p>}
      {roomId && roomAssets.length === 0 && changes.addAssetIds.length === 0 && changes.newAssets.length === 0 && <p className="rounded-xl border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">Phòng chưa có tài sản bàn giao.</p>}
      {roomAssets.map(asset => { const removal = changes.remove.find(r => r.assetId === asset.id); return <div key={asset.id} className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5">
        {removal ? <p className="text-[13px] text-foreground">{asset.name} · {removalLabel(removal)}</p> : fields(asset)}
        {canManageAssets && <div className="relative"><button type="button" className="text-xs font-medium text-primary hover:underline hover:underline-offset-2" onClick={() => { setMenu(menu === asset.id ? null : asset.id); setMoving(null) }}>{removal ? 'Đổi cách xử lý' : 'Xử lý tài sản'}</button>{menu === asset.id && <div className={actionMenuClass}>
          <button type="button" className="rounded-lg p-2 text-left text-[13px] hover:bg-muted" onClick={() => setMoving(moving === asset.id ? null : asset.id)}>Di chuyển</button>
          {moving === asset.id && <div className="m-1 grid gap-1.5">
            <BareSelect ariaLabel={`Loại đích ${asset.name}`} value={moveKind} onValueChange={value => { setMoveKind(value as '' | 'warehouse' | 'room'); setMoveFacility(''); setMoveRoom('') }} options={[{ value: '', label: '— kho hoặc phòng —' }, { value: 'warehouse', label: 'Kho' }, { value: 'room', label: 'Phòng' }]} />
            {moveKind && <BareSelect ariaLabel={`Tòa ${asset.name}`} value={moveFacility} onValueChange={value => { setMoveFacility(value); setMoveRoom('') }} options={[{ value: '', label: '— Chọn tòa —' }, ...moveTargets.facilities.map(f => ({ value: f.id, label: f.name }))]} />}
            {moveKind === 'room' && moveFacility && <BareSelect ariaLabel={`Phòng đích ${asset.name}`} value={moveRoom} onValueChange={setMoveRoom} options={[{ value: '', label: '— Chọn phòng —' }, ...(moveTargets.facilities.find(f => f.id === moveFacility)?.rooms ?? []).filter(r => r.id !== roomId).map(r => ({ value: r.id, label: r.code }))]} />}
            <button type="button" className="h-8 rounded-lg border border-border/80 bg-card px-2 text-xs font-medium disabled:opacity-50" disabled={!(moveKind === 'warehouse' ? moveFacility : moveKind === 'room' ? moveRoom : '')} onClick={() => { if (moveKind === 'warehouse') setRemoval({ assetId: asset.id, action: 'move', to: { kind: 'warehouse', id: moveFacility } }); else if (moveKind === 'room') setRemoval({ assetId: asset.id, action: 'move', to: { kind: 'room', id: moveRoom } }) }}>Áp dụng</button></div>}
          <button type="button" className="rounded-lg p-2 text-left text-[13px] hover:bg-muted" onClick={() => setRemoval({ assetId: asset.id, action: 'dispose' })}>Thanh lý</button>
          {removal && <button type="button" className="rounded-lg p-2 text-left text-[13px] text-primary" onClick={() => { onChange({ ...changes, remove: changes.remove.filter(r => r.assetId !== asset.id) }); setMenu(null); setMoving(null); resetMove() }}>Giữ lại</button>}</div>}</div>}
      </div> })}
      {changes.addAssetIds.map(id => { const asset = assets.find(a => a.id === id); return asset && <div key={id} className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5">{fields(asset)}<button type="button" className="text-xs font-medium text-primary hover:underline hover:underline-offset-2" onClick={() => { onForget(asset.code); onChange({ ...changes, addAssetIds: changes.addAssetIds.filter(x => x !== id) }) }}>Gỡ {asset.name}</button></div> })}
      {changes.newAssets.map(asset => <div key={asset.code} className="space-y-3 rounded-xl border border-border/70 bg-card p-3.5">{fields(asset)}<button type="button" className="text-xs font-medium text-primary hover:underline hover:underline-offset-2" onClick={() => { onForget(asset.code); onChange({ ...changes, newAssets: changes.newAssets.filter(a => a.code !== asset.code) }) }}>Gỡ {asset.name}</button></div>)}
      {roomId && canManageAssets && <><Button type="button" variant="outline" size="sm" aria-expanded={adding} onClick={() => setAdding(!adding)}><span aria-hidden="true">{adding ? '−' : '+'}</span> Thêm tài sản</Button>
        {adding && <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
          <div className="space-y-1.5 text-xs text-muted-foreground"><span>Thêm tài sản có sẵn</span><BareSelect ariaLabel="Thêm tài sản có sẵn" value="" onValueChange={id => { if (id) onChange({ ...changes, addAssetIds: [...changes.addAssetIds, id] }) }} options={candidates.filter(a => !changes.addAssetIds.includes(a.id)).map(a => ({ value: a.id, label: `${a.name} ${a.model}` }))} placeholder="— Chọn tài sản —" /></div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Mã tài sản mới" placeholder="Mã tài sản" value={code} onChange={e => setCode(e.target.value)} />
            <Input aria-label="Tên tài sản mới" placeholder="Tên tài sản" value={name} onChange={e => setName(e.target.value)} />
            <Input aria-label="Model tài sản mới" placeholder="Model" value={model} onChange={e => setModel(e.target.value)} />
            <Input aria-label="Loại tài sản mới" placeholder="Loại tài sản" value={category} onChange={e => setCategory(e.target.value)} />
            <MoneyInput aria-label="Giá trị tài sản mới" value={value} onValueChange={setValue} />
            <Input aria-label="Tình trạng tài sản mới" placeholder="Tình trạng" value={condition} onChange={e => setCondition(e.target.value)} />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!code.trim() || !name.trim() || changes.newAssets.some(a => a.code === code.trim()) || assets.some(a => a.code === code.trim()) || !Number.isSafeInteger(Number(value)) || Number(value) < 0} onClick={() => { onChange({ ...changes, newAssets: [...changes.newAssets, { code: code.trim(), name: name.trim(), model, category, value: Number(value), condition }] }); setCode(''); setName(''); setModel(''); setCategory(''); setValue('0'); setCondition('Tốt') }}>Thêm tài sản mới</Button>
        </div>}</>}
    </div>}
  </div>
}
