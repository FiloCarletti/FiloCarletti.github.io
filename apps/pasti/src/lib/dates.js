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
const longFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
/** "gio 19 nov" */
export const fmtDay = (iso) => dayFmt.format(parseISO(iso))
/** "giovedì 19 novembre" */
export const fmtLong = (iso) => longFmt.format(parseISO(iso))
/** "19 nov" */
export const fmtShort = (iso) => shortFmt.format(parseISO(iso))

/** Lunedì della settimana di `iso`. */
export const mondayOf = (iso) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toISO(d)
}
