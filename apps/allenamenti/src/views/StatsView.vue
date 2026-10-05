<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useSpace } from '@shared'
import { useData } from '../store.js'
import ChartBox from '../components/ChartBox.vue'
import StatTile from '../components/StatTile.vue'
import WeekHeatmap from '../components/WeekHeatmap.vue'
import CatDot from '../components/CatDot.vue'
import { catColor, sortCats } from '../lib/categories.js'
import { DAY, daysBetween, fmtAgo, fmtKg, fmtNum, fmtPct, fmtShort, fmtVoce, parseISO, toISO, weekStart } from '../lib/metrics.js'
import { accent } from '../lib/theme.js'

const { state, sessions, history, load } = useData()
const router = useRouter()
const { canWrite } = useSpace()
onMounted(load)

const PERIODS = [
  { value: 30, label: '30 giorni' },
  { value: 90, label: '3 mesi' },
  { value: 180, label: '6 mesi' },
  { value: 365, label: '12 mesi' },
  { value: 0, label: 'Tutto' },
]
const period = ref(0)
const cat = ref('')

const today = parseISO(toISO(new Date()))
const allCats = computed(() => sortCats([...new Set(state.esercizi.map((e) => e.categoria))]))

/** Sessione vista attraverso il filtro categoria: solo le voci della categoria scelta. */
function view(s) {
  if (!cat.value) return { ...s, vol: s.stats.volume, serie: s.stats.serie, rip: s.stats.rip, prs: s.stats.prs, voci: s.voci }
  const voci = s.voci.filter((v) => v.esercizio.categoria === cat.value)
  if (!voci.length) return null
  return {
    ...s, voci,
    vol: voci.reduce((a, v) => a + v.volume, 0),
    serie: s.stats.catSerie[cat.value] ?? 0,
    rip: voci.reduce((a, v) => a + (v.esercizio.unita === 'rip' ? (v.serie ?? 0) * (v.ripetizioni ?? 0) : 0), 0),
    prs: voci.filter((v) => v.isPR).length,
  }
}

function inRange(s, from, to) {
  const d = parseISO(s.data)
  return (!from || d >= from) && d <= to
}

const range = computed(() => {
  if (!period.value) return { from: null, prevFrom: null, prevTo: null }
  const from = new Date(today.getTime() - (period.value - 1) * DAY)
  return { from, prevFrom: new Date(from.getTime() - period.value * DAY), prevTo: new Date(from.getTime() - DAY) }
})

const list = computed(() => sessions.value.filter((s) => inRange(s, range.value.from, today)).map(view).filter(Boolean))
const prevList = computed(() =>
  range.value.prevFrom ? sessions.value.filter((s) => inRange(s, range.value.prevFrom, range.value.prevTo)).map(view).filter(Boolean) : null,
)
const asc = computed(() => [...list.value].reverse())

const sum = (arr, k) => arr.reduce((a, s) => a + s[k], 0)
const delta = (cur, prev) => (prevList.value && prev > 0 ? fmtPct(cur / prev - 1) : '')

/** Settimane del periodo, dalla prima con dati (o inizio periodo) alla corrente. */
const weeks = computed(() => {
  const first = range.value.from ?? (asc.value[0] ? parseISO(asc.value[0].data) : today)
  const out = []
  for (let w = weekStart(first); w <= today; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
    out.push({ start: toISO(w), n: 0, vol: 0 })
  }
  const idx = new Map(out.map((w, i) => [w.start, i]))
  for (const s of list.value) {
    const w = out[idx.get(toISO(weekStart(parseISO(s.data))))]
    if (w) { w.n++; w.vol += s.vol }
  }
  return out
})

const kpi = computed(() => {
  const l = list.value
  const p = prevList.value ?? []
  const vol = sum(l, 'vol')
  const active = weeks.value.filter((w) => w.n > 0).length
  let streak = 0, best = 0
  for (const w of weeks.value) { streak = w.n ? streak + 1 : 0; best = Math.max(best, streak) }
  // settimane "attive" contate fino all'ultima con dati se il periodo è "Tutto"
  const span = period.value ? weeks.value.length : Math.max(1, weeks.value.findLastIndex((w) => w.n > 0) + 1)
  return {
    n: l.length,
    nDelta: delta(l.length, p.length),
    vol,
    volDelta: delta(vol, sum(p, 'vol')),
    volAvg: l.length ? vol / l.length : 0,
    serie: sum(l, 'serie'),
    rip: sum(l, 'rip'),
    prs: sum(l, 'prs'),
    freq: l.length / span,
    active, span, best,
    last: l[0]?.data ?? null,
    exercises: new Set(l.flatMap((s) => s.voci.map((v) => v.esercizio_id))).size,
  }
})

/* ---------- grafici ---------- */

