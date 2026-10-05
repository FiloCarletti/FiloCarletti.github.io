// Importi: parsing tollerante (formati italiani e inglesi) e formattazione.
const cache = new Map()
export function fmtMoney(v, valuta = 'EUR', { sign = false } = {}) {
  if (v == null || Number.isNaN(v)) return '—'
  const key = `${valuta}|${sign}`
  if (!cache.has(key)) {
    try {
      cache.set(key, new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta, signDisplay: sign ? 'exceptZero' : 'auto' }))
    } catch {
      cache.set(key, new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: sign ? 'exceptZero' : 'auto' }))
    }
  }
  return cache.get(key).format(v)
}
/** Importo compatto per assi e riquadri piccoli: 1.234 € → "1,2k". */
export function fmtCompact(v) {
  const a = Math.abs(v)
  if (a >= 1e6) return (v / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'M'
  if (a >= 1e4) return Math.round(v / 1e3).toLocaleString('it-IT') + 'k'
  if (a >= 1e3) return (v / 1e3).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k'
  return Math.round(v).toLocaleString('it-IT')
}
export const fmtPct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('it-IT', { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`)

/**
 * "1.234,56" · "1,234.56" · "-12,5" · "€ 12.50" · "(12,00)" → numero; null se non è un importo.
 * Con un solo separatore: la virgola è sempre decimale; il punto è delle migliaia solo
 * nella forma "1.234" / "12.345.678".
 */
export function parseAmount(raw) {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  s = s.replace(/[\s '€$£]|EUR|USD|GBP/gi, '')
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1) }
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) }
  if (!/^[\d.,]+$/.test(s)) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot > -1 && lastComma > -1) {
    const dec = lastDot > lastComma ? '.' : ','
    const thou = dec === '.' ? ',' : '.'
    s = s.split(thou).join('').replace(dec, '.')
  } else if (lastComma > -1) {
    if (s.split(',').length > 2) s = s.split(',').join('')
    else s = s.replace(',', '.')
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.split('.').join('')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round((neg ? -n : n) * 100) / 100
}
