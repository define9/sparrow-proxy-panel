'use client'

import { useMemo } from 'react'
import { cn } from 'cn'

const SIZE = 25
const FINDER_ZONES: Array<[number, number]> = [
  [0, 0],
  [0, SIZE - 7],
  [SIZE - 7, 0]
]

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function finderCell(row: number, col: number): boolean | null {
  for (const [rowStart, colStart] of FINDER_ZONES) {
    if (row < rowStart || row > rowStart + 7 || col < colStart || col > colStart + 7) continue
    const localRow = row - rowStart
    const localCol = col - colStart
    // 定位图案与数据区之间的留白
    if (localRow === 7 || localCol === 7) return false
    const ring = localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6
    const core = localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4
    return ring || core
  }
  return null
}

/** 演示用二维码占位图：由字符串确定性生成，不编码真实内容 */
export function QrPreview({ value, className }: { value: string; className?: string }) {
  const cells = useMemo(() => {
    let seed = hashString(value)
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }

    return Array.from({ length: SIZE * SIZE }, (_, index) => {
      const row = Math.floor(index / SIZE)
      const col = index % SIZE
      const fixed = finderCell(row, col)
      if (fixed !== null) return fixed
      return next() > 0.52
    })
  }, [value])

  return (
    <div
      role="img"
      aria-label="订阅链接二维码（演示占位图，不编码真实内容）"
      className={cn('w-full max-w-56 rounded-xl bg-background p-3 ring-1 ring-border', className)}
    >
      <div
        className="grid aspect-square gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {cells.map((on, index) => (
          <span
            key={index}
            className={cn('aspect-square rounded-[1px]', on ? 'bg-foreground' : 'bg-transparent')}
          />
        ))}
      </div>
    </div>
  )
}
