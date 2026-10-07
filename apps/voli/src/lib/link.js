// Link per vedere o prenotare un volo sul sito della fonte. Modulo puro (usato anche da scripts/voli).

/** Pagina dei risultati di Google Flights (andata e ritorno, o sola andata senza `ritorno`). */
export function googleUrl(o, d, data, ritorno = null, { hl = 'it' } = {}) {
  const q = ritorno ? `Flights to ${d} from ${o} on ${data} through ${ritorno}` : `Flights to ${d} from ${o} on ${data} one way`
  return `https://www.google.com/travel/flights?hl=${hl}&gl=IT&curr=EUR&q=${encodeURIComponent(q).replace(/%20/g, '+')}`
}

function ryanair(o, d, out, back, adulti) {
  const q = new URLSearchParams({
    adults: adulti, teens: 0, children: 0, infants: 0, dateOut: out, dateIn: back ?? '', isConnectedFlight: 'false',
    discount: 0, isReturn: back ? 'true' : 'false', promoCode: '', originIata: o, destinationIata: d,
  })
  return `https://www.ryanair.com/it/it/trip/flights/select?${q}`
}
const wizz = (o, d, out, back, adulti) =>
  `https://wizzair.com/it-it/booking/select-flight/${o}/${d}/${out}/${back ?? 'null'}/${adulti}/0/0/null`

/** Link di una tratta di sola andata. */
export function linkTratta(t, adulti = 1) {
  if (t.fonte === 'ryanair') return ryanair(t.origine, t.destinazione, t.data, null, adulti)
  if (t.fonte === 'wizz') return wizz(t.origine, t.destinazione, t.data, null, adulti)
  return googleUrl(t.origine, t.destinazione, t.data)
}

/**
 * Link di una soluzione (vedi combina.js): uno solo se si prenota insieme (stessa compagnia, rientro allo stesso
 * aeroporto), altrimenti uno per tratta. → [{ label, url }]
 */
export function linkSoluzione(s, adulti = 1) {
  const name = { ryanair: 'Ryanair', wizz: 'Wizz Air', google: 'Google Flights' }
  if (s.tipo === 'ar') return [{ label: name[s.fonte] ?? s.fonte, url: s.url || googleUrl(s.origine, s.destinazione, s.data, s.data_ritorno) }]
  if (s.tipo === 'sola') {
    const url = s.url || linkTratta({ ...s.andata, fonte: s.fonte, origine: s.origine, destinazione: s.destinazione, data: s.data }, adulti)
    return [{ label: name[s.fonte] ?? s.fonte, url }]
  }
  const a = s.andata
  const b = s.ritorno
  if (a.fonte === b.fonte && s.ritorno_a === s.origine && (a.fonte === 'ryanair' || a.fonte === 'wizz')) {
    const f = a.fonte === 'ryanair' ? ryanair : wizz
    return [{ label: name[a.fonte], url: f(s.origine, s.destinazione, s.data, s.data_ritorno, adulti) }]
  }
  return [
    { label: `Andata · ${name[a.fonte] ?? a.fonte}`, url: linkTratta(a, adulti) },
    { label: `Ritorno · ${name[b.fonte] ?? b.fonte}`, url: linkTratta(b, adulti) },
  ]
}
