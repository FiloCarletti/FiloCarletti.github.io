// Offerte Coop Alleanza 3.0 di un punto vendita, lette dai dati strutturati del sito (niente PDF né immagini).
//
//   node scripts/offerte/coop.mjs <link volantino o pagina del negozio> [--nome Coop] [--prodotti prodotti.json] [--max 150]
//
// Il link contiene l'id del negozio (…/volantino/P2620SM/3853-rimini-colonnella.html → 3853).
// Legge tutti i volantini in corso e in arrivo del negozio. Dei volantini con più di --max promozioni
// (es. "Prezzi ribassati soci", centinaia di prodotti a marchio) tiene solo quelle dei prodotti seguiti,
// per non riempire il database. Stampa il JSON per offerte_registra.
import { args, euro, get, itDate, loadProdotti, print, seguita, sentence, title, today } from './common.mjs'

const API = 'https://svdgt.coopalleanza3-0.it/apim'
const SITE = 'https://www.coopalleanza3-0.it'
// Codici di reparto del sito. 1, 3 e 4 mescolano dispensa, freschi, carne e frutta: restano "Alimentari".
const CATEGORIE = {
  1: 'Alimentari', 2: 'Bevande', 3: 'Alimentari', 4: 'Alimentari', 5: 'Infanzia', 6: 'Cura persona',
  7: 'Animali', 8: 'Casa', 9: 'Casalinghi', 11: 'Piante e fiori',
}

const a = args()
const url = a._[0]
if (!url) {
  console.error('Uso: node scripts/offerte/coop.mjs <link volantino o negozio> [--nome Coop] [--prodotti file.json] [--max 150]')
  process.exit(1)
}
const nome = a.nome || 'Coop'
const max = Number(a.max || 150)
const prodotti = loadProdotti(a.prodotti)

const idSl = url.match(/\/(\d+)-[a-z0-9-]+(?:\.html|\/|$)/i)?.[1]
if (!idSl) throw new Error(`Non trovo l'id del negozio nel link: ${url}`)
const mapping = await get(`${SITE}/storesContentServlet/?operation=getMappingStoreId`)
const pdv = Object.entries(mapping.stores ?? {}).find(([k, v]) => v === idSl && /^\d{4}$/.test(k))?.[0]
if (!pdv) throw new Error(`Negozio ${idSl} non trovato`)

const oggi = today()
const { leaflets = [] } = await get(`${API}/leaflets/${pdv}`)
const note = []
const offerte = []

/** Prezzi dai testi del riquadro: "~0,99 €~" pieno, "0,65 €" offerta, "1,30 € al kg" unitario. */
function prezzi(txt) {
  let pieno = null, prezzo = null, unit = null, unita = null
  for (const t of txt) {
    if (/^~.*~$/.test(t.trim())) pieno = euro(t)
    else if (/\bal\s+(kg|chilo|litro|lt|l|pezzo|pz)\b/i.test(t)) {
      unit = euro(t)
      const u = t.match(/\bal\s+(\w+)/i)[1].toLowerCase()
      unita = u.startsWith('l') ? 'l' : u.startsWith('p') ? 'pz' : 'kg'
    } else if (prezzo == null && euro(t) != null) prezzo = euro(t)
  }
  return { pieno, prezzo, unit, unita }
}

for (const l of leaflets) {
  const da = itDate(l.valido_da)
  const fino = itDate(l.valido_a)
  if (!da || !fino || fino < oggi) continue
  let promos
  try {
    ({ promos = [] } = await get(`${API}/${l.id}/${pdv}/promos?`))
  } catch (e) {
    note.push(`Coop "${l.titolo}": promozioni non leggibili (${e.message}).`)
    continue
  }
  const filtra = promos.length > max
  let tenute = 0
  for (const p of promos) {
    const testi = ['DXTop', 'DXBottom'].flatMap((k) => p[k]?.txt ?? []).filter(Boolean)
    const { pieno, prezzo, unit, unita } = prezzi(testi)
    if (!(prezzo > 0)) continue
    const brand = title(p.brand ?? '')
    const raw = String(p.desc_promo ?? '').replace(/\s+/g, ' ').trim()
    // Il nome finisce con la marca: la tolgo (anche scritta con spazi diversi).
    const esc = String(p.brand ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
    const re = esc ? new RegExp(`\\s*${esc}\\s*$`, 'i') : null
    const nomeProdotto = sentence(re ? raw.replace(re, '') || raw : raw)
    const condizioni = [
      ...['CXTop', 'CXBottom', 'SXBottom'].flatMap((k) => p[k]?.txt ?? []).filter((t) => t && !/^-?\d+\s*%$/.test(t.trim())),
      p.promo_pretty_name_validita,
      p.desc_multi,
    ].filter(Boolean).join(', ')
    const o = {
      supermercato: nome,
      nome: nomeProdotto.slice(0, 160),
      marca: brand.slice(0, 80),
      formato: String(p.desc_promo2 ?? '').replace(/\s+/g, ' ').replace(/\.$/, '').trim().slice(0, 60),
      categoria: CATEGORIE[p.categoryCode] ?? '',
      prezzo,
      prezzo_pieno: pieno > prezzo ? pieno : null,
      prezzo_unitario: unit,
      unita: unit ? unita : null,
      condizioni: condizioni.slice(0, 200),
      valido_da: da,
      valido_fino: fino,
      url: l.url ?? '',
    }
    // Prodotti venduti a peso ("al taglio, al kg"): il prezzo è già al kg.
    if (o.prezzo_unitario == null && /\bal (kg|chilo)\b/i.test(o.formato)) Object.assign(o, { prezzo_unitario: prezzo, unita: 'kg' })
    if (filtra && !seguita(o, prodotti)) continue
    offerte.push(o)
    tenute++
  }
  note.push(`Coop "${l.titolo}" (${da} → ${fino}): ${tenute} offerte${filtra ? ` su ${promos.length}, solo i prodotti seguiti` : ''}.`)
}

print({ supermercati: [nome], note: note.join(' '), offerte })
