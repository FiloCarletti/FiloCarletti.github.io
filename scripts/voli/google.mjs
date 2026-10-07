// Google Flights: la pagina dei risultati arriva già con i voli nell'HTML, nelle etichette accessibili (aria-label)
// di ogni risultato: prezzo, compagnia, scali, orari, durata. Basta una richiesta HTTP con il cookie del consenso
// (altrimenti dall'UE si viene rimandati a consent.google.com). Formato non ufficiale: se cambia, il parser non trova
// più voli e lo script lo segnala ("nessun risultato leggibile").
// Per l'andata e ritorno Google dà il prezzo totale e i dettagli dell'andata; il ritorno si sceglie sul sito.
import { request } from './common.mjs'
import { googleUrl } from '../../apps/voli/src/lib/link.js'

const COOKIE = 'SOCS=CAESHAgBEhJnd3NfMjAyNjEwMDEtMF9SQzEaAml0IAEaBgiA_LyaBg; CONSENT=YES+'
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

const unescape = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Giorni tra partenza e arrivo da "novembre 12" / "novembre 13" (anche a cavallo di mese o anno). */
function giorniDopo(data, mesePart, giornoPart, meseArr, giornoArr) {
  const y = Number(data.slice(0, 4))
  const p = Date.UTC(y, MESI.indexOf(mesePart), Number(giornoPart))
  let a = Date.UTC(y, MESI.indexOf(meseArr), Number(giornoArr))
  if (a < p) a = Date.UTC(y + 1, MESI.indexOf(meseArr), Number(giornoArr))
  const gg = Math.round((a - p) / 86400000)
  return gg >= 0 && gg <= 3 ? gg : 0
}

/** Un'etichetta di risultato → volo, o null se non è un'etichetta di volo. */
export function leggiEtichetta(label, data) {
  const prezzo = label.match(/^A partire da(?:l prezzo totale per andata e ritorno di| prezzo di)? ([\d.]+) euro/)
  if (!prezzo) return null
  const comp = label.match(/(?:Volo senza scali|Viaggio in aereo con (\d+) scal[oi]) con (.+?)\.(?: Operato da [^.]+\.)? Partenza/)
  const part = label.match(/Partenza da .+? alle ore (\d{1,2}:\d{2}) il giorno [^,]+, (\p{L}+) (\d{1,2}) e arrivo a .+? alle ore (\d{1,2}:\d{2}) il giorno [^,]+, (\p{L}+) (\d{1,2})/u)
  if (!comp || !part) return null
  const dur = label.match(/Durata totale (?:(\d+) h)?\s*(?:(\d+) min)?/)
  return {
    prezzo: Number(prezzo[1].replace(/\./g, '')),
    compagnia: comp[2].replace(/ e /g, ', ').trim(),
    scali: comp[1] ? Number(comp[1]) : 0,
    partenza: part[1].padStart(5, '0'),
    arrivo: part[4].padStart(5, '0'),
    arrivo_giorni: giorniDopo(data, part[2].toLowerCase(), part[3], part[5].toLowerCase(), part[6]),
    durata: dur && (dur[1] || dur[2]) ? Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0) : null,
  }
}

/** Tutti i voli di una pagina dei risultati, senza doppioni (stesso orario e compagnia: il prezzo più basso). */
export function leggiPagina(html, data) {
  const out = new Map()
  for (const m of html.matchAll(/aria-label="(A partire da[^"]*)"/g)) {
    const v = leggiEtichetta(unescape(m[1]), data)
    if (!v) continue
    const k = `${v.partenza}|${v.compagnia}`
    if (!out.has(k) || v.prezzo < out.get(k).prezzo) out.set(k, v)
  }
  return [...out.values()].sort((a, b) => a.prezzo - b.prezzo)
}

/**
 * Cerca o→d il giorno `data` (con `ritorno`: andata e ritorno, prezzo totale). → { voli, url }
 * Lancia un errore se Google mostra il captcha o una pagina senza risultati leggibili.
 */
export async function cerca(o, d, data, ritorno = null) {
  const url = googleUrl(o, d, data, ritorno)
  const html = await request(url, { as: 'text', headers: { cookie: COOKIE, accept: 'text/html' } })
  // ("recaptcha" compare anche nelle pagine normali: non è un segnale di blocco)
  if (/unusual traffic|traffico insolito|\/sorry\/index/i.test(html)) throw new Error('Google Flights: captcha (troppe richieste)')
  if (/consent\.google\.com/.test(html) && !/aria-label="A partire da/.test(html)) throw new Error('Google Flights: pagina del consenso cookie')
  // Pagina senza voli: "nessun volo" o formato cambiato, non si distinguono. Chi chiama non la usa come copertura
  // (i voli già noti restano attivi) e la segnala.
  return { voli: leggiPagina(html, data), url }
}
