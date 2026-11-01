/** 证书解析占位实现：不引第三方库，直接从 PEM 的 DER 里扫 UTCTime / GeneralizedTime */

function parseAsn1Time(tag: number, text: string): Date | null {
  const digits = text.replace(/Z$/i, '')
  if (!/^\d+$/.test(digits)) return null

  let year: number
  let rest: string
  if (tag === 0x17) {
    // UTCTime: YYMMDDHHMMSS
    if (digits.length < 12) return null
    const yy = Number(digits.slice(0, 2))
    year = yy >= 50 ? 1900 + yy : 2000 + yy
    rest = digits.slice(2, 12)
  } else {
    // GeneralizedTime: YYYYMMDDHHMMSS
    if (digits.length < 14) return null
    year = Number(digits.slice(0, 4))
    rest = digits.slice(4, 14)
  }

  const month = Number(rest.slice(0, 2))
  const day = Number(rest.slice(2, 4))
  const hour = Number(rest.slice(4, 6))
  const minute = Number(rest.slice(6, 8))
  const second = Number(rest.slice(8, 10))
  if (
    year < 1990 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 60
  ) {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return Number.isNaN(date.getTime()) ? null : date
}

/** 取证书的 notBefore / notAfter（找不到返回 null，由调用方兜底） */
export function parseCertificateValidity(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')

  let der: Buffer
  try {
    der = Buffer.from(base64, 'base64')
  } catch {
    return { notBefore: null, notAfter: null }
  }
  if (der.length < 16) return { notBefore: null, notAfter: null }

  const times: Date[] = []
  for (let i = 0; i < der.length - 2 && times.length < 4; i += 1) {
    const tag = der[i]
    if (tag !== 0x17 && tag !== 0x18) continue
    const length = der[i + 1]
    if (length < 13 || length > 20) continue
    const text = der.subarray(i + 2, i + 2 + length).toString('ascii')
    const parsed = parseAsn1Time(tag, text)
    if (parsed) times.push(parsed)
  }

  return {
    notBefore: times[0] ?? null,
    notAfter: times[1] ?? times[0] ?? null
  }
}

export function daysUntil(date: Date | string | null | undefined) {
  if (!date) return null
  const target = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000)
}
