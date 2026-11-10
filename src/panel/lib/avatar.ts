/**
 * 本地生成的头像：不请求任何第三方服务，按种子（邮箱/用户名）稳定生成渐变色 + 首字母。
 * 纯函数，服务端/客户端都能用。
 */

/** FNV-1a 32 位，稳定且分布均匀；不用 crypto 以便客户端同步调用 */
function hashSeed(seed: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function avatarSeed(input: { username?: string | null; email?: string | null; id?: string | null }) {
  return (input.email || input.username || input.id || '?').trim().toLowerCase()
}

/** 取 1~2 个字符做首字母；ASCII 按词取首字母，CJK 等直接取前两字 */
export function avatarInitials(name?: string | null) {
  const value = (name ?? '').trim()
  if (!value) return '?'

  const words = value.split(/[\s._\-@]+/).filter(Boolean)
  const ascii = /^[\x20-\x7e]+$/.test(value)

  if (ascii && words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  if (ascii) {
    return value.slice(0, 2).toUpperCase()
  }
  return Array.from(value).slice(0, 2).join('')
}

/** 由种子推导出稳定的渐变背景；亮度固定在可读范围，白字始终有对比度 */
export function avatarGradient(seed: string) {
  const hash = hashSeed(seed)
  const hue = hash % 360
  const hue2 = (hue + 28 + (hash >> 9) % 40) % 360
  return `linear-gradient(135deg, oklch(0.62 0.17 ${hue}), oklch(0.48 0.15 ${hue2}))`
}
