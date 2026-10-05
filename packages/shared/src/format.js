// Formattazione in italiano.
const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const num = new Intl.NumberFormat('it-IT')
const date = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fmtEuro = (v) => (v == null ? '—' : eur.format(v))
export const fmtNumber = (v) => (v == null ? '—' : num.format(v))
export const fmtDate = (v) => (v ? date.format(new Date(v)) : '—')
export const fmtDateTime = (v) => (v ? dateTime.format(new Date(v)) : '—')
/** 'YYYY-MM-DD' locale, per <input type="date"> */
export const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
