// Ryanair: API delle tariffe del sito (farfnd), JSON pubblico.
//  - cheapestPerDay: il prezzo più basso di ogni giorno di un mese per una tratta (una richiesta al mese);
//  - oneWayFares su un solo giorno con fascia oraria: il migliore tra i voli che rispettano gli orari
//    (cheapestPerDay ignora gli orari). L'API di disponibilità completa invece è bloccata ("Availability declined").
import { HttpError, fineMese, jitter, mesi, oraConGiorni, request } from './common.mjs'

const BASE = 'https://www.ryanair.com/api/farfnd/v4'

/**
 * Prezzo più basso per giorno della tratta o→d tra `da` e `a`.
 * → { giorni: Map(data → { data, partenza, arrivo, prezzo }), richieste }
 * Rotta non operata: mappa vuota (l'API risponde con tutti i giorni "unavailable").
 */
export async function minimiGiornalieri(o, d, da, a) {
  const giorni = new Map()
  let richieste = 0
  for (const mese of mesi(da, a)) {
    if (fineMese(mese) < da) continue
    richieste++
    let data
    try {
      data = await request(`${BASE}/oneWayFares/${o}/${d}/cheapestPerDay?outboundMonthOfDate=${mese}&currency=EUR`)
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 400)) continue // rotta sconosciuta
      throw e
    }
    for (const f of data?.outbound?.fares ?? []) {
      if (f.day < da || f.day > a || f.unavailable || f.soldOut || !f.price?.value || !f.departureDate) continue
      giorni.set(f.day, {
        data: f.day,
        partenza: f.departureDate.slice(11, 16),
        arrivo: oraConGiorni(f.arrivalDate, f.day),
        prezzo: f.price.value,
        volo: '',
      })
    }
    await jitter(200, 500)
  }
  return { giorni, richieste }
}

/** Miglior volo di un giorno nella fascia oraria [dopo, prima] ('HH:MM'). → { … } o null. */
export async function migliorNellaFascia(o, d, data, dopo, prima) {
  const q = new URLSearchParams({
    departureAirportIataCode: o,
    arrivalAirportIataCode: d,
    outboundDepartureDateFrom: data,
    outboundDepartureDateTo: data,
    currency: 'EUR',
    market: 'it-it',
  })
  // Fascia a cavallo della mezzanotte: l'API vuole dalle ≤ alle, quindi si cerca la parte serale.
  const from = dopo || '00:00'
  const to = prima && (!dopo || prima >= dopo) ? prima : '23:59'
  q.set('outboundDepartureTimeFrom', from)
  q.set('outboundDepartureTimeTo', to)
  let res
  try {
    res = await request(`${BASE}/oneWayFares?${q}`)
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 400)) return null
    throw e
  }
  await jitter(200, 450)
  const f = res?.fares?.[0]?.outbound
  if (!f?.price?.value || !f.departureDate?.startsWith(data)) return null
  return {
    data,
    partenza: f.departureDate.slice(11, 16),
    arrivo: oraConGiorni(f.arrivalDate, data),
    prezzo: f.price.value,
    volo: f.flightNumber ?? '',
  }
}
