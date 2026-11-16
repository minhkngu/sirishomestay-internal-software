import { describe, it, expect } from 'vitest'
import PizZip from 'pizzip'
import { renderDocx } from '@/lib/docx'
import { buildTemplateData, DOC_TYPES } from '@/domain/template-fields'
import { buildSampleTemplate } from '../../scripts/build-sample-templates'

async function textOf(blob: Blob): Promise<string> {
  const zip = new PizZip(await blob.arrayBuffer())
  return zip.file('word/document.xml')!.asText().replace(/<[^>]+>/g, ' ')
}

describe('renderDocx', () => {
  const entities = {
    now: '2026-10-14',
    tenant: { kind: 'vietnamese' as const, fullName: 'Nguyễn Văn An', idDocument: '012345678901', phone: '+84901234567' },
    facility: { name: 'Thảo Điền', address: '12 Xuân Thuỷ' }, room: { code: '301' },
    lease: { code: 'TD-HĐ-2026-0001', startDate: '2026-10-15', endDate: '2027-10-14', monthlyRent: 9_000_000, depositAmount: 9_000_000 },
    fees: [{ name: 'Phí dịch vụ', unit: 'người', quantity: 2, unitPrice: 200_000 }, { name: 'Gửi xe', unit: 'xe', quantity: 1, unitPrice: 100_000 }],
    occupants: [{ fullName: 'Nguyễn Văn An', idDocument: '012345678901' }],
  }

  it('điền mẫu hợp đồng thuê: có số tiền bằng chữ, ngày, và lặp theo danh sách phí', async () => {
    const tpl = await buildSampleTemplate('lease')
    const { blob, warnings } = renderDocx(tpl, buildTemplateData('lease', entities))
    const text = await textOf(blob)
    expect(text).toContain('Chín triệu đồng')
    expect(text).toContain('15/10/2026')
    expect(text).toContain('Nguyễn Văn An')
    expect(text).toContain('Phí dịch vụ')
    expect(text).toContain('Gửi xe')
    expect(text).not.toContain('{')
    expect(warnings).toEqual([])
  })

  it('chỗ điền thiếu dữ liệu để trống và được liệt kê trong warnings', async () => {
    const tpl = await buildSampleTemplate('lease')
    const data = buildTemplateData('lease', entities)
    delete data.ten_khach
    const { blob, warnings } = renderDocx(tpl, data)
    expect(warnings).toContain('ten_khach')
    expect(await textOf(blob)).not.toContain('undefined')
  })

  it('mẫu mẫu của cả 10 loại giấy tờ đều điền được với dữ liệu rỗng mà không ném lỗi', async () => {
    for (const t of DOC_TYPES) {
      const tpl = await buildSampleTemplate(t)
      expect(() => renderDocx(tpl, buildTemplateData(t, { now: '2026-10-14' }))).not.toThrow()
    }
  })

  it('mẫu hỏng (không phải .docx) → ValidationError tiếng Việt', () => {
    expect(() => renderDocx(new TextEncoder().encode('khong phai docx').buffer as ArrayBuffer, {})).toThrow('Mẫu Word không hợp lệ')
  })
})
