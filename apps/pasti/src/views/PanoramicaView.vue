<script setup>
// Panoramica: copertura dei dati, ultimo report di Claude, semaforo di carenze/eccessi, macro e andamento.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ChartBox from '../components/ChartBox.vue'
import Controllo from '../components/Controllo.vue'
import { state, load } from '../store.js'
import { TIPI, TIPO, analizza, fmt } from '../lib/analisi.js'
import { addDays, fmtShort, mondayOf, today } from '../lib/dates.js'
import { seriesColor } from '../lib/theme.js'

onMounted(() => load())

const PERIODI = [
  { key: 7, label: '7 giorni' },
  { key: 30, label: '30 giorni' },
  { key: 90, label: '3 mesi' },
  { key: 0, label: 'Tutto' },
]
const periodo = ref(30)
const dal = computed(() => (periodo.value ? addDays(today(), -(periodo.value - 1)) : null))
const a = computed(() => analizza(state.pasti, state.obiettivi, dal.value, today()))

const report = computed(() => state.report[0] ?? null)
const daMigliorare = computed(() => a.value.controlli.filter((c) => c.livello !== 'ok'))
const bene = computed(() => a.value.controlli.filter((c) => c.livello === 'ok'))
const quota = computed(() => Math.round(a.value.scala * 100))
const giornataLabel = computed(() => (a.value.mancanti.length ? 'Pasti registrati, media al giorno' : 'Giornata tipo'))
const mancantiTxt = computed(() => {
  const nomi = a.value.mancanti.map((k) => TIPO[k].label.toLowerCase())
  return nomi.length > 1 ? `${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}` : nomi[0]
})

const MACRO = [
  { key: 'proteine', label: 'Proteine', ref: '12–20%' },
  { key: 'carboidrati', label: 'Carboidrati', ref: '45–60%' },
  { key: 'grassi', label: 'Grassi', ref: '20–35%' },
]

// Calorie per giorno, impilate per tipo di pasto (solo i giorni con dati).
const kcalChart = computed(() => {
  const giorni = a.value.giorni.slice(-31)
  return {
    labels: giorni.map(fmtShort),
    datasets: TIPI.map((t, i) => ({
      label: t.label,
      data: giorni.map((d) => a.value.rows.filter((p) => p.data === d && p.tipo === t.key).reduce((s, p) => s + (p.kcal ?? 0), 0) || null),
      backgroundColor: seriesColor(i),
      borderColor: 'transparent',
      stack: 'k',
      maxBarThickness: 28,
    })).filter((ds) => ds.data.some((v) => v)),
  }
})
const kcalOptions = { scales: { x: { stacked: true }, y: { stacked: true } } }

// Qualità media per settimana.
const qualitaChart = computed(() => {
  const by = new Map()
  for (const p of a.value.rows) {
    if (p.punteggio == null) continue
    const w = mondayOf(p.data)
    const e = by.get(w) ?? { s: 0, n: 0 }
    e.s += p.punteggio; e.n += 1
    by.set(w, e)
  }
  const weeks = [...by.keys()].sort()
  return {
    labels: weeks.map((w) => `sett. ${fmtShort(w)}`),
    datasets: [{ label: 'Qualità media', data: weeks.map((w) => +(by.get(w).s / by.get(w).n).toFixed(1)), borderColor: seriesColor(0), backgroundColor: seriesColor(0) }],
  }
})
const qualitaOptions = { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 10, beginAtZero: true } } }
</script>

