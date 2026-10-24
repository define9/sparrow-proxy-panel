/**
 * 极简二维码生成器（无第三方依赖）。
 *
 * 面板的依赖集里没有二维码库，且 `package.json` 不允许修改，
 * 因此这里内置一个符合 ISO/IEC 18004 的最小实现：
 * - 字节模式（UTF-8）
 * - 纠错等级 M
 * - 版本 1 ~ 40 自动选择
 * - 8 种掩码自动择优
 *
 * 输出为 SVG 字符串（quiet zone 4 模块），可直接塞进 UModal。
 *
 * 说明：二维码必须保持高对比度才能被识别，因此这里固定黑白，
 * 不跟随主题色 —— 属于功能性图形，不走设计系统的语义色约束。
 */

/** 纠错等级：M（中等，约 15% 可恢复） */
const ECC_FORMAT_BITS = 0b00

/** 每个版本的纠错码字数（等级 M） */
const ECC_CODEWORDS_PER_BLOCK = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28
]

/** 每个版本的纠错块数量（等级 M） */
const NUM_ERROR_CORRECTION_BLOCKS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49
]

const MIN_VERSION = 1
const MAX_VERSION = 40

/** 二维码矩阵 */
export interface QrMatrix {
  /** 边长（模块数） */
  size: number
  /** true = 黑点 */
  modules: boolean[][]
}

/** 计算某版本的数据区模块总数 */
function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (version >= 7) {
      result -= 36
    }
  }
  return result
}

/** 某版本的数据码字数 */
function getNumDataCodewords(version: number): number {
  return (
    Math.floor(getNumRawDataModules(version) / 8)
    - ECC_CODEWORDS_PER_BLOCK[version]! * NUM_ERROR_CORRECTION_BLOCKS[version]!
  )
}

/** 某版本的字符计数位宽（字节模式） */
function getCharCountBits(version: number): number {
  return version <= 9 ? 8 : 16
}

/** 某版本的对齐图案坐标 */
function getAlignmentPatternPositions(version: number): number[] {
  if (version === 1) {
    return []
  }

  const numAlign = Math.floor(version / 7) + 2
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2
  const result: number[] = [6]

  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos)
  }

  return result
}

/* ── GF(256) 运算 ── */

function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

/** 生成多项式（degree 次） */
function rsComputeDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1

  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j]!, root)
      if (j + 1 < result.length) {
        result[j]! ^= result[j + 1]!
      }
    }
    root = gfMultiply(root, 0x02)
  }

  return result
}

/** 计算余数（纠错码字） */
function rsComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)

  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    divisor.forEach((coef, index) => {
      result[index] = result[index]! ^ gfMultiply(coef, factor)
    })
  }

  return result
}

/* ── 编码 ── */

class BitBuffer {
  readonly bits: number[] = []

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1)
    }
  }

  get length(): number {
    return this.bits.length
  }
}

/** 选择能容纳数据的最小版本 */
function chooseVersion(byteLength: number): number {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
    const capacityBits = getNumDataCodewords(version) * 8
    const requiredBits = 4 + getCharCountBits(version) + byteLength * 8
    if (capacityBits >= requiredBits) {
      return version
    }
  }

  throw new Error('内容过长，无法生成二维码')
}

/** 生成数据码字（已含纠错码字，按规范交错） */
function buildCodewords(bytes: number[], version: number): number[] {
  const buffer = new BitBuffer()
  buffer.push(0b0100, 4)
  buffer.push(bytes.length, getCharCountBits(version))
  for (const byte of bytes) {
    buffer.push(byte, 8)
  }

  const dataCapacityBits = getNumDataCodewords(version) * 8

  // 结束符（最多 4 位）
  const terminator = Math.min(4, dataCapacityBits - buffer.length)
  buffer.push(0, terminator)

  // 补齐到字节边界
  while (buffer.length % 8 !== 0) {
    buffer.push(0, 1)
  }

  const dataCodewords: number[] = []
  for (let i = 0; i < buffer.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | buffer.bits[i + j]!
    }
    dataCodewords.push(byte)
  }

  // 交替填充字节
  for (let pad = 0xec; dataCodewords.length < getNumDataCodewords(version); pad ^= 0xec ^ 0x11) {
    dataCodewords.push(pad)
  }

  // 分块（按规范：每块 = 总码字 / 块数，短块少 1 个数据码字）
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version]!
  const eccLen = ECC_CODEWORDS_PER_BLOCK[version]!
  const totalCodewords = Math.floor(getNumRawDataModules(version) / 8)
  const numShortBlocks = numBlocks - (totalCodewords % numBlocks)
  const shortBlockLen = Math.floor(totalCodewords / numBlocks)

  const blocks: { data: number[], ecc: number[] }[] = []
  const divisor = rsComputeDivisor(eccLen)
  let offset = 0

  for (let i = 0; i < numBlocks; i += 1) {
    const dataLen = shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1)
    const data = dataCodewords.slice(offset, offset + dataLen)
    offset += dataLen
    const ecc = rsComputeRemainder(data, divisor)
    blocks.push({ data, ecc })
  }

  // 交错输出：先交错数据码字，再交错纠错码字
  const result: number[] = []
  const maxDataLen = shortBlockLen - eccLen + 1
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) {
        result.push(block.data[i]!)
      }
    }
  }
  for (let i = 0; i < eccLen; i += 1) {
    for (const block of blocks) {
      result.push(block.ecc[i]!)
    }
  }

  return result
}