const volumeChart = computed(() => {
  const s = asc.value
  const cats = cat.value ? [cat.value] : sortCats([...new Set(s.flatMap((x) => x.stats.categorie))])
  return {
    labels: s.map((x) => fmtShort(x.data)),
    datasets: cats
      .map((c) => ({
        label: c,
        data: s.map((x) => Math.round(x.voci.filter((v) => v.esercizio.categoria === c).reduce((a, v) => a + v.volume, 0))),
        backgroundColor: catColor(c),
        borderColor: 'transparent',
        stack: 'v',
        maxBarThickness: 36,
      }))
      .filter((d) => d.data.some((v) => v > 0)),
  }
})
const kgTicks = { callback: (v) => (v >= 1000 ? `${v / 1000}t` : v) }
const volumeOpts = {
  scales: { x: { stacked: true }, y: { stacked: true, ticks: kgTicks } },
  plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtKg(c.raw)}`, footer: (items) => `Totale: ${fmtKg(items.reduce((a, i) => a + i.raw, 0))}` } } },
}

const weeklyChart = computed(() => ({
  labels: weeks.value.map((w) => fmtShort(w.start)),
  datasets: [{ label: 'Allenamenti', data: weeks.value.map((w) => w.n), backgroundColor: accent(), maxBarThickness: 18 }],
}))
const weeklyOpts = {
  plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => `Settimana del ${i[0].label}` } } },
  scales: { y: { ticks: { stepSize: 1, precision: 0 } } },
}

const catChart = computed(() => {
  const tot = {}
  for (const s of list.value) for (const v of s.voci) tot[v.esercizio.categoria] = (tot[v.esercizio.categoria] ?? 0) + (Number(v.serie) || 1)
  const cats = sortCats(Object.keys(tot))
  return {
    labels: cats,
    datasets: [{ label: 'Serie', data: cats.map((c) => tot[c]), backgroundColor: cats.map(catColor), maxBarThickness: 22 }],
  }
})
const catOpts = {
  indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: true } }, y: { grid: { display: false } } },
  interaction: { mode: 'nearest', intersect: true, axis: 'y' },
}

/* ---------- progressi e record ---------- */

const progress = computed(() => {
  const from = range.value.from
  const rows = []
  for (const [id, h] of history.value) {
    const items = h.filter((v) => (!from || parseISO(v.data) >= from) && (!cat.value || v.esercizio.categoria === cat.value))
    if (!items.length) continue
    const e = items[0].esercizio
    if (e.unita === 'cardio') continue
    const weighted = e.unita === 'rip' && items.some((v) => v.peso_kg > 0)
    const metric = (v) => (weighted ? Number(v.peso_kg ?? 0) : Number(v.ripetizioni ?? 0))
    const first = metric(items[0])
    const last = metric(items[items.length - 1])
    const max = Math.max(...items.map(metric))
    rows.push({
      id, nome: e.nome, categoria: e.categoria, n: new Set(items.map((v) => v.sessione_id)).size,
      first, last, max, weighted, unit: weighted ? 'kg' : e.unita === 'sec' ? 's' : 'rip',
      delta: first > 0 && items.length > 1 ? last / first - 1 : null,
    })
  }
  return rows.sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)).slice(0, 10)
})

// Il calendario copre tutto lo storico (minimo 26, massimo 52 settimane).
const heatWeeks = computed(() => {
  const first = sessions.value.at(-1)
  if (!first) return 26
  const w = Math.ceil((weekStart(today) - weekStart(parseISO(first.data))) / (7 * DAY)) + 1
  return Math.min(52, Math.max(26, w))
})

const records = computed(() =>
  list.value.flatMap((s) => s.voci.filter((v) => v.isPR).map((v) => ({ ...v, data: s.data }))).slice(0, 8),
)
</script>

<template>
  <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>

  <div v-else-if="state.error && !state.loaded" class="card empty">
    <p class="error-text">{{ state.error }}</p>
    <button class="btn" style="margin-top: 12px" @click="load(true)">Riprova</button>
  </div>

  <div v-else-if="!sessions.length" class="card empty stack" style="align-items: center">
    <p style="font-size: 2.4rem; margin: 0">🏋️</p>
    <p style="margin: 0">Nessun allenamento registrato.</p>
    <div v-if="canWrite" class="row" style="justify-content: center">
      <RouterLink to="/importa" class="btn">Importa dal foglio Google</RouterLink>
      <RouterLink to="/allenamenti/nuovo" class="btn btn-primary">Registra un allenamento</RouterLink>
    </div>
  </div>

  <div v-else class="stack" style="gap: 16px">
    <div class="filters">
      <label class="field">
        <span>Periodo</span>
        <select v-model.number="period" class="select">
          <option v-for="p in PERIODS" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Categoria</span>
        <select v-model="cat" class="select">
          <option value="">Tutte</option>
          <option v-for="c in allCats" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
    </div>

    <div v-if="!list.length" class="card empty">
      Nessun allenamento in questo periodo.
      <button class="btn btn-sm" style="margin-left: 8px" @click="period = 0">Mostra tutto</button>
    </div>

    <template v-else>
      <div class="tiles">
        <StatTile label="Allenamenti" :value="kpi.n" :delta="kpi.nDelta" :hint="kpi.nDelta ? 'vs periodo prec.' : `${kpi.exercises} esercizi diversi`" />
        <StatTile label="Frequenza" :value="`${fmtNum(kpi.freq)}/sett.`" :hint="`${kpi.active} settimane attive su ${kpi.span}`" />
        <StatTile label="Volume totale" :value="fmtKg(kpi.vol)" :delta="kpi.volDelta" :hint="kpi.volDelta ? 'vs periodo prec.' : 'serie × rip × kg'" />
        <StatTile label="Volume medio" :value="fmtKg(kpi.volAvg)" hint="per allenamento" />
        <StatTile label="Serie" :value="fmtNum(kpi.serie)" :hint="`${fmtNum(kpi.rip)} ripetizioni`" />
        <StatTile label="Record personali" :value="kpi.prs" hint="nuovi massimi" />
        <StatTile label="Ultimo allenamento" :value="kpi.last ? fmtAgo(kpi.last) : '—'" :hint="kpi.last ? fmtShort(kpi.last) : ''" />
        <StatTile label="Costanza" :value="`${kpi.best} sett.`" hint="miglior serie di settimane di fila" />
      </div>

      <section class="card">
        <h2>Volume per allenamento</h2>
        <p class="muted small sub">Chili sollevati (serie × ripetizioni × peso), divisi per categoria. Gli esercizi a corpo libero non contano.</p>
        <ChartBox :data="volumeChart" :options="volumeOpts" :height="260" label="Volume per allenamento diviso per categoria" />
      </section>

      <div class="two">
        <section class="card">
          <h2>Allenamenti a settimana</h2>
          <ChartBox :data="weeklyChart" :options="weeklyOpts" :height="200" label="Numero di allenamenti per settimana" />
        </section>
        <section class="card">
          <h2>Serie per categoria</h2>
          <ChartBox :data="catChart" :options="catOpts" :height="200" label="Serie totali per categoria" />
        </section>
      </div>

      <section class="card">
        <h2>Calendario</h2>
        <p class="muted small sub">Ultime {{ heatWeeks }} settimane. Più scuro = più volume.</p>
        <WeekHeatmap :sessions="sessions" :weeks="heatWeeks" />
      </section>

      <section class="card">
        <div class="row-between"><h2>Progressi per esercizio</h2><RouterLink to="/esercizi" class="small">Tutti →</RouterLink></div>
        <p class="muted small sub">Dalla prima all'ultima volta nel periodo: peso usato (o ripetizioni/secondi a corpo libero).</p>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Esercizio</th><th class="num">Volte</th><th class="num">Primo → ultimo</th><th class="num">Δ</th><th class="num hide-sm">Max</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in progress" :key="r.id" class="clickable" @click="router.push(`/esercizi/${r.id}`)">
                <td><CatDot :cat="r.categoria" :label="false" /> {{ r.nome }}</td>
                <td class="num">{{ r.n }}</td>
                <td class="num nowrap">{{ fmtNum(r.first) }} → {{ fmtNum(r.last) }} <span class="muted small">{{ r.unit }}</span></td>
                <td class="num nowrap" :class="r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''">{{ fmtPct(r.delta) }}</td>
                <td class="num hide-sm">{{ fmtNum(r.max) }} {{ r.unit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="records.length" class="card">
        <h2>Ultimi record personali 🏆</h2>
        <ul class="records">
          <li v-for="r in records" :key="r.id">
            <span class="muted small nowrap">{{ fmtShort(r.data) }}</span>
            <RouterLink :to="`/esercizi/${r.esercizio_id}`">{{ r.esercizio.nome }}</RouterLink>
            <span class="spacer" />
            <span class="nowrap">{{ fmtVoce(r) }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (min-width: 640px) { .filters { grid-template-columns: 200px 220px; } }
.tiles { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 720px) { .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.two { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 760px) { .two { grid-template-columns: 1fr 1fr; } }
.sub { margin: -4px 0 12px; }
.nowrap { white-space: nowrap; }
.up { color: var(--ok); font-weight: 600; }
.down { color: var(--danger); font-weight: 600; }
.clickable { cursor: pointer; }
.clickable:hover td { background: var(--surface-2); }
.records { list-style: none; margin: 0; padding: 0; }
.records li { display: flex; gap: 10px; align-items: baseline; padding: 7px 0; border-top: 1px solid var(--border); }
.records a { color: var(--text); text-decoration: none; font-weight: 500; }
.table td, .table th { padding: 8px 6px; }
@media (max-width: 480px) { .hide-sm { display: none; } }
</style>
