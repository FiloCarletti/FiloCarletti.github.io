// Import/export CSV. Colonne attese: date, account, category, amount, currency, description
// (amount negativo = uscita, positivo = entrata). Accetta anche i nomi italiani e l'ordine fisso senza intestazione.
import { parseAmount } from './money.js'
import { toISO } from './period.js'

/** Parser CSV minimale (RFC 4180): virgolette, separatore nei campi, a capo nei campi. */
export function parseCSV(text) {
  text = text.replace(/^﻿/, '')
  const sep = detectSep(text)
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

function detectSep(text) {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch) => first.split(ch).length - 1
  const [best] = [[';', count(';')], ['\t', count('\t')], [',', count(',')]].sort((a, b) => b[1] - a[1])
  return best[1] > 0 ? best[0] : ','
}

const COLS = {
  data: ['date', 'data', 'giorno', 'booking date', 'data operazione', 'data contabile'],
  conto: ['account', 'conto', 'wallet'],
  categoria: ['category', 'categoria'],
  importo: ['amount', 'importo', 'value', 'valore'],
  valuta: ['currency', 'valuta', 'divisa'],
  descrizione: ['description', 'descrizione', 'note', 'causale', 'memo', 'details'],
}
const ORDER = ['data', 'conto', 'categoria', 'importo', 'valuta', 'descrizione']

/** Indici delle colonne dall'intestazione; null se la prima riga non è un'intestazione. */
function mapHeader(header) {
  const norm = header.map((h) => h.trim().toLowerCase())
  const idx = {}
  for (const [k, names] of Object.entries(COLS)) {
    const i = norm.findIndex((h) => names.includes(h))
    if (i > -1) idx[k] = i
  }
  return idx.data != null && idx.importo != null ? idx : null
}

/** '2026-10-05', '05/10/2026', '5-10-26', '05.10.2026', '2026/10/05 12:30' → ISO; null se non valida. */
export function parseDate(raw) {
  const s = String(raw ?? '').trim()
  let y, m, d
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (r) [, y, m, d] = r
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    ;[, d, m, y] = r
    if (y.length === 2) y = `20${y}`
  } else return null
  const dt = new Date(+y, +m - 1, +d)
  if (dt.getFullYear() !== +y || dt.getMonth() !== +m - 1 || dt.getDate() !== +d) return null
  return toISO(dt)
}

/**
 * Testo CSV → { rows, errors }. rows: { line, data, conto, categoria, importo, valuta, descrizione }.
 */
export function readMovimenti(text) {
  const table = parseCSV(text)
  if (!table.length) return { rows: [], errors: [{ line: 0, msg: 'File vuoto' }], header: false }
  let idx = mapHeader(table[0])
  const header = !!idx
  if (!idx) idx = Object.fromEntries(ORDER.map((k, i) => [k, i]))
  const rows = []
  const errors = []
  table.slice(header ? 1 : 0).forEach((r, i) => {
    const line = i + (header ? 2 : 1)
    const get = (k) => (idx[k] != null ? (r[idx[k]] ?? '').trim() : '')
    const data = parseDate(get('data'))
    const importo = parseAmount(get('importo'))
    if (!data) return errors.push({ line, msg: `Data non valida: "${get('data')}"` })
    if (importo == null) return errors.push({ line, msg: `Importo non valido: "${get('importo')}"` })
    if (importo === 0) return errors.push({ line, msg: 'Importo zero, saltato' })
    const valuta = (get('valuta') || 'EUR').toUpperCase()
    rows.push({
      line,
      data,
      conto: get('conto').slice(0, 80),
      categoria: get('categoria').slice(0, 60),
      importo,
      valuta: /^[A-Z]{3}$/.test(valuta) ? valuta : 'EUR',
      descrizione: get('descrizione').replace(/\s+/g, ' ').slice(0, 500),
    })
  })
  return { rows, errors, header }
}

/** Chiave per riconoscere i duplicati (stessa data, importo, descrizione e conto). */
export const dupKey = (m) => `${m.data}|${Number(m.importo).toFixed(2)}|${(m.descrizione ?? '').trim().toLowerCase()}|${(m.conto ?? '').trim().toLowerCase()}`

/** Movimenti → CSV con le stesse colonne dell'import (più la categoria secondaria). */
export function toCSV(movimenti, catById) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [['date', 'account', 'category', 'amount', 'currency', 'description', 'subcategory'].join(',')]
  for (const m of movimenti) {
    lines.push([m.data, m.conto, catById.get(m.categoria_id)?.nome ?? '', Number(m.importo).toFixed(2), m.valuta, m.descrizione, catById.get(m.sottocategoria_id)?.nome ?? ''].map(esc).join(','))
  }
  return lines.join('\n') + '\n'
}
