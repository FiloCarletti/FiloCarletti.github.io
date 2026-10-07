// Rigenera apps/voli/src/lib/aeroporti-dati.js, l'elenco degli aeroporti per l'autocompletamento dell'app Voli.
//
//   node scripts/voli/genera-aeroporti.mjs
//
// Fonti: OurAirports (dominio pubblico: aeroporti con codice IATA e voli di linea), più i nomi in italiano di
// Ryanair e Wizz Air dove ci sono, più i codici città (tutti gli aeroporti di una città: li capisce solo Google
// Flights). Formato: una riga per aeroporto "IATA|nome|paese ISO|c" (c = codice città); il nome del paese in
// italiano lo ricava l'app con Intl.DisplayNames.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UA, request } from './common.mjs'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/voli/src/lib/aeroporti-dati.js')

/** CSV con campi tra virgolette (OurAirports). */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (ch === '"') q = false
      else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch !== '\r') field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...data] = rows
  return data.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

/** "Noi Bai International Airport" → "Noi Bai"; "Cam Ranh International Airport / Cam Ranh Air Base" → "Cam Ranh" */
const breve = (n) => n.split(' / ')[0]
  .replace(/\b(International|Intl\.?|Regional|Domestic|Municipal|Airport|Airfield|Aerodrome|Air Base|Airstrip)\b/gi, '')
  .replace(/[–-]\s*$/, '').replace(/\s+/g, ' ').trim()
/** "Hanoi (Soc Son)" → "Hanoi"; "Nha Trang/nha Trang aiurportCam Ranh" → "Nha Trang" */
const citta = (m) => m.split('/')[0].replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
function nome(a) {
  const c = citta(a.municipality)
  const b = breve(a.name)
  if (!c) return b || a.name
  if (!b || b.toLowerCase().includes(c.toLowerCase())) return b || c
  if (c.toLowerCase().includes(b.toLowerCase())) return c
  return `${c} – ${b}`
}

// Codici città: Google Flights cerca su tutti gli aeroporti della città (Ryanair e Wizz Air no).
const CITTA = [
  ['MIL', 'Milano (tutti gli aeroporti)', 'IT'], ['ROM', 'Roma (tutti gli aeroporti)', 'IT'],
  ['LON', 'Londra (tutti gli aeroporti)', 'GB'], ['PAR', 'Parigi (tutti gli aeroporti)', 'FR'],
  ['NYC', 'New York (tutti gli aeroporti)', 'US'], ['WAS', 'Washington (tutti gli aeroporti)', 'US'],
  ['CHI', 'Chicago (tutti gli aeroporti)', 'US'], ['STO', 'Stoccolma (tutti gli aeroporti)', 'SE'],
  ['MOW', 'Mosca (tutti gli aeroporti)', 'RU'], ['BUH', 'Bucarest (tutti gli aeroporti)', 'RO'],
  ['TYO', 'Tokyo (tutti gli aeroporti)', 'JP'], ['SEL', 'Seul (tutti gli aeroporti)', 'KR'],
  ['BJS', 'Pechino (tutti gli aeroporti)', 'CN'], ['SHA', 'Shanghai (tutti gli aeroporti)', 'CN'],
  ['BKK', 'Bangkok (tutti gli aeroporti)', 'TH'], ['SAO', 'San Paolo (tutti gli aeroporti)', 'BR'],
  ['RIO', 'Rio de Janeiro (tutti gli aeroporti)', 'BR'], ['BUE', 'Buenos Aires (tutti gli aeroporti)', 'AR'],
  ['YTO', 'Toronto (tutti gli aeroporti)', 'CA'], ['YMQ', 'Montréal (tutti gli aeroporti)', 'CA'],
  ['OSA', 'Osaka (tutti gli aeroporti)', 'JP'], ['IST', 'Istanbul', 'TR'],
]

const csv = parseCsv(await request('https://davidmegginson.github.io/ourairports-data/airports.csv', { as: 'text', timeout: 120000 }))
const out = new Map()
for (const a of csv) {
  if (!/^[A-Z]{3}$/.test(a.iata_code) || a.scheduled_service !== 'yes') continue
  if (!['large_airport', 'medium_airport', 'small_airport'].includes(a.type)) continue
  out.set(a.iata_code, [a.iata_code, nome(a), a.iso_country, ''])
}
const daOurAirports = out.size

// Nomi italiani di Ryanair e Wizz Air (hanno la precedenza).
let it = 0
const ryanair = new Set()
try {
  for (const a of await request('https://www.ryanair.com/api/views/locate/5/airports/it/active')) {
    out.set(a.code, [a.code, a.name, a.country.code.toUpperCase(), '']); ryanair.add(a.code); it++
  }
} catch (e) { console.error('Ryanair:', e.message) }
try {
  const html = await fetch('https://www.wizzair.com/buildnumber', { headers: { accept: 'text/html', 'user-agent': UA, 'accept-language': 'it-IT,it;q=0.9' } }).then((r) => r.text())
  const base = html.match(/https:\/\/be\.wizzair\.com\/[\d.]+/)?.[0]
  if (!base) console.error('Wizz Air: versione API non trovata')
  else {
    for (const c of (await request(`${base}/Api/asset/map?languageCode=it-it`)).cities ?? []) {
      if (!ryanair.has(c.iata) && c.shortName) { out.set(c.iata, [c.iata, c.shortName, c.countryCode, '']); it++ }
    }
  }
} catch (e) { console.error('Wizz Air:', e.message) }
for (const [c, n, p] of CITTA) out.set(c, [c, n, p, c === 'IST' ? '' : 'c'])

const rows = [...out.values()].sort((a, b) => a[1].localeCompare(b[1], 'it'))
const body = rows.map((r) => r.map((x) => String(x).replace(/[|\n`\\$]/g, ' ')).join('|').replace(/\|$/, '')).join('\n')
writeFileSync(OUT, `// Generato da scripts/voli/genera-aeroporti.mjs (${new Date().toISOString().slice(0, 10)}): non modificare a mano.
// Fonti: OurAirports (dominio pubblico), nomi italiani di Ryanair e Wizz Air, codici città.
// Una riga per aeroporto: IATA|nome|paese ISO|c (c = codice città, tutti gli aeroporti: solo Google Flights).
export default \`${body}\`
`)
console.log(`${rows.length} aeroporti (${daOurAirports} da OurAirports, ${it} nomi italiani, ${CITTA.length} codici città) → ${OUT}`)
