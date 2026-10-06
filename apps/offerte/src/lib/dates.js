// Date in formato 'YYYY-MM-DD' (locali): si confrontano come stringhe, niente fusi orari di mezzo.

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
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000)

const dayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
const shortFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
/** "lun 6 ott" */
export const fmtDay = (iso) => dayFmt.format(parseISO(iso))
/** "6 ott" */
export const fmtShort = (iso) => shortFmt.format(parseISO(iso))

/** Validità di un'offerta rispetto a oggi: testo e tono (per il colore del badge). */
export function validity(o, t = today()) {
  if (o.valido_da > t) {
    const d = daysBetween(t, o.valido_da)
    return { text: d === 1 ? 'da domani' : `dal ${fmtDay(o.valido_da)}`, tone: 'soon' }
  }
  if (o.valido_fino < t) return { text: `scaduta il ${fmtShort(o.valido_fino)}`, tone: 'old' }
  const d = daysBetween(t, o.valido_fino)
  if (d === 0) return { text: 'scade oggi', tone: 'last' }
  if (d === 1) return { text: 'fino a domani', tone: 'last' }
  return { text: `fino a ${fmtDay(o.valido_fino)}`, tone: '' }
}

export const PERIODI = [
  { key: 'oggi', label: 'Oggi' },
  { key: 'domani', label: 'Domani' },
  { key: 'settimana', label: '7 giorni' },
  { key: 'arrivo', label: 'In arrivo' },
  { key: 'tutte', label: 'Tutte' },
]

/** L'offerta è valida nel periodo? */
export function inPeriodo(o, key, t = today()) {
  switch (key) {
    case 'oggi': return o.valido_da <= t && o.valido_fino >= t
    case 'domani': {
      const d = addDays(t, 1)
      return o.valido_da <= d && o.valido_fino >= d
    }
    case 'settimana': return o.valido_da <= addDays(t, 6) && o.valido_fino >= t
    case 'arrivo': return o.valido_da > t
    default: return o.valido_fino >= t
  }
}
