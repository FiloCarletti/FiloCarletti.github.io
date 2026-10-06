// Funzioni comuni agli estrattori dei volantini (usati dalla skill offerte-volantini).
// Output nel formato di public.offerte_registra: { supermercati, note, offerte: [...] }.
import { readFileSync } from 'node:fs'
import { compile, matches, offerText, tokens } from '../../apps/offerte/src/lib/match.js'

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export async function get(url, as = 'json') {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: as === 'json' ? 'application/json' : '*/*' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return as === 'json' ? res.json() : as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer())
}

/** Data locale italiana 'YYYY-MM-DD' di un istante. */
export const romeDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ms))
export const today = () => romeDate(Date.now())
/** '24/09/2026' → '2026-09-24' */
export const itDate = (s) => {
  const m = String(s ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}
/** '1,30 €' → 1.3 */
export const euro = (s) => {
  const m = String(s ?? '').replace(/\./g, '').match(/(\d+),(\d{1,2})/)
  return m ? Number(`${m[1]}.${m[2]}`) : null
}
/** 'PASTA DI SEMOLA' → 'Pasta di semola' (sigle brevi come DOP/IGP restano maiuscole) */
export const sentence = (s) => {
  const low = String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const fixed = low.replace(/\b(dop|igp|igt|doc|docg|uht|bio)\b/g, (w) => w.toUpperCase())
  return fixed.charAt(0).toUpperCase() + fixed.slice(1)
}
/** 'LUCIANA MOSCONI' → 'Luciana Mosconi' */
export const title = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())

/** Argomenti: posizionali e --chiave valore / --flag */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i]
      else out[k] = true
    } else out._.push(a)
  }
  return out
}

/** Prodotti seguiti da un file JSON (array di { nome, parole, escludi, marca }), già pronti per il confronto. */
export function loadProdotti(file) {
  if (!file) return []
  const list = JSON.parse(readFileSync(file, 'utf8'))
  return list.map((p) => compile({ parole: [], escludi: [], marca: '', ...p }))
}
/** L'offerta riconosce almeno un prodotto seguito? */
export const seguita = (o, prodotti) => {
  if (!prodotti.length) return false
  const w = tokens(offerText(o))
  return prodotti.some((c) => matches(w, c))
}

export const print = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
