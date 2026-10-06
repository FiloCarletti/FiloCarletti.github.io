// Volantini Conad di un negozio: elenco con le date, download dei PDF e pagine in PNG da far leggere a Claude.
// Il testo dei PDF ha le colonne mescolate (prezzi lontani dai prodotti): si legge dalle immagini delle pagine.
//
//   node scripts/offerte/conad.mjs <link della pagina del negozio> [--dir cartella] [--salta AAAA-MM-GG,…] [--tutti]
//
// Il link è quello di conad.it/ricerca-negozi/… La pagina contiene l'elenco dei volantini del negozio (data-flyers).
// Senza --tutti salta manuali, cataloghi e volantini che durano più di un mese.
// --salta: date di inizio dei volantini già registrati (non li scarica di nuovo).
// Pagine in PNG con pdftoppm (poppler) oppure, se manca, con PyMuPDF (pip install pymupdf).
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { args, get, print, romeDate, today } from './common.mjs'

const a = args()
const url = a._[0]
if (!url) {
  console.error('Uso: node scripts/offerte/conad.mjs <link della pagina del negozio> [--dir cartella] [--salta AAAA-MM-GG,…] [--tutti]')
  process.exit(1)
}
const dir = resolve(a.dir || join(tmpdir(), 'offerte-volantini'))

const html = await get(url, 'text')
const attr = html.match(/data-flyers="([^"]*)"/)?.[1]
if (!attr) throw new Error('La pagina non contiene l\'elenco dei volantini (data-flyers): controlla il link del negozio.')
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const flyers = JSON.parse(decode(attr))

const oggi = today()
const giorni = (f) => (f.validTo - f.validFrom) / 864e5
const scelti = flyers
  .filter((f) => f.pdfUrl && f.validTo && romeDate(f.validTo) >= oggi)
  .filter((f) => a.tutti || (giorni(f) <= 31 && !/manuale|catalogo|sanit/i.test(f.title ?? '')))

const salta = new Set(String(a.salta || '').split(',').map((x) => x.trim()).filter(Boolean))
const has = (cmd, arg = '-v') => spawnSync(cmd, [arg]).error == null
const hasPdftoppm = has('pdftoppm')
const PY = `import sys, pymupdf
d = pymupdf.open(sys.argv[1])
for i, p in enumerate(d):
    p.get_pixmap(dpi=110).save(f"{sys.argv[2]}-{i + 1:02d}.png")
print(d.page_count)`
const hasPymupdf = !hasPdftoppm && spawnSync('python', ['-c', 'import pymupdf']).status === 0

/** Pagine del PDF in PNG (≈110 dpi, leggibili e non troppo pesanti). */
function renderPages(pdf, prefix) {
  if (hasPdftoppm) {
    const r = spawnSync('pdftoppm', ['-r', '110', '-png', pdf, prefix])
    if (r.status !== 0) throw new Error(`pdftoppm: ${r.stderr}`)
  } else if (hasPymupdf) {
    const r = spawnSync('python', ['-c', PY, pdf, prefix], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`pymupdf: ${r.stderr}`)
  } else {
    return null
  }
  const name = basename(prefix)
  return readdirSync(dirname(prefix)).filter((x) => x.startsWith(`${name}-`) && x.endsWith('.png')).sort().map((x) => join(dirname(prefix), x))
}

mkdirSync(dir, { recursive: true })
const volantini = []
for (const f of scelti) {
  if (salta.has(romeDate(f.validFrom))) continue
  const base = (f.flyerCode || f.slug || f.id).replace(/[^a-z0-9-]+/gi, '-')
  const pdf = join(dir, `${base}.pdf`)
  const item = {
    titolo: f.feTitle || f.title,
    valido_da: romeDate(f.validFrom),
    valido_fino: romeDate(f.validTo),
    url: f.externalizedVolantinoUrl || f.link?.href || url,
    pdf,
    immagini: null,
  }
  try {
    writeFileSync(pdf, await get(f.pdfUrl, 'buffer'))
    item.immagini = renderPages(pdf, join(dir, base))
    if (!item.immagini) item.errore = 'Mancano pdftoppm (poppler-utils) e PyMuPDF: installane uno, o leggi il PDF con Read.'
  } catch (e) {
    item.errore = e.message
  }
  volantini.push(item)
}

print({
  supermercato: 'Conad',
  negozio: url,
  oggi,
  saltati: scelti.filter((f) => salta.has(romeDate(f.validFrom))).map((f) => f.feTitle || f.title),
  esclusi: flyers.filter((f) => !scelti.includes(f)).map((f) => `${f.feTitle || f.title} (${romeDate(f.validFrom)} → ${romeDate(f.validTo)})`),
  volantini,
})
