// Dati dello spazio corrente caricati una volta e condivisi dalle viste: pasti, obiettivi e report.
import { reactive } from 'vue'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from './db.js'
import { DEFAULT_OBIETTIVI } from './lib/analisi.js'

const { spaceId } = useSpace()

export const state = reactive({
  pasti: [], obiettivi: { ...DEFAULT_OBIETTIVI }, obiettiviId: null, report: [],
  loading: false, loaded: false, error: null,
})
export const ui = reactive({ pasto: null }) // pasto in modifica (oggetto) o null

async function fetchAll(make) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const rows = unwrap(await make().range(from, from + 999))
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

let pending = null
export function load(force = false) {
  if (pending) return pending
  if (state.loaded && !force) return Promise.resolve()
  state.loading = true
  pending = (async () => {
    try {
      const sid = spaceId.value
      const [pasti, ob, report] = await Promise.all([
        fetchAll(() => supabase.from(T.pasti).select('*').eq('space_id', sid).order('data', { ascending: false }).order('id')),
        supabase.from(T.obiettivi).select('*').eq('space_id', sid).maybeSingle().then(unwrap),
        fetchAll(() => supabase.from(T.report).select('*').eq('space_id', sid).order('al', { ascending: false }).order('id')),
      ])
      Object.assign(state, {
        pasti, report,
        obiettivi: { ...DEFAULT_OBIETTIVI, ...(ob ?? {}) },
        obiettiviId: ob?.id ?? null,
        loaded: true, error: null,
      })
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

/** Salva un pasto (nuovo o esistente) dalla scheda di modifica. */
export async function salvaPasto(p) {
  const { id, space_id: _s, owner_id: _o, created_at: _c, updated_at: _u, ...campi } = p
  if (id) unwrap(await supabase.from(T.pasti).update(campi).eq('id', id).select())
  else unwrap(await supabase.from(T.pasti).insert({ ...campi, space_id: spaceId.value }).select())
  await load(true)
}

export async function eliminaPasto(id) {
  unwrap(await supabase.from(T.pasti).delete().eq('id', id))
  await load(true)
}

export async function salvaObiettivi(o) {
  const { id: _i, space_id: _s, owner_id: _o, created_at: _c, updated_at: _u, ...campi } = o
  if (state.obiettiviId) unwrap(await supabase.from(T.obiettivi).update(campi).eq('id', state.obiettiviId).select())
  else unwrap(await supabase.from(T.obiettivi).insert({ ...campi, space_id: spaceId.value }).select())
  await load(true)
}

export async function eliminaReport(id) {
  unwrap(await supabase.from(T.report).delete().eq('id', id))
  await load(true)
}