/* ── 矩阵绘制 ── */

class MatrixBuilder {
  readonly size: number
  readonly modules: boolean[][]
  readonly isFunction: boolean[][]

  constructor(version: number) {
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
  }

  setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark
    this.isFunction[y]![x] = true
  }

  drawFinder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunction(xx, yy, dist !== 2 && dist !== 4)
        }
      }
    }
  }

  drawAlignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }

  drawFormatBits(maskPattern: number): void {
    const data = (ECC_FORMAT_BITS << 3) | maskPattern
    let rem = data
    for (let i = 0; i < 10; i += 1) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    }
    const bits = ((data << 10) | rem) ^ 0x5412

    const bit = (index: number) => ((bits >>> index) & 1) !== 0

    for (let i = 0; i <= 5; i += 1) {
      this.setFunction(8, i, bit(i))
    }
    this.setFunction(8, 7, bit(6))
    this.setFunction(8, 8, bit(7))
    this.setFunction(7, 8, bit(8))
    for (let i = 9; i < 15; i += 1) {
      this.setFunction(14 - i, 8, bit(i))
    }

    for (let i = 0; i < 8; i += 1) {
      this.setFunction(this.size - 1 - i, 8, bit(i))
    }
    for (let i = 8; i < 15; i += 1) {
      this.setFunction(8, this.size - 15 + i, bit(i))
    }

    this.setFunction(8, this.size - 8, true)
  }

  drawVersion(version: number): void {
    if (version < 7) {
      return
    }

    let rem = version
    for (let i = 0; i < 12; i += 1) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    }
    const bits = (version << 12) | rem

    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) !== 0
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFunction(a, b, dark)
      this.setFunction(b, a, dark)
    }
  }

  drawFunctionPatterns(version: number): void {
    for (let i = 0; i < this.size; i += 1) {
      this.setFunction(6, i, i % 2 === 0)
      this.setFunction(i, 6, i % 2 === 0)
    }

    this.drawFinder(3, 3)
    this.drawFinder(this.size - 4, 3)
    this.drawFinder(3, this.size - 4)

    const positions = getAlignmentPatternPositions(version)
    const count = positions.length
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < count; j += 1) {
        const isFinderCorner = (i === 0 && j === 0)
          || (i === 0 && j === count - 1)
          || (i === count - 1 && j === 0)
        if (!isFinderCorner) {
          this.drawAlignment(positions[i]!, positions[j]!)
        }
      }
    }

    this.drawFormatBits(0)
    this.drawVersion(version)
  }

  drawCodewords(codewords: number[]): void {
    let i = 0

    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right = 5
      }

      for (let vert = 0; vert < this.size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert

          if (!this.isFunction[y]![x] && i < codewords.length * 8) {
            this.modules[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0
            i += 1
          }
        }
      }
    }
  }

  applyMask(maskPattern: number): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.isFunction[y]![x]) {
          continue
        }
        if (maskAt(maskPattern, x, y)) {
          this.modules[y]![x] = !this.modules[y]![x]
        }
      }
    }
  }
}

/** 8 种掩码图案 */
function maskAt(maskPattern: number, x: number, y: number): boolean {
  switch (maskPattern) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      return false
  }
}

