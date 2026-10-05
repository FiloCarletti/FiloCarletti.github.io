// Dati dell'app caricati una volta e condivisi dalle viste.
// Il volume è piccolo (centinaia di righe): si carica tutto e si calcola lato client.
import { computed, reactive } from 'vue'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from './db.js'
import { bestScore, e1rm, reps, volume } from './lib/metrics.js'
import { sortCats } from './lib/categories.js'

const state = reactive({ esercizi: [], sessioni: [], voci: [], loading: false, loaded: false, error: null })
let pending = null
const { spaceId } = useSpace()

async function fetchAll(table) {
  const out = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const rows = unwrap(await supabase.from(table).select('*').eq('space_id', spaceId.value).order('id').range(from, from + size - 1))
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
      const [esercizi, sessioni, voci] = await Promise.all([fetchAll(T.esercizi), fetchAll(T.sessioni), fetchAll(T.voci)])
      Object.assign(state, { esercizi, sessioni, voci, loaded: true, error: null })
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

const esById = computed(() => new Map(state.esercizi.map((e) => [e.id, e])))

/**
 * Sessioni arricchite, dalla più recente: ogni sessione ha le sue voci (con esercizio),
 * le statistiche e i record personali raggiunti.
 */
const sessions = computed(() => {
  const bySession = new Map()
  for (const v of state.voci) {
    const esercizio = esById.value.get(v.esercizio_id)
    if (!esercizio) continue
    const list = bySession.get(v.sessione_id) ?? []
    list.push({ ...v, esercizio })
    bySession.set(v.sessione_id, list)
  }
  const asc = [...state.sessioni].sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at))
  const best = new Map() // esercizio_id → miglior punteggio finora
  const out = asc.map((s) => {
    const voci = (bySession.get(s.id) ?? []).sort((a, b) => a.ordine - b.ordine)
    let vol = 0, serie = 0, rip = 0, rpeSum = 0, rpeN = 0, prs = 0
    const catVol = {}
    const catSerie = {}
    for (const v of voci) {
      const u = v.esercizio.unita
      v.volume = volume(v, u)
      v.e1rm = u === 'rip' ? e1rm(v) : null
      const score = bestScore(v, u)
      const prev = best.get(v.esercizio_id)
      v.isPR = prev != null && score != null && score > prev
      if (score != null && (prev == null || score > prev)) best.set(v.esercizio_id, score)
      if (v.isPR) prs++
      vol += v.volume
      serie += Number(v.serie ?? 0) || (u === 'cardio' ? 0 : 1)
      rip += reps(v, u)
      if (v.rpe != null) { rpeSum += Number(v.rpe); rpeN++ }
      const c = v.esercizio.categoria
      catVol[c] = (catVol[c] ?? 0) + v.volume
      catSerie[c] = (catSerie[c] ?? 0) + (Number(v.serie) || 1)
    }
    return {
      ...s,
      voci,
      stats: {
        volume: vol, serie, rip, prs,
        esercizi: voci.length,
        rpe: rpeN ? rpeSum / rpeN : null,
        categorie: sortCats(Object.keys(catSerie)),
        catVol, catSerie,
      },
    }
  })
  return out.reverse()
})

/** Per ogni esercizio: le sue voci in ordine cronologico (con data della sessione). */
const history = computed(() => {
  const map = new Map(state.esercizi.map((e) => [e.id, []]))
  for (const s of [...sessions.value].reverse()) {
    for (const v of s.voci) map.get(v.esercizio_id)?.push({ ...v, data: s.data, sessione: s })
  }
  return map
})

export function useData() {
  return { state, esById, sessions, history, load, reload }
}
