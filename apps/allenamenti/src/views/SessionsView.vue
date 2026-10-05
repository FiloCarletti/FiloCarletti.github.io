<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from '../db.js'
import { useData } from '../store.js'
import SessionCard from '../components/SessionCard.vue'
import PlannedCard from '../components/PlannedCard.vue'
import { sortCats } from '../lib/categories.js'
import { fmtKg, fmtLong, fmtMonth, fmtNum } from '../lib/metrics.js'

const { state, sessions, planned, history, load, reload } = useData()
const { canWrite } = useSpace()
const route = useRoute()
const router = useRouter()
onMounted(load)

// I filtri stanno nella query string: si possono condividere e sopravvivono al refresh.
function bind(key) {
  return computed({
    get: () => route.query[key] ?? '',
    set: (v) => router.replace({ query: { ...route.query, [key]: v || undefined } }),
  })
}
const ex = bind('esercizio')
const cat = bind('categoria')
const q = bind('q')

const exercises = computed(() => [...state.esercizi].sort((a, b) => a.nome.localeCompare(b.nome, 'it')))
const cats = computed(() => sortCats([...new Set(state.esercizi.map((e) => e.categoria))]))

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return sessions.value.filter((x) => {
    if (ex.value && !x.voci.some((v) => v.esercizio_id === ex.value)) return false
    if (cat.value && !x.voci.some((v) => v.esercizio.categoria === cat.value)) return false
    if (s && ![x.titolo, x.note, ...x.voci.map((v) => `${v.esercizio.nome} ${v.note ?? ''}`)].join(' ').toLowerCase().includes(s)) return false
    return true
  })
})

const groups = computed(() => {
  const out = []
  for (const s of filtered.value) {
    const key = s.data.slice(0, 7)
    if (out.at(-1)?.key !== key) out.push({ key, label: fmtMonth(s.data), items: [] })
    out.at(-1).items.push(s)
  }
  return out
})

// Riepilogo dell'esercizio filtrato.
const exSummary = computed(() => {
  if (!ex.value) return null
  const h = history.value.get(ex.value) ?? []
  if (!h.length) return null
  const e = h[0].esercizio
  const pesi = h.map((v) => Number(v.peso_kg ?? 0))
  return {
    e, n: new Set(h.map((v) => v.sessione_id)).size,
    max: Math.max(...pesi),
    vol: h.reduce((a, v) => a + v.volume, 0),
    last: h.at(-1),
  }
})

async function remove(s) {
  if (!confirm(`Eliminare l'allenamento del ${fmtLong(s.data)}?`)) return
  try {
    unwrap(await supabase.from(T.sessioni).delete().eq('id', s.id))
    toast.ok('Allenamento eliminato')
    await reload()
  } catch (e) {
    toast.error(e)
  }
}

const reset = () => router.replace({ query: {} })
</script>

<template>
  <div class="stack" style="gap: 16px">
    <div class="filters">
      <label class="field">
        <span>Esercizio</span>
        <select v-model="ex" class="select">
          <option value="">Tutti</option>
          <option v-for="e in exercises" :key="e.id" :value="e.id">{{ e.nome }}</option>
        </select>
      </label>
      <label class="field">
        <span>Categoria</span>
        <select v-model="cat" class="select">
          <option value="">Tutte</option>
          <option v-for="c in cats" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="field search">
        <span>Cerca</span>
        <input v-model.lazy="q" class="input" type="search" placeholder="Esercizio, note…" />
      </label>
    </div>

    <div v-if="exSummary" class="card summary">
      <div>
        <div class="muted small">Esercizio selezionato</div>
        <strong>{{ exSummary.e.nome }}</strong>
      </div>
      <div><div class="muted small">Volte</div><strong>{{ exSummary.n }}</strong></div>
      <div v-if="exSummary.max > 0"><div class="muted small">Peso max</div><strong>{{ fmtNum(exSummary.max) }} kg</strong></div>
      <div v-if="exSummary.vol > 0"><div class="muted small">Volume tot.</div><strong>{{ fmtKg(exSummary.vol) }}</strong></div>
      <RouterLink :to="`/esercizi/${exSummary.e.id}`" class="btn btn-sm">Progressi →</RouterLink>
    </div>

    <section v-if="planned.length || (canWrite && state.loaded)" class="stack">
      <div class="row-between">
        <h2 class="month" style="text-transform: none">Da fare <span v-if="planned.length" class="muted small">· {{ planned.length }}</span></h2>
        <RouterLink v-if="canWrite && planned.length" to="/programma" class="btn btn-ghost btn-sm">+ Programma</RouterLink>
      </div>
      <PlannedCard v-for="p in planned" :key="p.id" :session="p" />
      <RouterLink v-if="!planned.length" to="/programma" class="card plan-cta">
        <strong>Programma il prossimo allenamento</strong>
        <span class="muted small">Fallo preparare a Claude dal tuo storico, importalo da JSON o scrivilo a mano: poi lo confermi mentre ti alleni.</span>
      </RouterLink>
    </section>

    <div class="row-between">
      <span class="muted small">{{ filtered.length }} allenament{{ filtered.length === 1 ? 'o' : 'i' }}<template v-if="ex || cat || q"> · <a href="#" @click.prevent="reset">azzera filtri</a></template></span>
      <RouterLink v-if="canWrite" to="/importa" class="btn btn-ghost btn-sm">Importa da foglio</RouterLink>
    </div>

    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="state.error && !state.loaded" class="card empty">
      <p class="error-text">{{ state.error }}</p>
      <button class="btn" style="margin-top: 12px" @click="reload">Riprova</button>
    </div>
    <div v-else-if="!sessions.length && !planned.length" class="card empty stack" style="align-items: center">
      <p style="margin: 0">Nessun allenamento ancora.</p>
      <div v-if="canWrite" class="row" style="justify-content: center">
        <RouterLink to="/importa" class="btn">Importa dal foglio Google</RouterLink>
        <RouterLink to="/allenamenti/nuovo" class="btn btn-primary">Registra il primo</RouterLink>
      </div>
    </div>
    <div v-else-if="sessions.length && !filtered.length" class="card empty">Nessun allenamento corrisponde ai filtri.</div>

    <section v-for="g in groups" :key="g.key" class="stack">
      <h2 class="month">{{ g.label }} <span class="muted small">· {{ g.items.length }}</span></h2>
      <SessionCard v-for="s in g.items" :key="s.id" :session="s" :highlight="ex" @delete="remove" />
    </section>
  </div>
</template>

<style scoped>
.filters { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
.filters .search { grid-column: 1 / -1; }
@media (min-width: 720px) { .filters { grid-template-columns: 1fr 1fr 1.2fr; } .filters .search { grid-column: auto; } }
.month { font-size: 1rem; text-transform: capitalize; margin: 4px 0 0; }
.summary { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; background: var(--primary-soft); border-color: transparent; box-shadow: none; }
.summary .btn { margin-left: auto; }
.plan-cta { display: flex; flex-direction: column; gap: 2px; border-style: dashed; box-shadow: none; text-decoration: none; color: var(--text); }
.plan-cta:hover { border-color: var(--primary); }
</style>
