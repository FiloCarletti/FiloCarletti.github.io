// Dati dell'app (spazio corrente) caricati una volta e condivisi dalle viste, più le operazioni
// che toccano altri spazi: inserire, importare, spostare o copiare movimenti in uno spazio diverso
// da quello che si sta guardando. Le categorie appartengono allo spazio: tra spazi si abbinano per nome
// (e si creano se mancano), così il vincolo "categoria dello stesso spazio" del DB è sempre rispettato.
import { computed, reactive, ref, watch } from 'vue'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from './db.js'
import { SPANS, inRange, rangeOf, today } from './lib/period.js'
import { nextColor } from './lib/theme.js'

const { spaceId, mine, info, canWrite, owners } = useSpace()

/* ---------- preferenze locali (solo comodità: se lo storage non c'è si usano i default) ---------- */

export function pref(key, def) {
  try { return localStorage.getItem(`spese:${key}`) ?? def } catch { return def }
}
export function savePref(key, v) {
  try { localStorage.setItem(`spese:${key}`, v) } catch { /* storage non disponibile */ }
}

/* ---------- periodo selezionato (condiviso tra Movimenti e Statistiche) ---------- */

const savedSpan = pref('span', 'month')
export const span = ref(SPANS.some((s) => s.key === savedSpan) ? savedSpan : 'month')
export const anchor = ref(today())
watch(span, (v) => savePref('span', v))
export const range = computed(() => rangeOf(span.value, anchor.value))

/* ---------- dati dello spazio corrente ---------- */

const state = reactive({ categorie: [], movimenti: [], autori: [], loading: false, loaded: false, error: null })
let pending = null

async function fetchAll(table, sid, cols = '*') {
  const out = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const rows = unwrap(await supabase.from(table).select(cols).eq('space_id', sid).order('id').range(from, from + size - 1))
    out.push(...rows)
    if (rows.length < size) return out
  }
}

export function load(force = false) {
  if (pending) return pending
  if (state.loaded && !force) return Promise.resolve()
  state.loading = true
  pending = (async () => {
    try {
      const sid = spaceId.value
      const [categorie, movimenti, autori] = await Promise.all([
        fetchAll(T.categorie, sid),
        fetchAll(T.movimenti, sid),
        supabase.rpc('spese_autori', { p_space: sid }).then((r) => r.data ?? []),
      ])
      Object.assign(state, { categorie, movimenti, autori, loaded: true, error: null })
      otherCats.delete(sid)
    } catch (e) {
      state.error = e.message ?? String(e)
      toast.error(e)
    } finally {
      state.loading = false
      pending = null
    }
  })()
  return pending
}

