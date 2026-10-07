<script setup>
// Statistiche sulle soluzioni (già filtrate dalla vista): giorno della settimana, durata, aeroporto, compagnia, fonte,
// e confronto tra fonti sulle stesse date (Google Flights contro le tratte low cost).
import { computed } from 'vue'
import ChartBox from './ChartBox.vue'
import { compagnieDi } from '../lib/combina.js'
import { fonteNome } from '../lib/fonti.js'
import { GIORNI_LUNGHI, dow, nomeAeroporto, prezzo } from '../lib/formato.js'
import { seriesColor } from '../lib/theme.js'

const props = defineProps({ soluzioni: { type: Array, required: true }, soloAndata: { type: Boolean, default: false } })

function gruppi(keyFn) {
  const m = new Map()
  for (const s of props.soluzioni) {
    for (const k of [].concat(keyFn(s))) {
      if (k == null) continue
      const g = m.get(k) ?? { k, n: 0, min: Infinity, tot: 0 }
      g.n++
      g.tot += s.prezzo
      g.min = Math.min(g.min, s.prezzo)
      m.set(k, g)
    }
  }
  return [...m.values()].map((g) => ({ ...g, media: g.tot / g.n })).sort((a, b) => a.min - b.min)
}
const perDow = computed(() => {
  const g = new Map(gruppi((s) => dow(s.data)).map((x) => [x.k, x]))
  return [1, 2, 3, 4, 5, 6, 7].map((d) => g.get(d) ?? null)
})
const perDurata = computed(() => gruppi((s) => s.durata).sort((a, b) => a.k - b.k))
const perOrigine = computed(() => gruppi((s) => s.origine))
const perCompagnia = computed(() => gruppi((s) => [...new Set([...compagnieDi(s.andata.compagnia), ...compagnieDi(s.ritorno?.compagnia)])]))
const perFonte = computed(() => gruppi((s) => s.fonte))

const barre = (labels, sets) => ({
  labels,
  datasets: sets.map((s, i) => ({ label: s.label, data: s.data, backgroundColor: seriesColor(i), borderColor: seriesColor(i) })),
})
const chartDow = computed(() => barre(GIORNI_LUNGHI.map((g) => g.slice(0, 3)), [
  { label: 'Minimo', data: perDow.value.map((x) => (x ? Math.round(x.min) : null)) },
  { label: 'Media', data: perDow.value.map((x) => (x ? Math.round(x.media) : null)) },
]))
const chartDurata = computed(() => barre(perDurata.value.map((x) => `${x.k} gg`), [
  { label: 'Minimo', data: perDurata.value.map((x) => Math.round(x.min)) },
  { label: 'Media', data: perDurata.value.map((x) => Math.round(x.media)) },
]))
const miglioreDow = computed(() => perDow.value.map((x, i) => (x ? { i, ...x } : null)).filter(Boolean).sort((a, b) => a.media - b.media)[0])

/** Stesse date e aeroporti: Google Flights (andata e ritorno) contro la miglior combinazione low cost. */
const confronto = computed(() => {
  const low = new Map()
  const goo = new Map()
  for (const s of props.soluzioni) {
    if (!s.data_ritorno || s.ritorno_a !== s.origine) continue
    const k = `${s.origine}|${s.destinazione}|${s.data}|${s.data_ritorno}`
    const m = s.tipo === 'ar' ? goo : s.fonte.includes('google') ? null : low
    if (m && (!m.has(k) || s.prezzo < m.get(k))) m.set(k, s.prezzo)
  }
  const diff = [...goo.entries()].filter(([k]) => low.has(k)).map(([k, p]) => p - low.get(k))
  if (!diff.length) return null
  return { n: diff.length, media: diff.reduce((a, b) => a + b, 0) / diff.length, piuBasso: diff.filter((d) => d < -0.5).length }
})
</script>

<template>
  <div v-if="!soluzioni.length" class="card empty">Nessuna soluzione con questi filtri.</div>
  <div v-else class="stack">
    <p class="muted small" style="margin: 0">Calcolate sulle {{ soluzioni.length }} soluzioni che rispettano i filtri della scheda Voli.</p>
    <section class="card stack">
      <h3 style="margin: 0">Giorno di partenza</h3>
      <p v-if="miglioreDow" class="small" style="margin: 0">In media conviene partire di <strong>{{ GIORNI_LUNGHI[miglioreDow.i] }}</strong> ({{ prezzo(miglioreDow.media) }}).</p>
      <ChartBox type="bar" :data="chartDow" :height="200" label="Prezzo minimo e medio per giorno della settimana di partenza" />
    </section>
    <section v-if="!soloAndata && perDurata.length > 1" class="card stack">
      <h3 style="margin: 0">Durata</h3>
      <ChartBox type="bar" :data="chartDurata" :height="200" label="Prezzo minimo e medio per durata" />
    </section>
    <div class="grid">
      <section class="card stack">
        <h3 style="margin: 0">Aeroporto di partenza</h3>
        <table class="table small">
          <thead><tr><th>Aeroporto</th><th class="num">Min</th><th class="num">Media</th></tr></thead>
          <tbody><tr v-for="g in perOrigine" :key="g.k"><td>{{ g.k }} <span class="muted">{{ nomeAeroporto(g.k) }}</span></td><td class="num">{{ prezzo(g.min) }}</td><td class="num">{{ prezzo(g.media) }}</td></tr></tbody>
        </table>
      </section>
      <section class="card stack">
        <h3 style="margin: 0">Compagnia</h3>
        <table class="table small">
          <thead><tr><th>Compagnia</th><th class="num">Min</th><th class="num">Soluzioni</th></tr></thead>
          <tbody><tr v-for="g in perCompagnia.slice(0, 12)" :key="g.k"><td>{{ g.k }}</td><td class="num">{{ prezzo(g.min) }}</td><td class="num">{{ g.n }}</td></tr></tbody>
        </table>
      </section>
      <section class="card stack">
        <h3 style="margin: 0">Fonte</h3>
        <table class="table small">
          <thead><tr><th>Fonte</th><th class="num">Min</th><th class="num">Soluzioni</th></tr></thead>
          <tbody><tr v-for="g in perFonte" :key="g.k"><td>{{ g.k.split('+').map(fonteNome).join(' + ') }}</td><td class="num">{{ prezzo(g.min) }}</td><td class="num">{{ g.n }}</td></tr></tbody>
        </table>
        <p v-if="confronto" class="small" style="margin: 0">
          Sulle stesse date ({{ confronto.n }} confronti) Google Flights è in media
          <strong>{{ confronto.media >= 0 ? `${prezzo(confronto.media)} più caro` : `${prezzo(-confronto.media)} più economico` }}</strong>
          della miglior combinazione Ryanair/Wizz<template v-if="confronto.piuBasso">, e più economico {{ confronto.piuBasso }} volte (altre compagnie)</template>.
        </p>
      </section>
    </div>
  </div>
</template>
