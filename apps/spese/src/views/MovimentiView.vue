<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSpace } from '@shared'
import { openEditor, totals, useData } from '../store.js'
import { fmtDayHeader, relativeBucket, today } from '../lib/period.js'
import { fmtMoney } from '../lib/money.js'
import PeriodBar from '../components/PeriodBar.vue'
import Totals from '../components/Totals.vue'
import MovRow from '../components/MovRow.vue'

const { canWrite } = useSpace()
const { state, inPeriod, catUscita, catEntrata, secondarie, span, defaultTarget, load } = useData()
onMounted(load)

const q = ref('')
const cat = ref('') // '' tutte · 'none' senza categoria · id
const tipo = ref('') // '' · 'out' · 'in'

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return inPeriod.value.filter((m) =>
    (!tipo.value || (tipo.value === 'out' ? m.importo < 0 : m.importo > 0)) &&
    (!cat.value || (cat.value === 'none' ? !m.categoria_id : m.categoria_id === cat.value || m.sottocategoria_id === cat.value)) &&
    (!s || m.descrizione.toLowerCase().includes(s) || m.conto.toLowerCase().includes(s)),
  )
})
const filtering = computed(() => !!(q.value.trim() || cat.value || tipo.value))
const t = computed(() => totals(filtered.value))

// Gruppi comprimibili (Oggi, Ieri, Questa settimana, …, poi mese per mese), e dentro i giorni.
const buckets = computed(() => {
  const t = today()
  const out = []
  for (const m of filtered.value) {
    let b = out[out.length - 1]
    const rb = relativeBucket(m.data, t)
    if (!b || b.key !== rb.key) out.push((b = { ...rb, rows: [], t: null }))
    b.rows.push(m)
  }
  for (const b of out) b.t = totals(b.rows)
  return out
})
// Aperti di default: il gruppo più recente e quelli fino a "questa settimana". Con un filtro attivo, tutti.
const OPEN = new Set(['future', 'today', 'yesterday', 'week'])
const toggled = ref(new Set())
watch(span, () => { toggled.value = new Set() })
const defaultOpen = (b, i) => i === 0 || OPEN.has(b.key)
const isOpen = (b, i) => (filtering.value && !toggled.value.has(b.key)) || (!filtering.value && defaultOpen(b, i) !== toggled.value.has(b.key))
function toggle(b) {
  const s = new Set(toggled.value)
  s.has(b.key) ? s.delete(b.key) : s.add(b.key)
  toggled.value = s
}

// Rendering a blocchi dentro ogni gruppo: un mese può avere centinaia di movimenti.
const limits = ref({})
const PAGE = 150
const days = (b) => {
  const out = []
  for (const m of b.rows.slice(0, limits.value[b.key] ?? PAGE)) {
    let d = out[out.length - 1]
    if (!d || d.data !== m.data) out.push((d = { data: m.data, rows: [], net: 0 }))
    d.rows.push(m)
    if (m.valuta === 'EUR') d.net += Number(m.importo)
  }
  return out
}
const showMore = (b) => { limits.value = { ...limits.value, [b.key]: (limits.value[b.key] ?? PAGE) + 300 } }
const hint = computed(() => `${t.value.n} ${t.value.n === 1 ? 'movimento' : 'movimenti'}${filtering.value ? ' (filtrati)' : ''}`)

function edit(m) {
  if (canWrite.value) openEditor({ movimento: m })
}
</script>

