import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { DOC_TYPES, DOC_TYPE_LABELS, TEMPLATE_FIELDS, type DocType } from '../src/domain/template-fields'

const para = (text: string, opts: { bold?: boolean } = {}) => new Paragraph({ children: [new TextRun({ text, bold: opts.bold, font: 'Times New Roman', size: 26 })] })

/** Mẫu Word mẫu cho một loại giấy tờ: tiêu đề + mỗi chỗ điền một dòng; vòng lặp dùng 3 đoạn `{#x}` / dòng / `{/x}`. */
export async function buildSampleTemplate(docType: DocType): Promise<ArrayBuffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: DOC_TYPE_LABELS[docType].toUpperCase(), bold: true, font: 'Times New Roman' })] }),
  ]
  for (const f of TEMPLATE_FIELDS[docType]) {
    if (f.loop) {
      children.push(para(`${f.label}:`, { bold: true }))
      children.push(para(`{#${f.loop.key}}`))
      children.push(para(`- ${f.loop.fields.map((x) => `${x.label}: {${x.key}}`).join(' | ')}`))
      children.push(para(`{/${f.loop.key}}`))
    } else {
      children.push(para(`${f.label}: {${f.key}}`))
    }
  }
  children.push(para(''), para('Bên A (ký, ghi rõ họ tên)                                        Bên B (ký, ghi rõ họ tên)'))
  const buf = await Packer.toBuffer(new Document({ sections: [{ children }] }))
  const u8 = new Uint8Array(buf)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

async function main() {
  const dir = path.resolve(process.cwd(), 'public/templates')
  mkdirSync(dir, { recursive: true })
  for (const t of DOC_TYPES) {
    writeFileSync(path.join(dir, `${t}.docx`), Buffer.from(await buildSampleTemplate(t)))
    console.log(`public/templates/${t}.docx`)
  }
}

if (process.argv[1]?.endsWith('build-sample-templates.ts')) main()
