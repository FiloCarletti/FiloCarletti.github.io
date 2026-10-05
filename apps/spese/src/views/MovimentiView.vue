<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSpace } from '@shared'
import { openEditor, totals, useData } from '../store.js'
import { fmtDayHeader } from '../lib/period.js'
import { fmtMoney } from '../lib/money.js'
import PeriodBar from '../components/PeriodBar.vue'
import Totals from '../components/Totals.vue'
import MovRow from '../components/MovRow.vue'

const { canWrite } = useSpace()
const { state, inPeriod, principali, secondarie, span, defaultTarget, load } = useData()
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

// Rendering a blocchi: con "Sempre" i movimenti possono essere migliaia.
const limit = ref(150)
watch([filtered, span], () => { limit.value = 150 })
const groups = computed(() => {
  const out = []
  for (const m of filtered.value.slice(0, limit.value)) {
    let g = out[out.length - 1]
    if (!g || g.data !== m.data) out.push((g = { data: m.data, rows: [], net: 0 }))
    g.rows.push(m)
    if (m.valuta === 'EUR') g.net += Number(m.importo)
  }
  return out
})
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
        <optgroup v-if="principali.length" label="Principali">
          <option v-for="c in principali" :key="c.id" :value="c.id">{{ c.nome }}</option>
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

    <section v-for="g in groups" v-else :key="g.data" class="day">
      <header class="day-head">
        <span>{{ fmtDayHeader(g.data) }}</span>
        <span class="muted">{{ fmtMoney(g.net, 'EUR', { sign: true }) }}</span>
      </header>
      <div class="card list">
        <button v-for="m in g.rows" :key="m.id" class="item" :class="{ ro: !canWrite }" :disabled="!canWrite" @click="edit(m)">
          <MovRow :m="m" :highlight="q" />
        </button>
      </div>
    </section>
    <button v-if="filtered.length > limit" class="btn" style="align-self: center" @click="limit += 300">
      Mostra altri ({{ filtered.length - limit }})
    </button>
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
.day { display: flex; flex-direction: column; gap: 6px; }
.day-head { display: flex; justify-content: space-between; font-size: .84rem; font-weight: 600; padding: 0 4px; }
.list { padding: 0 12px; }
.item { display: block; width: 100%; border: 0; background: none; color: inherit; font: inherit; text-align: left; padding: 0; cursor: pointer; }
.item + .item { border-top: 1px solid var(--border); }
.item:disabled { cursor: default; opacity: 1; }
.item:not(.ro):hover { background: color-mix(in srgb, var(--surface-2) 60%, transparent); }
</style>
