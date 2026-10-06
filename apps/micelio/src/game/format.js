import { BLD, RES } from './engine.js'

const SUFFIX = ['', ' K', ' M', ' G', ' T', ' P', ' E', ' Z', ' Y']
const it = (n, digits) => n.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** 0,5 · 12 · 1,23 K · 45,6 M · 1,2e30 */
export function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a < 10) return it(n, a < 1 && a > 0 ? 2 : 1)
  if (a < 1000) return it(Math.floor(n), 0)
  const k = Math.floor(Math.log10(a) / 3)
  if (k >= SUFFIX.length) return n.toExponential(2).replace('.', ',').replace('e+', 'e')
  const v = n / 1000 ** k
  return it(v, Math.abs(v) < 100 ? 2 : 1) + SUFFIX[k]
}

export function fmtRate(n) {
  if (!n || Math.abs(n) < 1e-6) return '0/s'
  return (n > 0 ? '+' : '−') + fmt(Math.abs(n)) + '/s'
}

export const fmtPct = (x) => `${it(x * 100, 0)}%`

/** 45 s · 12 min · 3 h 20 min · 2 g 5 h */
export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} g ${h % 24} h` : `${d} g`
}

/** Descrizione leggibile di un effetto. */
export function fxText(f) {
  const pct = (x) => `${x >= 1 ? '+' : '−'}${it(Math.abs(x - 1) * 100, 0)}%`
  switch (f.t) {
    case 'all': return `Produzione ${f.x >= 2 ? `×${it(f.x, 1)}` : pct(f.x)}`
    case 'b': return `${BLD[f.id]?.name ?? f.id} ${f.x >= 2 ? `×${it(f.x, 1)}` : pct(f.x)}`
    case 'click': return `Tocco ×${it(f.x, 1)}`
    case 'cap': return `Depositi ×${it(f.x, 1)}`
    case 'spore': return `Spore ${pct(f.x)}`
    case 'season': return `Malus delle stagioni −${it(f.x * 100, 0)}%`
    case 'cost': return `Strutture ${pct(f.x)} di costo`
    default: return ''
  }
}

export const resIcon = (r) => RES[r]?.icon ?? '?'
export const resName = (r) => RES[r]?.name ?? r
