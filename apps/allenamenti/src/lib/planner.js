// Allenamenti programmati: lettura del JSON (scritto a mano o da Claude) e prompt con lo storico.
// L'inserimento vero lo fa la funzione SQL `allenamenti_pianifica`, la stessa usata dalla skill Claude.
import { CATEGORIE, guessCategory, guessUnit, normCat } from './categories.js'
import { canonicalName } from './importer.js'
import { fmtVoce } from './metrics.js'

export const ESEMPIO = {
  data: '2026-10-07',
  titolo: 'Gambe + core',
  note: 'Perché: squat +2,5 kg rispetto all\'ultima volta (RPE 7).',
  esercizi: [
    { nome: 'Squat', serie: 4, ripetizioni: 6, peso_kg: 62.5, rpe: 8 },
    { nome: 'Plank', serie: 3, ripetizioni: 45, note: 'secondi' },
    { nome: 'Cyclette', durata_min: 15 },
  ],
}

/** Estrae il JSON da un testo: JSON puro, blocco ```json``` o testo con un oggetto/array dentro. */
export function extractJSON(text) {
  const s = String(text ?? '').trim()
  if (!s) throw new Error('Incolla il JSON del piano.')
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

function toNum(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const m = String(v).replace(',', '.').match(/\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

/**
 * Normalizza il piano: accetta un allenamento, un array o { allenamenti: [...] }, con nomi di campo
 * in italiano o inglese. Restituisce gli allenamenti pronti per `allenamenti_pianifica` e gli errori.
 * `known` = esercizi dello spazio (per riconoscere quelli nuovi e dare loro categoria e misura).
 */
export function normalizePlan(raw, { known = [], today }) {
  const errors = []
  let list = raw
  if (list && !Array.isArray(list)) list = list.allenamenti ?? list.workouts ?? list.sessioni ?? [list]
  if (!Array.isArray(list) || !list.length) return { sessions: [], errors: ['Il piano non contiene allenamenti.'] }
  const knownByKey = new Map(known.map((e) => [e.nome.toLowerCase(), e]))

  const sessions = list.map((s, si) => {
    const label = `Allenamento ${si + 1}`
    let data = String(pick(s, 'data', 'date') ?? today).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(new Date(data).getTime())) {
      errors.push(`${label}: data non valida "${data}" (formato AAAA-MM-GG), uso oggi.`)
      data = today
    }
    const items = pick(s, 'esercizi', 'voci', 'exercises') ?? []
    if (!Array.isArray(items) || !items.length) errors.push(`${label}: nessun esercizio.`)
    const esercizi = (Array.isArray(items) ? items : []).map((x, i) => {
      const rawName = typeof x === 'string' ? x : pick(x, 'nome', 'esercizio', 'name', 'exercise')
      if (!rawName) { errors.push(`${label}, esercizio ${i + 1}: manca il nome.`); return null }
      const nome = canonicalName(String(rawName))
      const ex = knownByKey.get(nome.toLowerCase())
      const rawRip = pick(x, 'ripetizioni', 'rip', 'reps', 'secondi')
      let note = pick(x, 'note', 'notes') ?? null
      // "8-10" → 8 ripetizioni, l'intervallo resta nelle note
      if (typeof rawRip === 'string' && /\d\s*[-–]\s*\d/.test(rawRip)) note = [`${rawRip.trim()} rip`, note].filter(Boolean).join(' · ')
      const v = {
        nome,
        serie: toNum(pick(x, 'serie', 'sets')),
        ripetizioni: toNum(rawRip),
        peso_kg: toNum(pick(x, 'peso_kg', 'peso', 'kg', 'weight')),
        rpe: toNum(pick(x, 'rpe')),
        durata_min: toNum(pick(x, 'durata_min', 'minuti', 'min')),
        distanza_km: toNum(pick(x, 'distanza_km', 'km')),
        note,
      }
      if (v.rpe != null && (v.rpe < 1 || v.rpe > 10)) { errors.push(`${nome}: RPE ${v.rpe} fuori da 1–10, ignorato.`); v.rpe = null }
      if (ex) return { ...v, esercizio: ex, unita: ex.unita }
      const unitaRaw = pick(x, 'unita', 'unit')
      const unita = ['rip', 'sec', 'cardio'].includes(unitaRaw) ? unitaRaw
        : v.durata_min != null || v.distanza_km != null ? 'cardio' : guessUnit(nome)
      return { ...v, isNew: true, unita, categoria: normCat(pick(x, 'categoria', 'category')) ?? guessCategory(nome) }
    }).filter(Boolean)
    return {
      data,
      titolo: pick(s, 'titolo', 'title') ?? null,
      note: pick(s, 'note', 'notes', 'motivazione') ?? null,
      durata_min: toNum(pick(s, 'durata_min', 'duration_min')),
      esercizi,
    }
  }).filter((s) => s.esercizi.length)
  return { sessions, errors }
}

/** Payload per rpc('allenamenti_pianifica'): solo i campi che servono al database. */
export function toPayload(sessions) {
  return sessions.map(({ data, titolo, note, durata_min, esercizi }) => ({
    data, titolo, note, durata_min,
    esercizi: esercizi.map(({ esercizio, isNew, ...v }) => (isNew ? v : { ...v, categoria: undefined, unita: undefined })),
  }))
}

const fmtDay = (iso) => iso.split('-').reverse().slice(0, 2).join('/')

/**
 * Prompt da incollare in Claude: richiesta, formato di risposta, esercizi conosciuti e storico recente.
 * `sessions` sono le sessioni fatte (dalla più recente), `history` la mappa esercizio → voci.
 */
export function buildPrompt({ sessions, history, esercizi, planned, request, data, maxSessions = 15 }) {
  const lines = []
  lines.push('Sei il mio allenatore. Preparami il prossimo allenamento in base al mio storico qui sotto,')
  lines.push('con progressione sensata (carichi, ripetizioni, recupero dei gruppi muscolari lavorati di recente).')
  lines.push('')
  lines.push(`Data prevista: ${data}`)
  lines.push(`Richiesta: ${request?.trim() || 'nessuna in particolare'}`)
  lines.push('')
  lines.push('Rispondi con una breve spiegazione e poi UN SOLO blocco ```json``` in questo formato (lo importo nella mia app):')
  lines.push(JSON.stringify({ ...ESEMPIO, data }, null, 1).replace(/\n\s*/g, ' '))
  lines.push('Regole del formato:')
  lines.push('- usa esattamente i nomi degli esercizi che conosco (elenco sotto) quando possibile;')
  lines.push('- esercizi a tempo (misura "sec"): "ripetizioni" sono i secondi per serie; cardio: "durata_min" e/o "distanza_km";')
  lines.push(`- per un esercizio nuovo aggiungi "categoria" (una tra: ${CATEGORIE.join(', ')}) e "unita" ("rip", "sec" o "cardio");`)
  lines.push('- "rpe" è lo sforzo obiettivo (1–10); "note" dell\'allenamento: il perché delle scelte, in 1–3 frasi.')
  lines.push('')

  lines.push('Esercizi che conosco (nome · categoria · misura · ultima volta · migliore):')
  const rows = esercizi
    .map((e) => ({ e, h: history.get(e.id) ?? [] }))
    .filter((x) => x.h.length)
    .sort((a, b) => b.h.at(-1).data.localeCompare(a.h.at(-1).data))
  for (const { e, h } of rows) {
    const last = h.at(-1)
    const best = e.unita === 'rip' ? Math.max(...h.map((v) => Number(v.peso_kg ?? 0))) : 0
    lines.push(`- ${e.nome} · ${e.categoria} · ${e.unita} · ${fmtDay(last.data)}: ${fmtVoce(last, e.unita)}${last.rpe ? ` RPE ${last.rpe}` : ''}${best > 0 ? ` · max ${best} kg` : ''} · ${h.length} ${h.length === 1 ? 'volta' : 'volte'}`)
  }
  lines.push('')

  const recent = sessions.slice(0, maxSessions)
  lines.push(`Ultimi ${recent.length} allenamenti (dal più recente):`)
  for (const s of recent) {
    const voci = s.voci.map((v) => `${v.esercizio.nome} ${fmtVoce(v)}${v.rpe ? ` RPE ${v.rpe}` : ''}`).join('; ')
    lines.push(`- ${s.data}${s.titolo ? ` (${s.titolo})` : ''}: ${voci}${s.note ? ` — ${s.note.replace(/\s+/g, ' ')}` : ''}`)
  }
  if (planned.length) {
    lines.push('')
    lines.push('Già programmati e non ancora svolti:')
    for (const p of planned) lines.push(`- ${p.data}${p.titolo ? ` (${p.titolo})` : ''}: ${p.voci.map((v) => v.esercizio.nome).join(', ')}`)
  }
  return lines.join('\n')
}
