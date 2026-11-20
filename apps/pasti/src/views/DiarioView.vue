<script setup>
// Diario: pasti raggruppati per giorno, dal più recente, con totale calorie del giorno.
import { computed, onMounted, ref } from 'vue'
import { useSpace } from '@shared'
import PastoCard from '../components/PastoCard.vue'
import { load, state, ui } from '../store.js'
import { TIPI, fmt } from '../lib/analisi.js'
import { fmtLong, today } from '../lib/dates.js'

const { canWrite } = useSpace()
onMounted(() => load())

const ORDINE = Object.fromEntries(TIPI.map((t, i) => [t.key, i]))
const PAGINA = 14
const quanti = ref(PAGINA)

const giorni = computed(() => {
  const by = new Map()
  for (const p of state.pasti) {
    if (!by.has(p.data)) by.set(p.data, [])
    by.get(p.data).push(p)
  }
  return [...by.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([data, pasti]) => ({
      data,
      pasti: pasti.sort((a, b) => ORDINE[a.tipo] - ORDINE[b.tipo]),
      kcal: pasti.reduce((s, p) => s + (p.kcal ?? 0), 0),
      stimata: pasti.some((p) => p.data_stimata),
    }))
})
const visibili = computed(() => giorni.value.slice(0, quanti.value))

const nuovo = () => { ui.pasto = { data: today(), tipo: 'pranzo' } }
</script>

<template>
  <div class="stack">
    <div v-if="canWrite" class="row-between">
      <span class="muted small">Di solito i pasti li registra Claude dalle tue foto. Qui puoi correggerli o aggiungerne a mano.</span>
      <button type="button" class="btn btn-primary btn-sm" @click="nuovo">+ Pasto</button>
    </div>

    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!giorni.length" class="card empty">Nessun pasto registrato.</div>

    <section v-for="g in visibili" :key="g.data" class="card day">
      <header class="row-between">
        <h3 class="cap">{{ fmtLong(g.data) }} <span v-if="g.stimata" class="badge" title="Data ricostruita (foto senza data)">data stimata</span></h3>
        <span class="muted small">{{ fmt(g.kcal) }} kcal</span>
      </header>
      <PastoCard v-for="p in g.pasti" :key="p.id" :p="p" :can-write="canWrite" @edit="(x) => (ui.pasto = { ...x })" />
    </section>

    <button v-if="giorni.length > quanti" type="button" class="btn" @click="quanti += PAGINA">Mostra altri giorni</button>
  </div>
</template>

<style scoped>
.day { padding-bottom: 4px; }
.day header h3 { margin: 0; }
.cap::first-letter { text-transform: uppercase; }
</style>