const byDateDesc = (a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at)
/** Movimenti dal più recente. */
const movimenti = computed(() => [...state.movimenti].sort(byDateDesc))
const catById = computed(() => new Map(state.categorie.map((c) => [c.id, c])))
const byName = (a, b) => a.nome.localeCompare(b.nome, 'it')
const principali = computed(() => state.categorie.filter((c) => c.livello === 'principale').sort(byName))
const secondarie = computed(() => state.categorie.filter((c) => c.livello === 'secondaria').sort(byName))
/** Quante volte è usata ogni categoria, separando uscite ed entrate (per ordinare i bottoni). */
const usage = computed(() => {
  const u = new Map()
  for (const m of state.movimenti) {
    for (const id of [m.categoria_id, m.sottocategoria_id]) {
      if (!id) continue
      const x = u.get(id) ?? { neg: 0, pos: 0, n: 0 }
      m.importo < 0 ? x.neg++ : x.pos++
      x.n++
      u.set(id, x)
    }
  }
  return u
})
const autoriById = computed(() => new Map(state.autori.map((a) => [a.user_id, a])))
/** Mostra chi ha inserito ogni movimento solo se ci sono più persone nello spazio. */
const showAutori = computed(() => state.autori.length > 1 || owners.value.length > 1)
const conti = computed(() => {
  const n = new Map()
  for (const m of state.movimenti) if (m.conto) n.set(m.conto, (n.get(m.conto) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
})
const firstDate = computed(() => state.movimenti.reduce((min, m) => (!min || m.data < min ? m.data : min), null))
/** Movimenti del periodo selezionato. */
const inPeriod = computed(() => movimenti.value.filter((m) => inRange(m.data, range.value)))

/** Entrate, uscite e netto (solo EUR; gli altri importi sono contati a parte). */
export function totals(rows) {
  let entrate = 0, uscite = 0, altre = 0
  for (const m of rows) {
    if (m.valuta !== 'EUR') { altre++; continue }
    const v = Number(m.importo)
    if (v > 0) entrate += v
    else uscite += -v
  }
  entrate = Math.round(entrate * 100) / 100
  uscite = Math.round(uscite * 100) / 100
  return { entrate, uscite, netto: Math.round((entrate - uscite) * 100) / 100, n: rows.length, altre }
}

/* ---------- spazi ---------- */

const firstName = (n = '') => n.split(' ')[0]
export function spaceLabel(s) {
  if (!s) return ''
  if (s.kind === 'shared') return s.name
  return s.role === 'owner' ? 'Personale' : `Personale di ${firstName(s.ownerName)}`
}
export const spaceIcon = (s) => (s?.kind === 'shared' ? '👥' : '👤')
/** Spazi in cui posso scrivere (titolare o co-proprietario). */
const writableSpaces = computed(() => mine.value.filter((s) => s.role === 'owner' || s.role === 'editor'))
const currentSpace = computed(() => {
  const m = mine.value.find((s) => s.id === spaceId.value)
  if (m) return m
  if (!info.value) return null
  return { id: info.value.id, kind: info.value.kind, name: info.value.name, role: info.value.my_role, ownerName: owners.value[0]?.name ?? '' }
})
/** Dove va un nuovo movimento se non si sceglie altro: lo spazio aperto, o il primo scrivibile. */
const defaultTarget = computed(() => (canWrite.value ? spaceId.value : writableSpaces.value[0]?.id ?? null))
const spaceById = (id) => mine.value.find((s) => s.id === id) ?? (id === spaceId.value ? currentSpace.value : null)

// Categorie degli altri spazi, lette quando servono (inserimento/import/spostamento verso quello spazio).
const otherCats = reactive(new Map())
export async function categorieOf(sid) {
  if (sid === spaceId.value) return state.categorie
  if (!otherCats.has(sid)) otherCats.set(sid, await fetchAll(T.categorie, sid))
  return otherCats.get(sid)
}
function cacheCats(sid, rows) {
  if (sid === spaceId.value) state.categorie.push(...rows)
  else if (otherCats.has(sid)) otherCats.get(sid).push(...rows)
}

const catKey = (livello, nome) => `${livello}|${nome.trim().toLowerCase()}`
/**
 * Garantisce che nello spazio `sid` esistano le categorie richieste ({ nome, livello, colore? })
 * e restituisce una Map "livello|nome" → id. Crea quelle mancanti.
 */
export async function ensureCategorie(sid, wanted) {
  const list = await categorieOf(sid)
  const map = new Map(list.map((c) => [catKey(c.livello, c.nome), c.id]))
  const missing = new Map()
  for (const w of wanted) {
    const nome = w?.nome?.trim()
    if (!nome) continue
    const k = catKey(w.livello, nome)
    if (!map.has(k) && !missing.has(k)) missing.set(k, w)
  }
  if (missing.size) {
    const used = list.map((c) => c.colore)
    const rows = [...missing.values()].map((w) => {
      const colore = w.colore ?? nextColor(used)
      used.push(colore)
      return { space_id: sid, livello: w.livello, nome: w.nome.trim(), colore }
    })
    try {
      const created = unwrap(await supabase.from(T.categorie).insert(rows).select('*'))
      cacheCats(sid, created)
      for (const c of created) map.set(catKey(c.livello, c.nome), c.id)
    } catch (e) {
      // Creata nel frattempo da qualcun altro (vincolo di unicità): rileggi.
      if (e.code !== '23505') throw e
      const fresh = await fetchAll(T.categorie, sid)
      if (sid === spaceId.value) state.categorie = fresh
      else otherCats.set(sid, fresh)
      for (const c of fresh) map.set(catKey(c.livello, c.nome), c.id)
    }
  }
  return map
}
export const lookupCat = (map, livello, nome) => (nome ? map.get(catKey(livello, nome)) ?? null : null)

/* ---------- scritture ---------- */

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

/** Inserisce movimenti nello spazio `sid` (righe con categoria_id già risolte). */
export async function insertMovimenti(sid, rows, onProgress) {
  const out = []
  for (const part of chunks(rows, 500)) {
    const created = unwrap(await supabase.from(T.movimenti).insert(part.map((r) => ({ ...r, space_id: sid }))).select('*'))
    out.push(...created)
    onProgress?.(out.length)
  }
  if (sid === spaceId.value) state.movimenti.push(...out)
  return out
}

function applyLocal(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  state.movimenti = state.movimenti
    .map((m) => byId.get(m.id) ?? m)
    .filter((m) => m.space_id === spaceId.value)
}

export async function updateMovimento(id, patch) {
  const row = unwrap(await supabase.from(T.movimenti).update(patch).eq('id', id).select('*').single())
  applyLocal([row])
  return row
}

export async function updateMany(ids, patch) {
  const out = []
  for (const part of chunks(ids, 150)) {
    out.push(...unwrap(await supabase.from(T.movimenti).update(patch).in('id', part).select('*')))
  }
  applyLocal(out)
  return out
}

export async function deleteMany(ids) {
  for (const part of chunks(ids, 150)) unwrap(await supabase.from(T.movimenti).delete().in('id', part))
  const set = new Set(ids)
  state.movimenti = state.movimenti.filter((m) => !set.has(m.id))
}

/**
 * Sposta (o copia) movimenti dello spazio corrente nello spazio `target`.
 * Le categorie si abbinano per nome e, se mancano, si creano nello spazio di destinazione.
 */
export async function transferMovimenti(rows, target, { copy = false } = {}) {
  const name = (id) => catById.value.get(id)?.nome
  const wanted = rows.flatMap((m) => [
    { livello: 'principale', nome: name(m.categoria_id), colore: catById.value.get(m.categoria_id)?.colore },
    { livello: 'secondaria', nome: name(m.sottocategoria_id), colore: catById.value.get(m.sottocategoria_id)?.colore },
  ])
  const map = await ensureCategorie(target, wanted)
  const resolve = (m) => ({
    categoria_id: lookupCat(map, 'principale', name(m.categoria_id)),
    sottocategoria_id: lookupCat(map, 'secondaria', name(m.sottocategoria_id)),
  })
  if (copy) {
    return insertMovimenti(target, rows.map((m) => ({
      data: m.data, conto: m.conto, importo: m.importo, valuta: m.valuta, descrizione: m.descrizione, ...resolve(m),
    })))
  }
  // Un update per ogni coppia di categorie di destinazione.
  const groups = new Map()
  for (const m of rows) {
    const r = resolve(m)
    const k = `${r.categoria_id}|${r.sottocategoria_id}`
    if (!groups.has(k)) groups.set(k, { patch: { space_id: target, ...r }, ids: [] })
    groups.get(k).ids.push(m.id)
  }
  for (const g of groups.values()) await updateMany(g.ids, g.patch)
}

/* ---------- categorie dello spazio corrente ---------- */

export async function addCategoria(nome, livello) {
  const map = await ensureCategorie(spaceId.value, [{ nome, livello }])
  return lookupCat(map, livello, nome)
}
export async function updateCategoria(id, patch) {
  const row = unwrap(await supabase.from(T.categorie).update(patch).eq('id', id).select('*').single())
  const i = state.categorie.findIndex((c) => c.id === id)
  if (i > -1) state.categorie[i] = row
}
export async function deleteCategoria(id) {
  unwrap(await supabase.from(T.categorie).delete().eq('id', id))
  state.categorie = state.categorie.filter((c) => c.id !== id)
  // Il DB mette a null la categoria nei movimenti: allinea la copia locale.
  for (const m of state.movimenti) {
    if (m.categoria_id === id) m.categoria_id = null
    if (m.sottocategoria_id === id) m.sottocategoria_id = null
  }
}
/** Unisce la categoria `fromId` in `toId` (stesso livello) ed elimina la prima. */
export async function mergeCategoria(fromId, toId) {
  const from = catById.value.get(fromId)
  const col = from.livello === 'principale' ? 'categoria_id' : 'sottocategoria_id'
  const ids = state.movimenti.filter((m) => m[col] === fromId).map((m) => m.id)
  if (ids.length) await updateMany(ids, { [col]: toId })
  await deleteCategoria(fromId)
}

/* ---------- editor rapido (aperto dal bottone flottante o da una riga) ---------- */

const editor = reactive({ open: false, segno: -1, movimento: null })
export function openEditor({ segno = -1, movimento = null } = {}) {
  Object.assign(editor, { open: true, segno: movimento ? Math.sign(movimento.importo) : segno, movimento })
}
export const closeEditor = () => { editor.open = false }

export function useData() {
  return {
    state, movimenti, inPeriod, catById, principali, secondarie, usage, autoriById, showAutori, conti, firstDate,
    writableSpaces, currentSpace, defaultTarget, spaceById, editor,
    span, anchor, range, load,
  }
}
