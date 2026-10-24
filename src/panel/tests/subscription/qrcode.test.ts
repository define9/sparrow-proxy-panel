import { describe, expect, it } from 'vitest'
import { encodeQr, renderQrPath, renderQrSvg } from '../../app/utils/qrcode'

describe('qrcode', () => {
  it('生成矩阵尺寸符合版本规则', () => {
    const matrix = encodeQr('https://panel.example.com/sub/550e8400-e29b-41d4-a716-446655440000?format=clash')

    expect(matrix.size % 4).toBe(1)
    expect(matrix.size).toBeGreaterThanOrEqual(21)
    expect(matrix.modules).toHaveLength(matrix.size)
  })

  it('矩阵包含三个定位图案', () => {
    const matrix = encodeQr('sparrow')
    const isDark = (x: number, y: number) => matrix.modules[y]![x]

    // 左上角定位图案：中心 3×3 深色，外圈浅色，最外圈深色
    expect(isDark(3, 3)).toBe(true)
    expect(isDark(1, 1)).toBe(false)
    expect(isDark(0, 0)).toBe(true)
    expect(isDark(matrix.size - 4, 3)).toBe(true)
    expect(isDark(3, matrix.size - 4)).toBe(true)
  })

  it('相同内容生成相同结果（纯函数）', () => {
    const text = 'https://example.com/sub/550e8400-e29b-41d4-a716-446655440000'

    expect(renderQrPath(text).path).toBe(renderQrPath(text).path)
    expect(encodeQr(text).modules).toEqual(encodeQr(text).modules)
  })

  it('输出 SVG 字符串', () => {
    const svg = renderQrSvg('sparrow', { size: 128 })

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('width="128"')
  })
})