/** 掩码惩罚分（N1~N4） */
function penaltyScore(matrix: QrMatrix): number {
  const { size, modules } = matrix
  let result = 0

  const runHistory = [0, 0, 0, 0, 0, 0, 0]

  /** 把刚结束的连续段记入历史（首尾按浅色边界处理） */
  const addRunHistory = (runLength: number) => {
    let length = runLength
    if (runHistory[0] === 0) {
      length += size
    }
    runHistory.pop()
    runHistory.unshift(length)
  }

  /** 统计 1:1:3:1:1 特征（前后需有 4 倍宽的浅色区） */
  const countFinderLike = () => {
    const n = runHistory[1]!
    const core = n > 0
      && runHistory[2] === n
      && runHistory[3] === n * 3
      && runHistory[4] === n
      && runHistory[5] === n

    const before = core && runHistory[0]! >= n * 4 && runHistory[6]! >= n ? 1 : 0
    const after = core && runHistory[6]! >= n * 4 && runHistory[0]! >= n ? 1 : 0

    return before + after
  }

  /** 收尾：补上末尾的连续段并统计特征 */
  const terminateAndCount = (runColor: boolean, runLength: number) => {
    let length = runLength
    if (runColor) {
      addRunHistory(length)
      length = 0
    }
    length += size
    addRunHistory(length)
    return countFinderLike()
  }

  // N1 + N3：逐行、逐列扫描
  for (let y = 0; y < size; y += 1) {
    let runColor = false
    let runLength = 0
    runHistory.fill(0)

    for (let x = 0; x < size; x += 1) {
      if (modules[y]![x] === runColor) {
        runLength += 1
        if (runLength === 5) {
          result += 3
        } else if (runLength > 5) {
          result += 1
        }
      } else {
        addRunHistory(runLength)
        if (!runColor) {
          result += countFinderLike() * 40
        }
        runColor = modules[y]![x]!
        runLength = 1
      }
    }

    result += terminateAndCount(runColor, runLength) * 40
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = false
    let runLength = 0
    runHistory.fill(0)

    for (let y = 0; y < size; y += 1) {
      if (modules[y]![x] === runColor) {
        runLength += 1
        if (runLength === 5) {
          result += 3
        } else if (runLength > 5) {
          result += 1
        }
      } else {
        addRunHistory(runLength)
        if (!runColor) {
          result += countFinderLike() * 40
        }
        runColor = modules[y]![x]!
        runLength = 1
      }
    }

    result += terminateAndCount(runColor, runLength) * 40
  }

  // N2：2×2 同色块
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y]![x]
      if (color === modules[y]![x + 1] && color === modules[y + 1]![x] && color === modules[y + 1]![x + 1]) {
        result += 3
      }
    }
  }

  // N4：黑白比例偏离 50%
  let dark = 0
  for (const row of modules) {
    for (const cell of row) {
      if (cell) {
        dark += 1
      }
    }
  }
  const total = size * size
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
  result += k * 10

  return result
}

/**
 * 生成二维码矩阵。
 *
 * @param text 内容
 * @param options.maskPattern 指定掩码（0-7），默认 -1 表示自动择优
 */
export function encodeQr(text: string, options: { maskPattern?: number } = {}): QrMatrix {
  const bytes = new TextEncoder().encode(text)
  const version = chooseVersion(bytes.length)
  const codewords = buildCodewords([...bytes], version)

  const builder = new MatrixBuilder(version)
  builder.drawFunctionPatterns(version)
  builder.drawCodewords(codewords)

  const fixedMask = options.maskPattern ?? -1
  if (fixedMask >= 0) {
    builder.applyMask(fixedMask)
    builder.drawFormatBits(fixedMask)
    return { size: builder.size, modules: builder.modules }
  }

  // 8 种掩码择优
  let bestMask = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let mask = 0; mask < 8; mask += 1) {
    builder.applyMask(mask)
    builder.drawFormatBits(mask)

    const score = penaltyScore(builder)
    if (score < bestScore) {
      bestScore = score
      bestMask = mask
    }

    // 还原掩码，尝试下一种
    builder.applyMask(mask)
  }

  builder.applyMask(bestMask)
  builder.drawFormatBits(bestMask)

  return { size: builder.size, modules: builder.modules }
}

/**
 * 生成二维码的路径数据（供页面直接渲染 SVG，避免 v-html）。
 *
 * @param text 二维码内容（通常是订阅链接）
 */
export function renderQrPath(text: string): { size: number, total: number, path: string } {
  const matrix = encodeQr(text)
  const quiet = 4
  const total = matrix.size + quiet * 2

  const parts: string[] = []
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y]![x]) {
        parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
      }
    }
  }

  return { size: matrix.size, total, path: parts.join('') }
}

/**
 * 生成二维码 SVG。
 *
 * @param text 二维码内容（通常是订阅链接）
 * @param options.size 画布边长（px）
 */
export function renderQrSvg(text: string, options: { size?: number } = {}): string {
  const { total, path } = renderQrPath(text)
  const size = options.size ?? 256

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#000000"/>`,
    '</svg>'
  ].join('')
}
