'use client'

import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type { ResolvedPos } from '@tiptap/pm/model'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DocType } from '@/domain/template-fields'
import { editorExtensions } from './editor-extensions'
import { decodeFieldDrag, encodeFieldDrag, FIELD_DRAG_MIME, type FieldDrag } from './field-drag'
import { fieldGroups, fieldPlacement, type FieldGroups } from './field-palette'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Khoá vòng lặp của hàng bảng đang đứng (null nếu không ở trong hàng lặp). */
function rowLoopAt($pos: ResolvedPos): string | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const n = $pos.node(d)
    if (n.type.name === 'tableRow') return (n.attrs.loop as string | null) ?? null
  }
  return null
}

const chipHtml = (key: string, label: string) => `<span data-field="${esc(key)}">${esc(label)}</span>`

function loopTableHtml(groups: FieldGroups, key: string): string {
  const loop = groups.loops.find((l) => l.key === key)
  if (!loop) return ''
  return `<table><tr>${loop.fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr><tr data-loop="${esc(key)}">${loop.fields.map((f) => `<td><p>${chipHtml(f.key, f.label)}</p></td>`).join('')}</tr></table>`
}

/** Vị trí ngay sau khối cấp cao nhất chứa `$pos` (để chèn bảng mới mà không cắt đôi đoạn văn hay bảng khác). */
const afterTopBlock = ($pos: ResolvedPos) => ($pos.depth >= 1 ? $pos.after(1) : $pos.pos)

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? 'secondary' : 'ghost'} aria-label={label} title={label} aria-pressed={active} disabled={disabled} className="h-8 min-w-8 px-2" onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </Button>
  )
}

