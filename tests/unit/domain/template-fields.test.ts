import { describe, it, expect } from 'vitest'
import { TEMPLATE_FIELDS, DOC_TYPES, DOC_TYPE_LABELS, buildTemplateData, sampleDataFor } from '@/domain/template-fields'

describe('TEMPLATE_FIELDS', () => {
  it('có đủ 10 loại giấy tờ, mỗi trường có mã, ý nghĩa và ví dụ', () => {
    expect(DOC_TYPES).toHaveLength(11)
    for (const t of DOC_TYPES) {
      expect(DOC_TYPE_LABELS[t]).toBeTruthy()
      expect(TEMPLATE_FIELDS[t].length).toBeGreaterThan(0)
      for (const f of TEMPLATE_FIELDS[t]) {
        expect(f.key).toMatch(/^[a-z_0-9]+$/)
        expect(f.label).toBeTruthy()
        expect(f.example).not.toBe('')
      }
    }
  })
  it('phụ lục chuyển nhượng có thông tin cả hai bên', () => {
    const data = buildTemplateData('addendum_assignment', {
      oldTenant: { name: 'Khách cũ', idDocument: '111' },
      newTenant: { name: 'Khách mới', idDocument: '222' },
    })
    expect(data).toMatchObject({
      ten_ben_chuyen: 'Khách cũ',
      giay_to_ben_chuyen: '111',
      ten_ben_nhan: 'Khách mới',
      giay_to_ben_nhan: '222',
    })
  })
  it('hợp đồng thuê có các chỗ điền và vòng lặp theo spec', () => {
    const keys = TEMPLATE_FIELDS.lease.map((f) => f.key)
    for (const k of [
      'ten_khach',
      'loai_khach',
      'so_giay_to',
      'so_dien_thoai',
      'email',
      'ten_cong_ty',
      'ma_so_thue',
      'co_so',
      'dia_chi_co_so',
      'so_phong',
      'ngay_bat_dau',
      'ngay_ket_thuc',
      'gia_thue',
      'gia_thue_bang_chu',
      'tien_coc',
      'tien_coc_bang_chu',
      'ngay_lap',
      'phi_dich_vu',
      'nguoi_o',
    ]) {
      expect(keys).toContain(k)
    }
    expect(TEMPLATE_FIELDS.lease.find((f) => f.key === 'phi_dich_vu')?.loop?.fields.map((f) => f.key)).toEqual([
      'ten',
      'don_vi',
      'so_luong',
      'don_gia',
    ])
    expect(TEMPLATE_FIELDS.lease.find((f) => f.key === 'nguoi_o')?.loop?.fields.map((f) => f.key)).toEqual([
      'ho_ten',
      'giay_to',
    ])
  })
  it('hoá đơn và biên bản bàn giao có vòng lặp', () => {
    expect(TEMPLATE_FIELDS.invoice_monthly.find((f) => f.key === 'dong')?.loop?.fields.map((f) => f.key)).toEqual([
      'mo_ta',
      'so_luong',
      'don_gia',
      'thanh_tien',
    ])
    expect(TEMPLATE_FIELDS.handover_check_out.find((f) => f.key === 'tai_san')?.loop?.fields.map((f) => f.key)).toEqual(
      ['ma', 'ten', 'tinh_trang', 'phat'],
    )
    expect(TEMPLATE_FIELDS.handover_check_in.find((f) => f.key === 'chi_so')?.loop?.fields.map((f) => f.key)).toEqual([
      'loai',
      'so_dong_ho',
      'chi_so',
    ])
  })
})

