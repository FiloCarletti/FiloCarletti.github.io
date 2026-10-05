// Import da CSV (file o Google Sheet condiviso via link).
// Formato atteso, come il foglio originale: Data, Esercizio, Serie, Rip, Peso, [Volume], [Type], [RPE]…
// Righe senza data ereditano quella precedente; date "gg/mm" prendono l'anno scelto.
import { guessCategory, guessUnit, normCat } from './categories.js'
import { toISO } from './metrics.js'

/** Parser CSV minimale (RFC 4180): virgolette, virgole e a capo nei campi. */
export function parseCSV(text) {
  const rows = []
  let row = [], field = '', q = false
  const sep = detectSep(text)
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
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ','
}

/** URL di un Google Sheet → URL di export CSV (stesso foglio/tab se c'è gid). */
export function sheetCsvUrl(url) {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!id) return null
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1]
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`
}

// Varianti di nome che indicano lo stesso esercizio.
const ALIAS = { 'abd crunch': 'Abdominal Crunch' }

export function canonicalName(raw) {
  let s = raw.replace(/\s+/g, ' ').trim()
  s = s.replace(/\besplosivi\b/gi, (m) => (m[0] === 'E' ? 'Esplosivo' : 'esplosivo'))
  return ALIAS[s.toLowerCase()] ?? s
}

function parseNumber(raw) {
  if (raw == null) return null
  const m = String(raw).replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

function parseDate(raw, year) {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return toISO(new Date(+m[1], +m[2] - 1, +m[3]))
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/)
  if (!m) return null
  let y = m[3] ? +m[3] : year
  if (y < 100) y += 2000
  const d = new Date(y, +m[2] - 1, +m[1])
  return Number.isNaN(d.getTime()) ? null : toISO(d)
}

function findCol(header, names) {
  return header.findIndex((h) => names.includes(h.trim().toLowerCase()))
}

/**
 * Trasforma le righe CSV in sessioni pronte da importare.
 * `known` = esercizi già presenti nel DB (per riusarli e non duplicarli).
 */
export function buildImport(rows, { year, known = [] }) {
  const warnings = []
  if (!rows.length) return { sessions: [], newExercises: [], warnings: ['Il file è vuoto.'] }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = {
    data: findCol(header, ['data', 'date', 'giorno']),
    nome: findCol(header, ['esercizio', 'exercise', 'nome']),
    serie: findCol(header, ['serie', 'sets', 'set']),
    rip: findCol(header, ['rip', 'ripetizioni', 'reps', 'rep']),
    peso: findCol(header, ['peso', 'kg', 'carico', 'weight']),
    cat: findCol(header, ['type', 'tipo', 'categoria', 'category']),
    rpe: findCol(header, ['rpe', 'fatica', 'sforzo']),
    note: findCol(header, ['note', 'notes']),
  }
  if (col.data < 0 || col.nome < 0) {
    return { sessions: [], newExercises: [], warnings: ['Servono almeno le colonne "Data" ed "Esercizio" nella prima riga.'] }
  }
  // Colonna RPE senza intestazione (come nel foglio originale): la prima colonna senza nome
  // dopo quelle note che contiene solo numeri tra 1 e 10.
  if (col.rpe < 0) {
    const used = new Set(Object.values(col))
    for (let i = 0; i < header.length; i++) {
      if (header[i] || used.has(i)) continue
      const vals = rows.slice(1).map((r) => (r[i] ?? '').trim()).filter(Boolean)
      if (vals.length && vals.every((x) => /^\d+([.,]\d)?$/.test(x) && parseNumber(x) >= 1 && parseNumber(x) <= 10)) {
        col.rpe = i
        break
      }
    }
  }
  const get = (r, k) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '')

  const knownByKey = new Map(known.map((e) => [e.nome.toLowerCase(), e]))
  const newByKey = new Map()
  const byDate = new Map()
  let lastDate = null

  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const rawName = get(r, 'nome')
    const rawDate = get(r, 'data')
    if (rawDate) {
      const d = parseDate(rawDate, year)
      if (!d) { warnings.push(`Riga ${line}: data non riconosciuta "${rawDate}", riga saltata.`); return }
      lastDate = d
    }
    if (!rawName) return
    if (!lastDate) { warnings.push(`Riga ${line}: nessuna data, riga saltata.`); return }

    const nome = canonicalName(rawName)
    const key = nome.toLowerCase()
    let ex = knownByKey.get(key) ?? newByKey.get(key)
    if (!ex) {
      ex = { nome, categoria: normCat(get(r, 'cat')) ?? guessCategory(nome), unita: guessUnit(nome), isNew: true }
      newByKey.set(key, ex)
    } else if (ex.isNew && ex.categoria === guessCategory(nome) && normCat(get(r, 'cat'))) {
      ex.categoria = normCat(get(r, 'cat')) // la categoria scritta nel foglio vince sull'ipotesi
    }

    const rawSerie = get(r, 'serie'), rawRip = get(r, 'rip'), rawPeso = get(r, 'peso')
    const voce = { nomeKey: key, serie: null, ripetizioni: null, peso_kg: null, rpe: null, durata_min: null, distanza_km: null, note: get(r, 'note') || null }
    if (ex.unita === 'cardio' || /min|km/i.test(rawSerie + rawRip)) {
      for (const raw of [rawSerie, rawRip]) {
        if (/km/i.test(raw)) voce.distanza_km = parseNumber(raw)
        else if (/min/i.test(raw) || raw) voce.durata_min ??= parseNumber(raw)
      }
      if (parseNumber(rawPeso)) voce.note = [voce.note, `Livello ${parseNumber(rawPeso)}`].filter(Boolean).join(' · ')
    } else {
      const s = parseNumber(rawSerie)
      voce.serie = s && s > 0 ? Math.round(s) : null
      voce.ripetizioni = parseNumber(rawRip)
      const p = parseNumber(rawPeso)
      voce.peso_kg = p && p > 0 ? p : null
    }
    const rpe = parseNumber(get(r, 'rpe'))
    if (rpe >= 1 && rpe <= 10) voce.rpe = rpe

    const list = byDate.get(lastDate) ?? []
    list.push(voce)
    byDate.set(lastDate, list)
  })

  const sessions = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, voci]) => ({ data, voci }))
  return { sessions, newExercises: [...newByKey.values()], warnings, rpeDetected: col.rpe >= 0 }
}
