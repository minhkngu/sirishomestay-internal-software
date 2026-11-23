import { describe, it, expect } from 'vitest'
import { buildMonthlyCells } from '@/modules/meters/domain/meters-monthly'
import type { Meter, MeterReading } from '@/domain/types'

const m1: Meter = { id: 'm1', roomId: 'R1', utility: 'electric', installedOn: '2025-01-01', startReading: 0 }
const rd = (
  meterId: string,
  period: string,
  readOn: string,
  value: number,
  kind: 'monthly' | 'handover' = 'monthly',
): MeterReading => ({ meterId, period, readOn, value, kind })
const PERIODS = ['2026-09', '2026-10', '2026-11', '2026-12']
const cell = (cells: ReturnType<typeof buildMonthlyCells>, period: string) => cells.find((c) => c.period === period)!

describe('buildMonthlyCells', () => {
  const readings = [
    rd('m1', '2026-09', '2026-09-30', 1000),
    rd('m1', '2026-10', '2026-10-31', 1100),
    rd('m1', '2026-12', '2026-12-31', 1300),
  ]

  it('tháng có chỉ số monthly cho value và usage so với chỉ số gần nhất trước đó', () => {
    const c = cell(buildMonthlyCells(PERIODS, [m1], readings), '2026-10')
    expect(c).toMatchObject({
      values: [1100],
      usage: 100,
      replaced: false,
      estimated: false,
      gapBefore: false,
      handover: [],
    })
  })

  it('tháng trống giữa hai tháng có số: usage tháng sau tính từ chỉ số cũ và gapBefore là true', () => {
    const cells = buildMonthlyCells(PERIODS, [m1], readings)
    expect(cell(cells, '2026-11')).toMatchObject({ values: [], usage: null })
    expect(cell(cells, '2026-12')).toMatchObject({ values: [1300], usage: 200, gapBefore: true })
  })

  it('tháng đầu cửa sổ không có chỉ số trước thì usage tính từ chỉ số đầu và gapBefore là false', () => {
    expect(cell(buildMonthlyCells(PERIODS, [m1], readings), '2026-09')).toMatchObject({
      values: [1000],
      usage: 1000,
      gapBefore: false,
    })
  })

  const oldM: Meter = {
    id: 'old',
    roomId: 'R1',
    utility: 'electric',
    installedOn: '2025-01-01',
    startReading: 0,
    removedOn: '2026-10-20',
    finalReading: 1260,
  }
  const newM: Meter = { id: 'new', roomId: 'R1', utility: 'electric', installedOn: '2026-10-20', startReading: 0 }
  const swapReadings = [rd('old', '2026-09', '2026-09-30', 1200), rd('new', '2026-10', '2026-10-31', 45)]

  it('tháng đổi công tơ có hai giá trị (chỉ số cuối cũ, chỉ số mới) và replaced true', () => {
    expect(cell(buildMonthlyCells(PERIODS, [oldM, newM], swapReadings), '2026-10')).toMatchObject({
      values: [1260, 45],
      usage: 105,
      replaced: true,
      estimated: false,
    })
  })

  it('công tơ gỡ có cờ ước tính cho estimated true', () => {
    expect(
      cell(buildMonthlyCells(PERIODS, [{ ...oldM, finalReadingEstimated: true }, newM], swapReadings), '2026-10')
        .estimated,
    ).toBe(true)
  })

  it('chỉ số bàn giao vào handover của tháng, không thành value', () => {
    const c = cell(
      buildMonthlyCells(PERIODS, [m1], [...readings, rd('m1', '2026-10', '2026-10-10', 1050, 'handover')]),
      '2026-10',
    )
    expect(c.handover).toEqual([1050])
    expect(c.values).toEqual([1100])
  })

  it('chỉ số giảm cho usage null thay vì ném lỗi', () => {
    const c = cell(
      buildMonthlyCells(
        PERIODS,
        [m1],
        [rd('m1', '2026-09', '2026-09-30', 1000), rd('m1', '2026-10', '2026-10-31', 900)],
      ),
      '2026-10',
    )
    expect(c.values).toEqual([900])
    expect(c.usage).toBeNull()
  })
})
