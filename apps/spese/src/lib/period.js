// Date in formato 'YYYY-MM-DD' (locali) e periodi di visualizzazione.
// Le date ISO si confrontano come stringhe: niente fusi orari di mezzo.

export const parseISO = (s) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => toISO(new Date())
export const addDays = (iso, n) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
/** Lunedì della settimana di `iso`. */
export const weekStart = (iso) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toISO(d)
}
const addMonths = (iso, n) => {
  const d = parseISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

export const SPANS = [
  { key: 'day', label: 'Giorno' },
  { key: 'week', label: 'Settimana' },
  { key: 'month', label: 'Mese' },
  { key: 'year', label: 'Anno' },
  { key: 'all', label: 'Sempre' },
]

const fDay = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fDayShort = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
const fMonth = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
const fMonthShort = new Intl.DateTimeFormat('it-IT', { month: 'short' })
const fMonthYear = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })
const fWeekday = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** Intervallo [from, to] (estremi inclusi, null = illimitato) del periodo che contiene `anchor`. */
export function rangeOf(span, anchor) {
  switch (span) {
    case 'day': return { from: anchor, to: anchor }
    case 'week': { const from = weekStart(anchor); return { from, to: addDays(from, 6) } }
    case 'month': { const from = anchor.slice(0, 7) + '-01'; return { from, to: addDays(addMonths(from, 1), -1) } }
    case 'year': return { from: anchor.slice(0, 4) + '-01-01', to: anchor.slice(0, 4) + '-12-31' }
    default: return { from: null, to: null }
  }
}

/** Sposta l'ancora di un periodo avanti (+1) o indietro (-1). */
export function shiftAnchor(span, anchor, dir) {
  switch (span) {
    case 'day': return addDays(anchor, dir)
    case 'week': return addDays(anchor, 7 * dir)
    case 'month': return addMonths(anchor, dir)
    case 'year': return `${Number(anchor.slice(0, 4)) + dir}-01-01`
    default: return anchor
  }
}

export function rangeLabel(span, anchor) {
  const { from, to } = rangeOf(span, anchor)
  const t = today()
  switch (span) {
    case 'day':
      if (anchor === t) return 'Oggi'
      if (anchor === addDays(t, -1)) return 'Ieri'
      return fDay.format(parseISO(anchor))
    case 'week':
      if (from === weekStart(t)) return 'Questa settimana'
      return `${fDayShort.format(parseISO(from))} – ${fDayShort.format(parseISO(to))}${to.slice(0, 4) !== t.slice(0, 4) ? ' ' + to.slice(0, 4) : ''}`
    case 'month': return cap(fMonth.format(parseISO(from)))
    case 'year': return from.slice(0, 4)
    default: return 'Da sempre'
  }
}

/** Il periodo contiene oggi? (per disabilitare "avanti") */
export const isCurrent = (span, anchor) => {
  const { to } = rangeOf(span, anchor)
  return !to || to >= today()
}

export const inRange = (iso, { from, to }) => (!from || iso >= from) && (!to || iso <= to)

/* ---------- serie storiche ("nel tempo") ---------- */

export const bucketKey = (iso, gran) =>
  gran === 'day' ? iso : gran === 'week' ? weekStart(iso) : gran === 'month' ? iso.slice(0, 7) : iso.slice(0, 4)

export function bucketLabel(key, gran) {
  if (gran === 'day') return fDayShort.format(parseISO(key))
  if (gran === 'week') return fDayShort.format(parseISO(key))
  if (gran === 'month') return fMonthYear.format(parseISO(key + '-01'))
  return key
}

/**
 * Colonne del grafico "nel tempo" per il periodo scelto:
 * giorno → ultimi 14 giorni, settimana → ultime 12, mese → ultimi 12 mesi,
 * anno → i 12 mesi dell'anno, sempre → mesi (o anni, se i dati coprono più di 3 anni).
 */
export function trendBuckets(span, anchor, firstISO) {
  const keys = []
  let gran
  if (span === 'day') {
    gran = 'day'
    for (let i = 13; i >= 0; i--) keys.push(addDays(anchor, -i))
  } else if (span === 'week') {
    gran = 'week'
    const w = weekStart(anchor)
    for (let i = 11; i >= 0; i--) keys.push(addDays(w, -7 * i))
  } else if (span === 'month') {
    gran = 'month'
    for (let i = 11; i >= 0; i--) keys.push(addMonths(anchor, -i).slice(0, 7))
  } else if (span === 'year') {
    gran = 'month'
    for (let m = 1; m <= 12; m++) keys.push(`${anchor.slice(0, 4)}-${String(m).padStart(2, '0')}`)
  } else {
    const first = firstISO ?? today()
    const t = today()
    const years = Number(t.slice(0, 4)) - Number(first.slice(0, 4))
    if (years >= 3) {
      gran = 'year'
      for (let y = Number(first.slice(0, 4)); y <= Number(t.slice(0, 4)); y++) keys.push(String(y))
    } else {
      gran = 'month'
      for (let m = first.slice(0, 7) + '-01'; m <= t; m = addMonths(m, 1)) keys.push(m.slice(0, 7))
    }
  }
  return { gran, keys }
}

export const fmtDayHeader = (iso) => {
  const t = today()
  if (iso === t) return 'Oggi'
  if (iso === addDays(t, -1)) return 'Ieri'
  const s = cap(fWeekday.format(parseISO(iso)))
  return iso.slice(0, 4) === t.slice(0, 4) ? s : `${s} ${iso.slice(0, 4)}`
}
export const fmtShortDate = (iso) => fDayShort.format(parseISO(iso)) + (iso.slice(0, 4) !== today().slice(0, 4) ? ` ${iso.slice(2, 4)}` : '')
export const monthShort = (iso) => fMonthShort.format(parseISO(iso))

/**
 * Gruppo "relativo" di una data per l'elenco movimenti: In programma, Oggi, Ieri, Questa settimana,
 * Settimana scorsa, Questo mese, Mese scorso, poi mese per mese ("Agosto", "Agosto 2025").
 */
export function relativeBucket(iso, t = today()) {
  if (iso > t) return { key: 'future', label: 'In programma' }
  if (iso === t) return { key: 'today', label: 'Oggi', single: true }
  if (iso === addDays(t, -1)) return { key: 'yesterday', label: 'Ieri', single: true }
  const ws = weekStart(t)
  if (iso >= ws) return { key: 'week', label: 'Questa settimana' }
  if (iso >= addDays(ws, -7)) return { key: 'lastweek', label: 'Settimana scorsa' }
  const ms = t.slice(0, 7) + '-01'
  if (iso >= ms) return { key: 'month', label: 'Questo mese' }
  if (iso >= addMonths(ms, -1)) return { key: 'lastmonth', label: 'Mese scorso' }
  const m = iso.slice(0, 7)
  const name = cap(fMonth.format(parseISO(m + '-01')))
  return { key: m, label: iso.slice(0, 4) === t.slice(0, 4) ? name.replace(/\s\d{4}$/, '') : name }
}
