// Dati dell'app (spazio corrente), condivisi dalle viste: monitoraggi, fonti attive, avvisi non letti e i voli
// attivi non ancora partiti (letti la prima volta che servono). Storico, andamento e registro si leggono a parte.
// Le soluzioni di un monitoraggio si calcolano qui dai voli con lib/combina.js, la stessa logica della routine.
import { computed, reactive } from 'vue'
import { supabase, unwrap, toast, useSpace, spaceUrl } from '@shared'
import { T } from './db.js'
import { combina, romeToday } from './lib/combina.js'

const { spaceId, info, mine } = useSpace()

/* ---------- preferenze locali (solo comodità: se lo storage non c'è si usano i default) ---------- */

export function pref(key, def) {
  try { return localStorage.getItem(`voli:${key}`) ?? def } catch { return def }
}
export function savePref(key, v) {
  try {
    if (v == null || v === '') localStorage.removeItem(`voli:${key}`)
    else localStorage.setItem(`voli:${key}`, v)
  } catch { /* storage non disponibile */ }
}

/* ---------- lettura ---------- */

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

const state = reactive({
  ricerche: [], fonti: [], nonLetti: 0, loading: false, loaded: false, error: null,
  voli: [], voliLoaded: false, voliLoading: false,
})
let pending = null
let pendingVoli = null

export function load(force = false) {
  if (pending) return pending
  if (state.loaded && !force) return Promise.resolve()
  state.loading = true
  pending = (async () => {
    try {
      const sid = spaceId.value
      const [ricerche, fonti, avvisi] = await Promise.all([
        fetchAll(() => supabase.from(T.ricerche).select('*').eq('space_id', sid).order('id')),
        fetchAll(() => supabase.from(T.fonti).select('*').eq('space_id', sid).order('id')),
        supabase.from(T.avvisi).select('id', { count: 'exact', head: true }).eq('space_id', sid).eq('letto', false),
      ])
      Object.assign(state, { ricerche, fonti, nonLetti: avvisi.count ?? 0, loaded: true, error: null })
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

/** Voli attivi da oggi in poi (tutti quelli dello spazio: di solito poche migliaia di righe). */
export function loadVoli(force = false) {
  if (pendingVoli) return pendingVoli
  if (state.voliLoaded && !force) return Promise.resolve()
  state.voliLoading = true
  pendingVoli = (async () => {
    try {
      state.voli = await fetchAll(() => supabase.from(T.voli).select('*')
        .eq('space_id', spaceId.value).eq('attivo', true).gte('data', romeToday()).order('id'))
      state.voliLoaded = true
    } catch (e) {
      toast.error(e)
    } finally {
      state.voliLoading = false
      pendingVoli = null
    }
  })()
  return pendingVoli
}

const ricerche = computed(() => [...state.ricerche].sort((a, b) =>
  (b.attiva - a.attiva) || a.partenza_da.localeCompare(b.partenza_da) || a.nome.localeCompare(b.nome, 'it')))
/** { codice: attiva } per lib/fonti.js e combina.js */
const attive = computed(() => Object.fromEntries(state.fonti.map((f) => [f.codice, f.attiva])))
const spazio = computed(() => info.value ?? null)
/** Gli altri spazi dell'app: il personale (se si sta guardando un condiviso) e i monitoraggi condivisi. */
const altriSpazi = computed(() => mine.value.filter((s) => s.id !== spaceId.value))

/** Soluzioni di un monitoraggio (opzioni: override dei criteri dai filtri della vista). */
export function soluzioni(r, override = {}) {
  return combina(r, state.voli, { attive: attive.value, override })
}

/* ---------- scritture ---------- */

function friendly(e) {
  if (e?.code === '23505') return new Error('Esiste già un monitoraggio con questo nome.')
  if (e?.code === '23514') return new Error('Controlla i campi: qualche valore non è valido (aeroporti, date o durata).')
  return e
}
function putLocal(list, row) {
  const i = list.findIndex((x) => x.id === row.id)
  if (i > -1) list[i] = row
  else list.push(row)
}

export async function saveRicerca(row, id = null) {
  try {
    const q = id
      ? supabase.from(T.ricerche).update(row).eq('id', id)
      : supabase.from(T.ricerche).insert({ ...row, space_id: spaceId.value })
    const saved = unwrap(await q.select('*').single())
    putLocal(state.ricerche, saved)
    return saved
  } catch (e) {
    throw friendly(e)
  }
}
export async function deleteRicerca(id) {
  unwrap(await supabase.from(T.ricerche).delete().eq('id', id))
  state.ricerche = state.ricerche.filter((r) => r.id !== id)
}

export async function setFonte(codice, attiva) {
  const row = unwrap(await supabase.from(T.fonti)
    .upsert({ space_id: spaceId.value, codice, attiva }, { onConflict: 'space_id,codice' })
    .select('*').single())
  putLocal(state.fonti, row)
}

export async function segnaLetti(ids) {
  if (!ids.length) return
  unwrap(await supabase.from(T.avvisi).update({ letto: true }).in('id', ids))
  state.nonLetti = Math.max(0, state.nonLetti - ids.length)
}

/** Link a una vista di un altro spazio dell'app (cambiare spazio ricarica la pagina). */
export function urlSpazio(id, path = '/') {
  const base = spaceUrl(__APP_SLUG__, id) // …/voli/#/?space=<id>
  return base.replace('#/?', `#${path}?`)
}
export function vaiASpazio(id, path = '/') {
  window.location.href = urlSpazio(id, path)
  window.location.reload()
}

/**
 * Condivide un monitoraggio: crea uno spazio condiviso con il suo nome e ce lo sposta (con avvisi, andamento e i voli
 * delle sue tratte). Poi si apre lo spazio nuovo, dove si aggiungono le persone dal pulsante "Condividi" in alto.
 */
export async function condividiRicerca(r) {
  const id = unwrap(await supabase.rpc('space_create', { p_app: __APP_SLUG__, p_name: r.nome }))
  try {
    unwrap(await supabase.rpc('voli_sposta', { p_ricerca: r.id, p_space: id }))
  } catch (e) {
    await supabase.rpc('space_delete', { p_space: id }) // lo spazio è ancora vuoto: si può togliere
    throw e
  }
  return id
}

/**
 * Elimina lo spazio condiviso corrente (solo il titolare) con tutti i suoi dati: serve vuoto per space_delete.
 * Il personale non si elimina.
 */
export async function eliminaSpazioCorrente() {
  const sid = spaceId.value
  for (const t of [T.ricerche, T.voli, T.esecuzioni, T.fonti]) {
    unwrap(await supabase.from(t).delete().eq('space_id', sid))
  }
  unwrap(await supabase.rpc('space_delete', { p_space: sid }))
}

export function useData() {
  return { state, ricerche, attive, spazio, altriSpazi, load, reload, loadVoli }
}
