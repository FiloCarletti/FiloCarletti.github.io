// Dati dell'app (spazio corrente) caricati una volta e condivisi dalle viste: supermercati, prodotti seguiti
// e offerte non ancora scadute. Lo storico prezzi e il registro delle ricerche si leggono a parte, quando servono.
// Le offerte nuove passano sempre da offerte_registra (app, import e routine di Claude): così sono univoche
// per supermercato + nome/marca/formato + inizio validità e finiscono nello storico.
import { computed, reactive } from 'vue'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from './db.js'
import { today } from './lib/dates.js'
import { compile, matches, offerText, prezzoConfronto, tokens } from './lib/match.js'

const { spaceId } = useSpace()

/* ---------- preferenze locali (solo comodità: se lo storage non c'è si usano i default) ---------- */

export function pref(key, def) {
  try { return localStorage.getItem(`offerte:${key}`) ?? def } catch { return def }
}
export function savePref(key, v) {
  try { localStorage.setItem(`offerte:${key}`, v) } catch { /* storage non disponibile */ }
}

/* ---------- dati dello spazio corrente ---------- */

const state = reactive({ supermercati: [], prodotti: [], offerte: [], loading: false, loaded: false, error: null })
let pending = null

/** Legge tutte le righe a pagine da 1000. `make` crea ogni volta la query (già filtrata e ordinata). */
export async function fetchAll(make) {
  const out = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const rows = unwrap(await make().range(from, from + size - 1))
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
      const [supermercati, prodotti, offerte] = await Promise.all([
        fetchAll(() => supabase.from(T.supermercati).select('*').eq('space_id', sid).order('id')),
        fetchAll(() => supabase.from(T.prodotti).select('*').eq('space_id', sid).order('id')),
        fetchAll(() => supabase.from(T.offerte).select('*').eq('space_id', sid).gte('valido_fino', today()).order('id')),
      ])
      Object.assign(state, { supermercati, prodotti, offerte, loaded: true, error: null })
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
export const reload = () => load(true)

const byName = (a, b) => a.nome.localeCompare(b.nome, 'it')
const supermercati = computed(() => [...state.supermercati].sort(byName))
const smById = computed(() => new Map(state.supermercati.map((s) => [s.id, s])))
const prodotti = computed(() => [...state.prodotti].sort(byName))
const compiled = computed(() => state.prodotti.map(compile))
const offerWords = computed(() => new Map(state.offerte.map((o) => [o.id, tokens(offerText(o))])))

/** Per ogni offerta, i prodotti seguiti (attivi) che la riconoscono. */
const prodottiByOffer = computed(() => {
  const out = new Map()
  const active = compiled.value.filter((c) => c.p.attivo)
  for (const o of state.offerte) {
    const words = offerWords.value.get(o.id)
    const hit = active.filter((c) => matches(words, c)).map((c) => c.p)
    if (hit.length) out.set(o.id, hit)
  }
  return out
})

/** Per ogni prodotto (anche in pausa), le offerte che lo riconoscono, dalla più conveniente. */
const offerteByProdotto = computed(() => {
  const out = new Map()
  for (const c of compiled.value) {
    const per = c.p.prezzo_per
    const list = state.offerte.filter((o) => matches(offerWords.value.get(o.id), c))
    list.sort((a, b) => (prezzoConfronto(a, per) ?? Infinity) - (prezzoConfronto(b, per) ?? Infinity) || a.prezzo - b.prezzo)
    out.set(c.p.id, list)
  }
  return out
})

/** Categorie già usate (offerte e prodotti), per i suggerimenti. */
const categorie = computed(() => {
  const set = new Set([...state.offerte, ...state.prodotti].map((x) => x.categoria).filter(Boolean))
  return [...set].sort((a, b) => a.localeCompare(b, 'it'))
})

/** Offerte che un prodotto (anche non salvato) riconoscerebbe: per l'anteprima nel modulo. */
export function previewMatches(p) {
  const c = compile(p)
  if (!c.terms.length) return []
  return state.offerte.filter((o) => matches(offerWords.value.get(o.id), c))
}

/* ---------- scritture ---------- */

function friendly(e, what) {
  if (e?.code === '23505') return new Error(`${what} con questo nome esiste già.`)
  return e
}
function putLocal(list, row) {
  const i = list.findIndex((x) => x.id === row.id)
  if (i > -1) list[i] = row
  else list.push(row)
}

export async function saveProdotto(row, id = null) {
  try {
    const q = id
      ? supabase.from(T.prodotti).update(row).eq('id', id)
      : supabase.from(T.prodotti).insert({ ...row, space_id: spaceId.value })
    const saved = unwrap(await q.select('*').single())
    putLocal(state.prodotti, saved)
    return saved
  } catch (e) {
    throw friendly(e, 'Un prodotto')
  }
}
export async function deleteProdotto(id) {
  unwrap(await supabase.from(T.prodotti).delete().eq('id', id))
  state.prodotti = state.prodotti.filter((p) => p.id !== id)
}

export async function saveSupermercato(row, id = null) {
  try {
    const q = id
      ? supabase.from(T.supermercati).update(row).eq('id', id)
      : supabase.from(T.supermercati).insert({ ...row, space_id: spaceId.value })
    const saved = unwrap(await q.select('*').single())
    putLocal(state.supermercati, saved)
    return saved
  } catch (e) {
    throw friendly(e, 'Un supermercato')
  }
}
/** Elimina il supermercato con le sue offerte e il suo storico (cascade nel DB). */
export async function deleteSupermercato(id) {
  unwrap(await supabase.from(T.supermercati).delete().eq('id', id))
  state.supermercati = state.supermercati.filter((s) => s.id !== id)
  state.offerte = state.offerte.filter((o) => o.supermercato_id !== id)
}

/** Corregge un'offerta esistente (le nuove passano da `registra`). */
export async function updateOfferta(id, patch) {
  try {
    const saved = unwrap(await supabase.from(T.offerte).update(patch).eq('id', id).select('*').single())
    putLocal(state.offerte, saved)
    if (saved.valido_fino < today()) state.offerte = state.offerte.filter((o) => o.id !== id)
    return saved
  } catch (e) {
    if (e?.code === '23505') throw new Error("Esiste già un'offerta uguale (stesso supermercato, prodotto e inizio validità).")
    throw e
  }
}
export async function deleteOfferta(id) {
  unwrap(await supabase.from(T.offerte).delete().eq('id', id))
  state.offerte = state.offerte.filter((o) => o.id !== id)
}

/**
 * Registra offerte (array, o { offerte, supermercati, note }) con la funzione del DB, che evita i duplicati,
 * crea i supermercati mancanti e annota la ricerca. Restituisce { nuove, aggiornate, scartate, errori }.
 */
export async function registra(dati, fonte = 'json') {
  const res = unwrap(await supabase.rpc('offerte_registra', { p_space_id: spaceId.value, p_dati: dati, p_fonte: fonte }))
  await reload()
  return res
}

/* ---------- moduli aperti (prodotto, offerta), mostrati da App.vue ---------- */

const ui = reactive({ prodotto: null, offerta: null })
/** { prodotto } per modificare, { fromOffer } per seguire un prodotto partendo da un'offerta, {} per uno nuovo. */
export const openProdotto = (opts = {}) => { ui.prodotto = opts }
export const closeProdotto = () => { ui.prodotto = null }
/** { offerta } per correggere, {} per inserirne una a mano. */
export const openOfferta = (opts = {}) => { ui.offerta = opts }
export const closeOfferta = () => { ui.offerta = null }

export function useData() {
  return {
    state, supermercati, smById, prodotti, prodottiByOffer, offerteByProdotto, categorie, ui, load, reload,
  }
}
