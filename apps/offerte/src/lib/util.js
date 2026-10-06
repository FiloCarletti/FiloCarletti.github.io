import { fmtEuro } from '@shared'

/** Solo link http(s): gli URL arrivano anche da import e da Claude. */
export const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null)

/** "1,29" | "1.29" | 1.29 → 1.29; vuoto → null; non numerico → NaN */
export function parseNum(v) {
  if (v == null || String(v).trim() === '') return null
  if (typeof v === 'number') return v
  return Number(String(v).replace(/\s|€/g, '').replace(',', '.'))
}
/** Numero → testo per i campi dei moduli ("1,29"). */
export const numText = (v) => (v == null ? '' : String(v).replace('.', ','))

/** "1,41 €/kg" */
export const fmtUnit = (prezzo, unita) => `${fmtEuro(prezzo)}/${unita === 'pz' ? 'pz' : unita}`
