// Calcoli puri su sessioni e voci. Nessun accesso a Supabase qui.

const n = (v) => (v == null || v === '' ? null : Number(v))

/** Kg sollevati: serie × ripetizioni × peso (solo esercizi a ripetizioni con carico). */
export function volume(v, unita = v.esercizio?.unita) {
  if (unita !== 'rip') return 0
  return (n(v.serie) ?? 0) * (n(v.ripetizioni) ?? 0) * (n(v.peso_kg) ?? 0)
}

/** Ripetizioni totali (solo esercizi a ripetizioni). */
export function reps(v, unita = v.esercizio?.unita) {
  if (unita !== 'rip') return 0
  return (n(v.serie) ?? 0) * (n(v.ripetizioni) ?? 0)
}

/** 1RM stimato (Epley), sensato fino a ~12 ripetizioni. */
export function e1rm(v) {
  const p = n(v.peso_kg), r = n(v.ripetizioni)
  if (!p || !r || r > 12) return null
  return r === 1 ? p : p * (1 + r / 30)
}

/**
 * Valore "migliore" di una voce, usato per i record personali:
 * - con carico: peso (a parità di peso contano le ripetizioni)
 * - corpo libero / secondi: ripetizioni o secondi per serie
 * - cardio: distanza, altrimenti durata
 */
export function bestScore(v, unita) {
  const p = n(v.peso_kg), r = n(v.ripetizioni) ?? 0
  if (unita === 'cardio') return n(v.distanza_km) ?? n(v.durata_min)
  if (unita === 'rip' && p > 0) return p * 1000 + r
  return r || null
}

/** Breve descrizione di una voce: "4 × 6 · 30 kg". */
export function fmtVoce(v, unita = v.esercizio?.unita) {
  const f = (x) => fmtNum(n(x))
  if (unita === 'cardio') {
    const parts = []
    if (n(v.durata_min)) parts.push(`${f(v.durata_min)} min`)
    if (n(v.distanza_km)) parts.push(`${f(v.distanza_km)} km`)
    return parts.join(' · ') || '—'
  }
  const sr = [n(v.serie), n(v.ripetizioni)]
  let s = sr[0] && sr[1] != null ? `${sr[0]} × ${f(sr[1])}` : sr[1] != null ? f(sr[1]) : '—'
  if (unita === 'sec') s += '″'
  if (unita === 'rip') s += n(v.peso_kg) > 0 ? ` · ${f(v.peso_kg)} kg` : ' · corpo libero'
  return s
}

const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
export const fmtNum = (v) => (v == null || Number.isNaN(v) ? '—' : nf.format(v))
export function fmtKg(v) {
  if (v == null) return '—'
  return v >= 10000 ? `${nf.format(v / 1000)} t` : `${nf.format(Math.round(v))} kg`
}
export function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${nf.format(v * 100)}%`
}

/* ---------- date ---------- */

/** 'YYYY-MM-DD' → Date locale a mezzanotte. */
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const DAY = 86400000
export function daysBetween(a, b) {
  return Math.round((b - a) / DAY)
}
/** Lunedì della settimana di `d`. */
export function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const shortDate = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
const longDate = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
export const fmtShort = (iso) => shortDate.format(typeof iso === 'string' ? parseISO(iso) : iso)
export const fmtLong = (iso) => longDate.format(parseISO(iso))
export const fmtMonth = (iso) => monthFmt.format(parseISO(iso))

/** "oggi", "ieri", "3 giorni fa". */
export function fmtAgo(iso) {
  const d = daysBetween(parseISO(iso), parseISO(toISO(new Date())))
  if (d <= 0) return 'oggi'
  if (d === 1) return 'ieri'
  return `${d} giorni fa`
}
