// Offerte Lidl Italia dai dati strutturati del sito (API di ricerca di lidl.it), niente PDF né immagini.
//
//   node scripts/offerte/lidl.mjs --nome "Lidl Rimini" [--prodotti prodotti.json] [--max 80] [--giorni 10]
//
// Le offerte "solo in punto vendita" sono nazionali: valgono per tutti i negozi (i volantini regionali, es.
// "Sapori dell'Emilia Romagna", possono avere qualche prodotto in più o in meno). Il link del negozio non serve.
// Legge la categoria "Cibo e bevande" e, per i prodotti seguiti, anche la ricerca per nome (es. shampoo).
// Tiene le offerte in corso e quelle che iniziano entro --giorni. Per ogni periodo di validità tiene tutte le
// offerte dei prodotti seguiti più le --max migliori delle altre (sconto più alto), per non riempire il database.
// Stampa il JSON per offerte_registra.
import { args, get, loadProdotti, print, romeDate, seguita, title, today } from './common.mjs'

const API = 'https://www.lidl.it/q/api/search?assortment=IT&locale=it_IT&version=v2.0.0'
const FOOD = '10068374' // categoria "Cibo e bevande"
const PAGE = 60 // l'API restituisce al massimo 60 risultati per chiamata

const a = args()
const nome = a.nome || 'Lidl'
const max = Number(a.max ?? 80)
const giorni = Number(a.giorni ?? 10)
const prodotti = loadProdotti(a.prodotti)
const oggi = today()
const limite = romeDate(Date.now() + giorni * 864e5)

async function search(params) {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const d = await get(`${API}&${params}&fetchsize=${PAGE}&offset=${offset}`)
    out.push(...(d.items ?? []))
    if (!d.items?.length || offset + PAGE >= (d.numFound ?? 0)) return out
  }
}

const items = new Map()
for (const it of await search(`category.id=${FOOD}`)) items.set(it.gridbox?.data?.productId, it)
// Prodotti seguiti fuori dal reparto alimentare (cura persona, casa…): ricerca per nome.
for (const c of prodotti) {
  const q = [c.p.nome, c.p.marca].filter(Boolean).join(' ')
  for (const it of await search(`q=${encodeURIComponent(q)}`)) items.set(it.gridbox?.data?.productId, it)
}

const euro = (n) => (typeof n === 'number' && n > 0 ? Math.round(n * 100) / 100 : null)
/** "1 kg = 3.12 €" → { unit: 3.12, unita: 'kg' } */
function base(text = '') {
  const m = text.match(/1\s*(kg|l|pz|pezzo)\s*=\s*([\d.,]+)/i)
  if (!m) return {}
  const u = m[1].toLowerCase()
  return { unit: Number(m[2].replace(',', '.')), unita: u === 'kg' ? 'kg' : u === 'l' ? 'l' : 'pz' }
}

const offerte = []
for (const it of items.values()) {
  const d = it.gridbox?.data
  const p = d?.price
  if (!d || !p) continue
  const prezzo = euro(p.price)
  if (!prezzo) continue
  // Periodi in negozio: quello in corso e i prossimi entro --giorni (ognuno è un'offerta a sé).
  const periodi = (d.stockAvailability?.badgeInfoV2 ?? [])
    .filter((b) => b.validFrom && b.validUntil)
    .map((b) => ({ da: romeDate(b.validFrom * 1000), fino: romeDate(b.validUntil * 1000) }))
    .filter((r) => r.fino >= oggi && r.da <= limite)
  if (!periodi.length && d.storeStartDate && d.storeEndDate) {
    const r = { da: romeDate(d.storeStartDate * 1000), fino: romeDate(d.storeEndDate * 1000) }
    if (r.fino >= oggi && r.da <= limite) periodi.push(r)
  }
  if (!periodi.length) continue

  // Marchi da ignorare: "-" (nessuno) e l'etichetta interna della frutta e verdura.
  const brand = d.brand?.name && !['-', 'ryneczek lidla'].includes(d.brand.name.toLowerCase()) ? d.brand.name : ''
  let titolo = String(d.fullTitle ?? d.title ?? '').replace(/\s+/g, ' ').trim()
  if (brand && titolo.toUpperCase().startsWith(`${brand.toUpperCase()} `)) titolo = titolo.slice(brand.length + 1)
  const pack = String(p.packaging?.text ?? '').replace(/\s*confezione\s*$/i, '').replace(/^alla$/i, '').trim()
  let { unit, unita } = base(p.basePrice?.text)
  if (!unit && /^al kg$/i.test(pack)) [unit, unita] = [prezzo, 'kg'] // venduto a peso: il prezzo è già al kg
  const plus = (d.lidlPlus ?? []).length ? 'con Lidl Plus' : ''
  // Reparto dal percorso "I mondi del bisogno/Cibo e quasi cibo/<reparto>/…" (alcuni nomi sono poco chiari).
  const reparto = String(d.keyfacts?.wonCategoryPrimary ?? '').split('/')[2] ?? ''
  const categoria = { Bilancio: '', 'Cibo congelato (Cibo congelato)': 'Surgelati' }[reparto] ?? reparto

  for (const r of periodi) {
    offerte.push({
      supermercato: nome,
      nome: titolo.slice(0, 160),
      marca: (brand === brand.toUpperCase() ? title(brand) : brand).slice(0, 80),
      formato: pack.slice(0, 60),
      categoria: categoria.slice(0, 60),
      prezzo,
      prezzo_pieno: euro(p.oldPrice) > prezzo ? euro(p.oldPrice) : null,
      prezzo_unitario: unit || null,
      unita: unit ? unita : null,
      condizioni: plus,
      valido_da: r.da,
      valido_fino: r.fino,
      url: d.canonicalUrl ? `https://www.lidl.it${d.canonicalUrl}` : '',
      _sconto: p.discount?.percentageDiscount ?? 0,
    })
  }
}

// Per ogni periodo: tutti i prodotti seguiti + le migliori `max` delle altre.
const perPeriodo = new Map()
for (const o of offerte) {
  const k = `${o.valido_da}|${o.valido_fino}`
  if (!perPeriodo.has(k)) perPeriodo.set(k, [])
  perPeriodo.get(k).push(o)
}
const scelte = []
const note = []
for (const [k, list] of [...perPeriodo.entries()].sort()) {
  const mie = list.filter((o) => seguita(o, prodotti))
  const altre = list.filter((o) => !mie.includes(o)).sort((x, y) => y._sconto - x._sconto || x.prezzo - y.prezzo).slice(0, max)
  scelte.push(...mie, ...altre)
  const [da, fino] = k.split('|')
  note.push(`${da} → ${fino}: ${mie.length + altre.length} su ${list.length}${mie.length ? ` (${mie.length} dei prodotti seguiti)` : ''}`)
}

print({
  supermercati: [nome],
  note: `Lidl (offerte nazionali in negozio): ${note.join('; ')}.`,
  offerte: scelte.map(({ _sconto, ...o }) => o),
})