function Toolbar({ editor, groups }: { editor: Editor; groups: FieldGroups }) {
  const run = () => editor.chain().focus()
  const inTable = editor.isActive('table')
  const rowLoop = inTable ? (editor.getAttributes('tableRow').loop as string | null) ?? '' : ''
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
      <Tool label="In đậm" active={editor.isActive('bold')} onClick={() => run().toggleBold().run()}><b>B</b></Tool>
      <Tool label="In nghiêng" active={editor.isActive('italic')} onClick={() => run().toggleItalic().run()}><i>I</i></Tool>
      <Tool label="Gạch chân" active={editor.isActive('underline')} onClick={() => run().toggleUnderline().run()}><u>U</u></Tool>
      <span className="mx-1 h-5 w-px bg-border" />
      {([1, 2, 3] as const).map((l) => <Tool key={l} label={`Tiêu đề ${l}`} active={editor.isActive('heading', { level: l })} onClick={() => run().toggleHeading({ level: l }).run()}>{`T${l}`}</Tool>)}
      <Tool label="Danh sách chấm" active={editor.isActive('bulletList')} onClick={() => run().toggleBulletList().run()}>•</Tool>
      <Tool label="Danh sách số" active={editor.isActive('orderedList')} onClick={() => run().toggleOrderedList().run()}>1.</Tool>
      <span className="mx-1 h-5 w-px bg-border" />
      {([['left', 'Căn trái', '⇤'], ['center', 'Căn giữa', '↔'], ['right', 'Căn phải', '⇥'], ['justify', 'Căn đều', '☰']] as const).map(([a, label, icon]) => (
        <Tool key={a} label={label} active={editor.isActive({ textAlign: a })} onClick={() => run().setTextAlign(a).run()}>{icon}</Tool>
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <Tool label="Chèn bảng" onClick={() => run().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()}>Bảng</Tool>
      <Tool label="Thêm hàng" disabled={!inTable} onClick={() => run().addRowAfter().run()}>+ Hàng</Tool>
      <Tool label="Xoá hàng" disabled={!inTable} onClick={() => run().deleteRow().run()}>− Hàng</Tool>
      <Tool label="Thêm cột" disabled={!inTable} onClick={() => run().addColumnAfter().run()}>+ Cột</Tool>
      <Tool label="Xoá bảng" disabled={!inTable} onClick={() => run().deleteTable().run()}>Xoá bảng</Tool>
      <Tool label="Ngắt trang" onClick={() => run().insertContent({ type: 'pageBreak' }).run()}>Ngắt trang</Tool>
      {groups.loops.length > 0 && (
        <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
          Hàng lặp theo
          <select aria-label="Hàng lặp theo" disabled={!inTable} value={rowLoop ?? ''} className="h-8 rounded-md border bg-background px-1 text-sm disabled:opacity-50"
            onChange={(e) => run().updateAttributes('tableRow', { loop: e.target.value || null }).run()}>
            <option value="">(không lặp)</option>
            {groups.loops.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

/** Hộp soạn mẫu: chữ định dạng, bảng, chỗ điền dạng chip; chip và cả danh sách lặp kéo thả được từ bảng bên phải. */
export function TemplateEditor({ docType, initialHtml, onChange }: { docType: DocType; initialHtml: string; onChange: (html: string) => void }) {
  const groups = useMemo(() => fieldGroups(docType), [docType])
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const say = (m: string) => { setNotice(m); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(null), 4000) }

  const place = (drag: FieldDrag, at: number | null): boolean => {
    const editor = editorRef.current
    if (!editor) return false
    const pos = at ?? editor.state.selection.from
    const $pos = editor.state.doc.resolve(pos)
    try {
      if (drag.kind === 'field') {
        const problem = fieldPlacement(groups, drag.key, rowLoopAt($pos))
        if (problem) { say(problem); return false }
        return editor.chain().focus().insertContentAt(pos, { type: 'fieldChip', attrs: { key: drag.key, label: drag.label } }).run()
      }
      const html = loopTableHtml(groups, drag.key)
      if (!html) { say('Danh sách này không có trong loại giấy tờ đang soạn'); return false }
      return editor.chain().focus().insertContentAt(afterTopBlock($pos), html).run()
    } catch {
      say('Không thả được vào vị trí này')
      return false
    }
  }

  const editor = useEditor({
    extensions: editorExtensions(),
    content: initialHtml,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onCreate: ({ editor: e }) => { editorRef.current = e },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: { class: 'template-editor min-h-96 p-4 focus:outline-none', 'aria-label': 'Nội dung mẫu' },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false // chip kéo để dời chỗ trong hộp soạn: để TipTap xử lý
        const raw = event.dataTransfer?.getData(FIELD_DRAG_MIME)
        if (!raw) return false
        event.preventDefault()
        const drag = decodeFieldDrag(raw)
        if (!drag) { say('Không đọc được chỗ điền vừa thả'); return true }
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!at) { say('Thả chỗ điền vào bên trong hộp soạn mẫu'); return true }
        place(drag, at.pos)
        return true
      },
    },
  })

  const dragStart = (e: React.DragEvent, drag: FieldDrag) => { e.dataTransfer.setData(FIELD_DRAG_MIME, encodeFieldDrag(drag)); e.dataTransfer.effectAllowed = 'copy' }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0 overflow-hidden rounded-md border bg-card">
        {editor && <Toolbar editor={editor} groups={groups} />}
        <EditorContent editor={editor} />
        {notice && <p role="status" className="border-t bg-amber-50 px-3 py-1.5 text-sm text-amber-900">{notice}</p>}
      </div>
      <aside className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border bg-card p-2 text-sm" aria-label="Bảng chỗ điền">
        <div>
          <p className="mb-1 font-medium">Chỗ điền</p>
          <p className="mb-2 text-xs text-muted-foreground">Bấm hoặc kéo vào mẫu</p>
          <ul className="flex flex-wrap gap-1">
            {groups.fields.map((f) => (
              <li key={f.key}>
                <button type="button" draggable onDragStart={(e) => dragStart(e, { kind: 'field', key: f.key, label: f.label })} onMouseDown={(e) => e.preventDefault()} onClick={() => place({ kind: 'field', key: f.key, label: f.label }, null)}
                  className="cursor-grab rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-accent">{f.label}</button>
              </li>
            ))}
          </ul>
        </div>
        {groups.loops.map((l) => (
          <div key={l.key} className="rounded-md border p-2">
            <button type="button" draggable onDragStart={(e) => dragStart(e, { kind: 'loop', key: l.key })} onMouseDown={(e) => e.preventDefault()} onClick={() => place({ kind: 'loop', key: l.key }, null)}
              className="mb-1 w-full cursor-grab rounded border border-dashed px-2 py-1 text-left text-xs font-medium hover:bg-accent">Chèn bảng: {l.label}</button>
            <ul className="flex flex-wrap gap-1">
              {l.fields.map((f) => (
                <li key={f.key}>
                  <button type="button" draggable onDragStart={(e) => dragStart(e, { kind: 'field', key: f.key, label: f.label })} onMouseDown={(e) => e.preventDefault()} onClick={() => place({ kind: 'field', key: f.key, label: f.label }, null)}
                    className="cursor-grab rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-accent">{f.label}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  )
}