<template>
  <div class="stack" style="gap: 14px">
    <PeriodBar />
    <Totals :t="t" :hint="hint" />

    <div class="filters">
      <input v-model="q" class="input search" type="search" placeholder="Cerca descrizione o conto" aria-label="Cerca" />
      <select v-model="cat" class="select" aria-label="Categoria">
        <option value="">Tutte le categorie</option>
        <option value="none">Senza categoria</option>
        <optgroup v-if="catUscita.length" label="Uscite">
          <option v-for="c in catUscita" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </optgroup>
        <optgroup v-if="catEntrata.length" label="Entrate">
          <option v-for="c in catEntrata" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </optgroup>
        <optgroup v-if="secondarie.length" label="Secondarie">
          <option v-for="c in secondarie" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </optgroup>
      </select>
      <select v-model="tipo" class="select" aria-label="Tipo">
        <option value="">Entrate e uscite</option>
        <option value="out">Solo uscite</option>
        <option value="in">Solo entrate</option>
      </select>
    </div>

    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="state.error && !state.loaded" class="card empty">
      <p class="error-text">{{ state.error }}</p>
      <button class="btn" style="margin-top: 8px" @click="load(true)">Riprova</button>
    </div>
    <div v-else-if="!state.movimenti.length" class="card empty stack" style="align-items: center">
      <p style="font-size: 2rem; margin: 0">💶</p>
      <p style="margin: 0">Nessun movimento in questo spazio.</p>
      <div v-if="defaultTarget" class="row" style="justify-content: center">
        <button class="btn btn-primary" @click="openEditor({ segno: -1 })">Aggiungi una spesa</button>
        <RouterLink v-if="canWrite" to="/importa" class="btn">Importa da CSV</RouterLink>
      </div>
    </div>
    <div v-else-if="!filtered.length" class="card empty">
      {{ filtering ? 'Nessun movimento corrisponde ai filtri.' : 'Nessun movimento in questo periodo.' }}
    </div>

    <section v-for="(b, i) in buckets" v-else :key="b.key" class="bucket card" :class="{ open: isOpen(b, i) }">
      <button class="bucket-head" :aria-expanded="isOpen(b, i)" @click="toggle(b)">
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        <span class="bucket-title">
          <strong>{{ b.label }}</strong>
          <span class="muted small">{{ b.rows.length }} {{ b.rows.length === 1 ? 'movimento' : 'movimenti' }}<template v-if="b.t.entrate"> · entrate {{ fmtMoney(b.t.entrate) }}</template></span>
        </span>
        <span class="bucket-net" :class="b.t.netto < 0 ? 'out' : b.t.netto > 0 ? 'in' : ''">{{ fmtMoney(b.t.netto, 'EUR', { sign: true }) }}</span>
      </button>
      <div v-if="isOpen(b, i)" class="bucket-body">
        <template v-for="d in days(b)" :key="d.data">
          <div v-if="!b.single" class="day-head">
            <span>{{ fmtDayHeader(d.data) }}</span>
            <span class="muted">{{ fmtMoney(d.net, 'EUR', { sign: true }) }}</span>
          </div>
          <button v-for="m in d.rows" :key="m.id" class="item" :class="{ ro: !canWrite }" :disabled="!canWrite" @click="edit(m)">
            <MovRow :m="m" :highlight="q" />
          </button>
        </template>
        <button v-if="b.rows.length > (limits[b.key] ?? PAGE)" class="btn btn-sm more" @click="showMore(b)">
          Mostra altri ({{ b.rows.length - (limits[b.key] ?? PAGE) }})
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.filters { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; }
.filters .select { width: auto; max-width: 180px; }
@media (max-width: 560px) {
  .filters { grid-template-columns: 1fr 1fr; }
  .search { grid-column: 1 / -1; }
  .filters .select { max-width: none; width: 100%; }
}
.bucket { padding: 0; overflow: hidden; }
.bucket-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.bucket-head:hover { background: color-mix(in srgb, var(--surface-2) 60%, transparent); }
.bucket-head:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.chev { flex-shrink: 0; color: var(--muted); transition: transform .15s; }
.open .chev { transform: rotate(90deg); }
.bucket-title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.bucket-net { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bucket-net.out { color: var(--danger); }
.bucket-net.in { color: var(--ok); }
.bucket-body { padding: 0 14px 6px; border-top: 1px solid var(--border); }
.day-head { display: flex; justify-content: space-between; font-size: .8rem; font-weight: 600; padding: 10px 0 4px; color: var(--muted); }
.day-head + .item { border-top: 0; }
.more { margin: 8px auto 6px; display: flex; }
.item { display: block; width: 100%; border: 0; background: none; color: inherit; font: inherit; text-align: left; padding: 0; cursor: pointer; }
.item + .item { border-top: 1px solid var(--border); }
.item:disabled { cursor: default; opacity: 1; }
.item:not(.ro):hover { background: color-mix(in srgb, var(--surface-2) 60%, transparent); }
</style>