<template>
  <div class="stack">
    <div class="periodi" role="group" aria-label="Periodo">
      <button v-for="p in PERIODI" :key="p.key" type="button" class="chip" :class="{ on: periodo === p.key }" @click="periodo = p.key">{{ p.label }}</button>
    </div>

    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>

    <div v-else-if="!state.pasti.length" class="card empty stack">
      <p style="font-size: 2rem; margin: 0">🥗</p>
      <p><strong>Nessun pasto registrato.</strong></p>
      <p class="small">Manda a Claude la foto del vassoio o descrivi cosa hai mangiato: stima i valori e li registra qui.</p>
    </div>

    <div v-else-if="!a.rows.length" class="card empty">Nessun pasto negli ultimi {{ periodo }} giorni.</div>

    <template v-else>
      <!-- Copertura -->
      <section class="card stack">
        <div class="row-between">
          <h2 style="margin: 0">{{ a.rows.length }} pasti in {{ a.giorni.length }} giorni</h2>
          <span v-if="a.punteggio != null" class="badge badge-primary">qualità media {{ fmt(a.punteggio, 1) }}/10</span>
        </div>
        <div class="tipi">
          <div v-for="t in TIPI" :key="t.key" class="tipo" :class="{ vuoto: !a.perTipo[t.key].n }">
            <span class="muted small">{{ t.icon }} {{ t.label }}</span>
            <strong>{{ a.perTipo[t.key].n ? `${fmt(a.perTipo[t.key].nutrienti.kcal)} kcal` : '—' }}</strong>
            <span class="muted small">{{ a.perTipo[t.key].n }} registrati</span>
          </div>
        </div>
        <p v-if="a.mancanti.length" class="small muted nota">
          Mancano {{ mancantiTxt }}: gli obiettivi giornalieri sono ridotti al {{ quota }}%, la quota dei pasti registrati.
          Le frequenze settimanali (legumi, pesce, carni, fritti) sono stimate come se tutti i pranzi e le cene fossero simili a quelli registrati.
        </p>
      </section>

      <!-- Ultimo report di Claude -->
      <section v-if="report" class="card stack">
        <div class="row-between">
          <h2 style="margin: 0">💬 {{ report.titolo || 'Ultimo report' }}</h2>
          <span class="muted small">{{ fmtShort(report.dal) }} – {{ fmtShort(report.al) }}</span>
        </div>
        <p v-if="report.sintesi" class="sintesi">{{ report.sintesi }}</p>
        <div v-if="report.consigli?.length">
          <span class="label">Cosa cambiare</span>
          <ol class="lista"><li v-for="(c, i) in report.consigli" :key="i">{{ c }}</li></ol>
        </div>
        <RouterLink to="/report" class="small">Tutti i report →</RouterLink>
      </section>

      <!-- Semaforo -->
      <section class="grid2">
        <div class="card">
          <h2>Da migliorare</h2>
          <p v-if="!daMigliorare.length" class="muted">Niente da segnalare in questo periodo. 👏</p>
          <Controllo v-for="c in daMigliorare" :key="c.key" :c="c" />
        </div>
        <div class="card">
          <h2>Va bene</h2>
          <p v-if="!bene.length" class="muted">Ancora nessuna voce in linea con gli obiettivi.</p>
          <Controllo v-for="c in bene" :key="c.key" :c="c" />
        </div>
      </section>

      <!-- Giornata e macro -->
      <section class="card stack">
        <h2 style="margin: 0">{{ giornataLabel }}</h2>
        <div class="kpi">
          <div><span class="muted small">Energia</span><strong>{{ fmt(a.giornata.nutrienti.kcal) }}</strong><span class="muted small">kcal</span></div>
          <div><span class="muted small">Proteine</span><strong>{{ fmt(a.giornata.nutrienti.proteine_g) }}</strong><span class="muted small">g</span></div>
          <div><span class="muted small">Fibre</span><strong>{{ fmt(a.giornata.nutrienti.fibre_g) }}</strong><span class="muted small">g</span></div>
          <div><span class="muted small">Verdura</span><strong>{{ fmt(a.giornata.gruppi.verdura) }}</strong><span class="muted small">g</span></div>
          <div><span class="muted small">Frutta</span><strong>{{ fmt(a.giornata.gruppi.frutta) }}</strong><span class="muted small">g</span></div>
          <div><span class="muted small">Sodio</span><strong>{{ fmt(a.giornata.nutrienti.sodio_mg) }}</strong><span class="muted small">mg</span></div>
        </div>
        <div v-if="a.macro">
          <span class="label">Da dove vengono le calorie</span>
          <div class="macro" role="img" :aria-label="MACRO.map((m) => `${m.label} ${Math.round(a.macro[m.key] * 100)}%`).join(', ')">
            <div v-for="(m, i) in MACRO" :key="m.key" class="seg" :style="{ flex: a.macro[m.key], background: seriesColor(i) }" />
          </div>
          <div class="legend small">
            <span v-for="(m, i) in MACRO" :key="m.key"><i :style="{ background: seriesColor(i) }" />{{ m.label }} <strong>{{ Math.round(a.macro[m.key] * 100) }}%</strong> <span class="muted">(rif. {{ m.ref }})</span></span>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Calorie per giorno</h2>
        <ChartBox type="bar" :data="kcalChart" :options="kcalOptions" label="Calorie per giorno divise per tipo di pasto" />
      </section>

      <section v-if="qualitaChart.labels.length > 1" class="card">
        <h2>Qualità media per settimana</h2>
        <ChartBox type="line" :data="qualitaChart" :options="qualitaOptions" :height="200" label="Qualità media dei pasti per settimana, da 1 a 10" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.periodi { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: .88rem; cursor: pointer; }
.chip.on { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.tipi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.tipo { display: flex; flex-direction: column; padding: 8px 10px; border-radius: var(--radius); background: var(--surface-2); }
.tipo.vuoto { opacity: .6; }
@media (max-width: 520px) { .tipi { grid-template-columns: 1fr 1fr; } }
.nota { margin: 0; }
.sintesi { margin: 0; white-space: pre-line; }
.lista { margin: 4px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.grid2 { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); align-items: start; }
.grid2 h2 { margin-bottom: 0; }
.kpi { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; }
.kpi div { display: flex; flex-direction: column; }
.kpi strong { font-size: 1.3rem; font-variant-numeric: tabular-nums; line-height: 1.2; }
.macro { display: flex; gap: 2px; height: 14px; margin: 6px 0; }
.seg { border-radius: 4px; min-width: 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
</style>
