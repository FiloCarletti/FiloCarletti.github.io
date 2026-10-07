// Wizz Air: API degli orari del sito (timetable), JSON pubblico. Serve il numero di versione dell'API, che si legge
// da https://www.wizzair.com/buildnumber. La ricerca dettagliata (/search/search) è protetta (Kasada): non si usa.
// Il timetable dà, per giorno, il prezzo più basso e gli orari di partenza (non quelli di arrivo).
// Attenzione: Wizz ragiona per città (chiedendo BGY può rispondere con MXP): si tengono solo gli aeroporti richiesti.
import { HttpError, UA, fineMese, jitter, mesi, request } from './common.mjs'

let base = null
async function api() {
  if (base) return base
  // La pagina risponde 404 ma contiene comunque l'indirizzo dell'API (serve accept: text/html).
  const res = await fetch('https://www.wizzair.com/buildnumber', {
    headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'it-IT,it;q=0.9' },
    signal: AbortSignal.timeout(30000),
  })
  const m = (await res.text()).match(/https:\/\/be\.wizzair\.com\/[\d.]+/)
  if (!m) throw new Error('Wizz Air: numero di versione dell\'API non trovato')
  base = m[0]
  return base
}

/**
 * Prezzo più basso per giorno della tratta o→d tra `da` e `a`.
 * → { giorni: Map(data → { data, partenze: ['HH:MM', …], prezzo }), richieste }
 */
export async function minimiGiornalieri(o, d, da, a) {
  const url = `${await api()}/Api/search/timetable`
  const giorni = new Map()
  let richieste = 0
  for (const mese of mesi(da, a)) {
    const from = mese < da ? da : mese
    const to = fineMese(mese) > a ? a : fineMese(mese)
    if (from > to) continue
    richieste++
    let res
    try {
      res = await request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://www.wizzair.com', referer: 'https://www.wizzair.com/' },
        body: JSON.stringify({
          flightList: [{ departureStation: o, arrivalStation: d, from, to }],
          priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0,
        }),
      })
    } catch (e) {
      // InvalidMarket = Wizz non vola su questa tratta
      if (e instanceof HttpError && e.status === 400 && /InvalidMarket|InvalidStation/i.test(e.body)) return { giorni, richieste }
      throw e
    }
    for (const f of res?.outboundFlights ?? []) {
      if (f.departureStation !== o || f.arrivalStation !== d) continue
      if (f.priceType !== 'price' || !f.price?.amount) continue // 'checkPrice' = prezzo non disponibile
      const data = f.departureDate.slice(0, 10)
      if (data < da || data > a) continue
      giorni.set(data, { data, partenze: (f.departureDates ?? []).map((x) => x.slice(11, 16)).sort(), prezzo: f.price.amount })
    }
    await jitter(300, 700)
  }
  return { giorni, richieste }
}
