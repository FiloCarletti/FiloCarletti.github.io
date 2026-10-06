// Ricerca con Claude e import da JSON: il prompt con supermercati e prodotti seguiti, e la lettura della risposta.
// Il formato è lo stesso che accetta la funzione del DB offerte_registra (usata anche dalla routine).
import { fmtDay } from './dates.js'
import { parseNum } from './util.js'

export const ESEMPIO = {
  supermercati: ['Esselunga', 'Lidl'],
  note: 'Lidl: volantino della prossima settimana non ancora pubblicato.',
  offerte: [
    {
      supermercato: 'Esselunga', nome: 'Passata di pomodoro', marca: 'Mutti', formato: '700 g', categoria: 'Dispensa',
      prezzo: 0.99, prezzo_pieno: 1.59, prezzo_unitario: 1.41, unita: 'kg', condizioni: 'con carta Fidaty',
      valido_da: '2026-10-06', valido_fino: '2026-10-15', url: 'https://…',
    },
  ],
}

const fmtSoglia = (p) => `${String(p.prezzo_max).replace('.', ',')} €${p.prezzo_per === 'pz' ? '' : `/${p.prezzo_per}`}`

export function buildPrompt({ supermercati, prodotti, oggi, maxAltre = 30 }) {
  const sm = supermercati.filter((s) => s.attivo)
  const pr = prodotti.filter((p) => p.attivo)
  const L = []
  L.push(`Cerca le offerte nei volantini in corso di questi supermercati e restituiscile in JSON.`)
  L.push(`Oggi è ${fmtDay(oggi)} (${oggi}). Includi anche i volantini che iniziano nei prossimi giorni, se sono già pubblicati.`)
  L.push('')
  L.push('Supermercati:')
  for (const s of sm) {
    L.push(`- ${s.nome}${s.zona ? ` (${s.zona})` : ''}${s.volantino_url ? ` — volantino: ${s.volantino_url}` : ''}${s.note ? ` — ${s.note}` : ''}`)
  }
  L.push('')
  if (pr.length) {
    L.push('Prodotti che mi interessano (cercali per primi, anche con nomi simili):')
    for (const p of pr) {
      const extra = [
        p.parole.length && `anche: ${p.parole.join(', ')}`,
        p.marca && `solo marca ${p.marca}`,
        p.escludi.length && `non: ${p.escludi.join(', ')}`,
        p.prezzo_max != null && `buon prezzo ≤ ${fmtSoglia(p)}`,
      ].filter(Boolean)
      L.push(`- ${p.nome}${extra.length ? ` (${extra.join('; ')})` : ''}`)
    }
    L.push('')
  }
  L.push(`Oltre ai miei prodotti, aggiungi le offerte più convenienti di ogni volantino (al massimo ${maxAltre} per supermercato): sconti alti e prodotti di uso comune.`)
  L.push('')
  L.push('Regole:')
  L.push('- solo offerte lette davvero nel volantino: niente prezzi stimati o inventati;')
  L.push('- "valido_da" e "valido_fino" in formato AAAA-MM-GG, come indicato nel volantino;')
  L.push('- "prezzo" è quello in offerta; "prezzo_pieno" solo se il volantino lo indica;')
  L.push('- "prezzo_unitario" e "unita" (kg, l o pz) se indicati o calcolabili dal formato;')
  L.push('- "condizioni": carta fedeltà, 3x2, dal 2° pezzo, solo online…;')
  L.push('- "nome" senza marca né formato (vanno nei loro campi); "supermercato" esattamente come scritto sopra;')
  L.push('- in "supermercati" tutti quelli che hai cercato; in "note" i problemi (volantino non trovato, illeggibile…).')
  L.push('')
  L.push('Rispondi con un solo blocco ```json``` in questo formato:')
  L.push('```json')
  L.push(JSON.stringify(ESEMPIO, null, 2))
  L.push('```')
  return L.join('\n')
}

/** Estrae il JSON da un testo: JSON puro, blocco ```json``` o testo con un oggetto/array dentro. */
export function extractJSON(text) {
  const s = String(text ?? '').trim()
  if (!s) throw new Error('Incolla il JSON delle offerte.')
  const fenced = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim())
  const candidates = [...fenced, s]
  const i = s.search(/[[{]/)
  if (i >= 0) candidates.push(s.slice(i, Math.max(s.lastIndexOf('}'), s.lastIndexOf(']')) + 1))
  for (const c of candidates) {
    try { return JSON.parse(c) } catch { /* prova il prossimo */ }
  }
  throw new Error('Non trovo un JSON valido nel testo incollato.')
}

const pick = (o, ...keys) => keys.map((k) => o?.[k]).find((v) => v != null && v !== '')
const str = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())

/** "15/10/2026" | "2026-10-15" → "2026-10-15"; altrimenti null */
function toDate(v) {
  const s = str(v)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

/**
 * Normalizza il JSON incollato: { offerte, supermercati, note, errors }.
 * Accetta un array di offerte o { offerte | offers: [...] } e qualche nome di campo alternativo.
 */
export function parseImport(raw, { oggi }) {
  const list = Array.isArray(raw) ? raw : pick(raw, 'offerte', 'offers')
  if (!Array.isArray(list)) throw new Error('Mi aspetto un elenco "offerte".')
  const errors = []
  const offerte = []
  list.forEach((x, i) => {
    const n = i + 1
    const nome = str(pick(x, 'nome', 'prodotto', 'name'))
    const supermercato = str(pick(x, 'supermercato', 'negozio', 'store'))
    const prezzo = parseNum(pick(x, 'prezzo', 'price'))
    const da = toDate(pick(x, 'valido_da', 'dal', 'inizio'))
    const fino = toDate(pick(x, 'valido_fino', 'al', 'fine'))
    if (!nome) return errors.push(`Offerta ${n}: manca il nome.`)
    if (!supermercato) return errors.push(`“${nome}”: manca il supermercato.`)
    if (!(prezzo > 0)) return errors.push(`“${nome}”: prezzo mancante o non valido.`)
    if (da && fino && fino < da) return errors.push(`“${nome}”: la fine della validità è prima dell'inizio.`)
    if (fino && fino < oggi) return errors.push(`“${nome}”: offerta già scaduta (${fino}).`)
    const pieno = parseNum(pick(x, 'prezzo_pieno', 'prezzo_originale', 'prezzo_iniziale'))
    const unit = parseNum(pick(x, 'prezzo_unitario', 'prezzo_kg', 'prezzo_al_kg'))
    offerte.push({
      supermercato, nome,
      marca: str(x.marca), formato: str(x.formato), categoria: str(x.categoria),
      prezzo,
      prezzo_pieno: pieno > prezzo ? pieno : null,
      prezzo_unitario: unit > 0 ? unit : null,
      unita: unit > 0 ? str(x.unita).toLowerCase() || 'kg' : null,
      condizioni: str(x.condizioni),
      valido_da: da, valido_fino: fino,
      url: str(x.url),
    })
  })
  const supermercati = Array.isArray(raw?.supermercati) ? raw.supermercati.map(str).filter(Boolean) : []
  return { offerte, supermercati, note: str(raw?.note), errors }
}