describe('buildTemplateData', () => {
  const entities = {
    now: '2026-10-14',
    tenant: {
      kind: 'foreign' as const,
      fullName: 'John Miller',
      idDocument: 'P1234567',
      phone: '+14155550100',
      email: 'john@example.com',
    },
    facility: { name: 'Thảo Điền', address: '12 Xuân Thuỷ' },
    room: { code: '301' },
    lease: {
      code: 'TD-HĐ-2026-0001',
      startDate: '2026-10-15',
      endDate: '2027-10-14',
      monthlyRent: 9_000_000,
      depositAmount: 9_000_000,
    },
    fees: [{ name: 'Phí dịch vụ', unit: 'người', quantity: 2, unitPrice: 200_000 }],
    occupants: [{ fullName: 'John Miller', idDocument: 'P1234567' }],
  }
  it('hợp đồng thuê: định dạng tiền, ngày và số tiền bằng chữ', () => {
    const d = buildTemplateData('lease', entities)
    expect(d.gia_thue).toBe('9.000.000')
    expect(d.gia_thue_bang_chu).toBe('Chín triệu đồng')
    expect(d.tien_coc_bang_chu).toBe('Chín triệu đồng')
    expect(d.ngay_bat_dau).toBe('15/10/2026')
    expect(d.ngay_lap).toBe('14/10/2026')
    expect(d.ten_khach).toBe('John Miller')
    expect(d.so_phong).toBe('301')
    expect(d.phi_dich_vu).toEqual([{ ten: 'Phí dịch vụ', don_vi: 'người', so_luong: 2, don_gia: '200.000' }])
    expect(d.nguoi_o).toEqual([{ ho_ten: 'John Miller', giay_to: 'P1234567' }])
  })
  it('hoá đơn: tổng tiền và bằng chữ, dòng hoá đơn', () => {
    const d = buildTemplateData('invoice_monthly', {
      now: '2026-12-01',
      tenant: entities.tenant,
      facility: entities.facility,
      room: entities.room,
      invoice: {
        code: 'TD-HD-202612-0001',
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
        dueDate: '2026-12-08',
        lines: [
          { description: 'Tiền phòng tháng 12/2026', quantity: 1, unitPrice: 9_000_000, amount: 9_000_000 },
          { description: 'Tiền điện tháng 11/2026', quantity: 100, unitPrice: 3800, amount: 380_000 },
        ],
      },
    })
    expect(d.tong_tien).toBe('9.380.000')
    expect(d.tong_tien_bang_chu).toBe('Chín triệu ba trăm tám mươi nghìn đồng')
    expect(d.ket_luan).toBe('Khách phải thanh toán: 9.380.000 ₫')
    expect(d.tom_tat_thanh_toan).toBe('Đã thanh toán: 0 ₫ · Còn phải trả: 9.380.000 ₫')
    expect(d.han_thanh_toan).toBe('08/12/2026')
    expect(d.ky).toBe('01/12/2026 – 31/12/2026')
    expect(d.dong).toHaveLength(2)
    expect(d.dong).toMatchObject([
      { mo_ta: 'Tiền phòng tháng 12/2026', so_luong: 1, don_gia: '9.000.000', thanh_tien: '9.000.000' },
      {},
    ])
  })
  it('hoá đơn âm: kết luận Siris hoàn trả khách, còn phải hoàn theo số đã hoàn', () => {
    const base = {
      tenant: entities.tenant,
      facility: entities.facility,
      room: entities.room,
    }
    const line = [{ description: 'Hoàn cọc', quantity: 1, unitPrice: -2_000_000, amount: -2_000_000 }]
    const d = buildTemplateData('invoice_termination', {
      ...base,
      invoice: { code: 'X', periodStart: '2026-12-01', periodEnd: '2026-12-01', lines: line, paid: -500_000 },
    })
    expect(d.ket_luan).toBe('Siris hoàn trả khách: 2.000.000 ₫')
    expect(d.tom_tat_thanh_toan).toBe('Đã hoàn: 500.000 ₫ · Còn phải hoàn: 1.500.000 ₫')
  })
  it('thiếu dữ liệu → chuỗi rỗng, không ném lỗi', () => {
    expect(buildTemplateData('lease', { now: '2026-10-14' }).ten_khach).toBe('')
  })
  it('biên bản bàn giao không còn chỉ số: mẫu cũ dùng bảng chỉ số in bảng rỗng', () => {
    const d = buildTemplateData('handover_check_in', {
      now: '2026-10-14',
      handover: { date: '2026-10-15', items: [], readings: undefined },
    })
    expect(d.chi_so).toEqual([])
  })
  it('sampleDataFor dựng dữ liệu từ ví dụ của từng trường', () => {
    const d = sampleDataFor('lease')
    expect(d.ten_khach).toBeTruthy()
    expect(Array.isArray(d.phi_dich_vu)).toBe(true)
  })
})
