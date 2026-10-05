<script setup>
import { computed, onMounted, ref } from 'vue'
import { Avatar } from '@shared'
import { totals, useData } from '../store.js'
import { bucketKey, bucketLabel, inRange, parseISO, rangeOf, shiftAnchor, today, trendBuckets } from '../lib/period.js'
import { fmtCompact, fmtMoney, fmtPct } from '../lib/money.js'
import { NONE_COLOR, catColor, isDark, negColor, netColor, posColor } from '../lib/theme.js'
import PeriodBar from '../components/PeriodBar.vue'
import Totals from '../components/Totals.vue'
import ChartBox from '../components/ChartBox.vue'

const { state, movimenti, inPeriod, catById, autoriById, showAutori, firstDate, span, anchor, range, load } = useData()
onMounted(load)

const tipo = ref('out') // out | in
const livello = ref('principale') // principale | secondaria
const focus = ref(null) // categoria evidenziata nel grafico storico ('none' = senza categoria)

const eur = (rows) => rows.filter((m) => m.valuta === 'EUR')
const isTipo = (m) => (tipo.value === 'out' ? m.importo < 0 : m.importo > 0)
const col = computed(() => (livello.value === 'principale' ? 'categoria_id' : 'sottocategoria_id'))
const t = computed(() => totals(inPeriod.value))

/* ---------- per categoria nel periodo ---------- */

function byCat(rows) {
  const map = new Map()
  for (const m of eur(rows)) {
    if (!isTipo(m)) continue
    const k = m[col.value] ?? 'none'
    const x = map.get(k) ?? { key: k, tot: 0, n: 0 }
    x.tot += Math.abs(Number(m.importo))
    x.n++
    map.set(k, x)
  }
  return map
}
const prevRange = computed(() => (span.value === 'all' ? null : rangeOf(span.value, shiftAnchor(span.value, anchor.value, -1))))
const rows = computed(() => {
  const cur = byCat(inPeriod.value)
  const prev = prevRange.value ? byCat(movimenti.value.filter((m) => inRange(m.data, prevRange.value))) : null
  const sum = [...cur.values()].reduce((a, x) => a + x.tot, 0)
  return [...cur.values()]
    .map((x) => {
      const cat = x.key === 'none' ? null : catById.value.get(x.key)
      const p = prev?.get(x.key)?.tot ?? 0
      return {
        ...x,
        cat,
        nome: cat?.nome ?? (livello.value === 'principale' ? 'Senza categoria' : 'Senza secondaria'),
        share: sum ? x.tot / sum : 0,
        delta: prev && p > 0 ? x.tot / p - 1 : null,
      }
    })
    .sort((a, b) => b.tot - a.tot)
})
const maxTot = computed(() => rows.value[0]?.tot ?? 0)
const totTipo = computed(() => (tipo.value === 'out' ? t.value.uscite : t.value.entrate))

/** Giorni del periodo già trascorsi, per la media giornaliera. */
const days = computed(() => {
  const from = range.value.from ?? firstDate.value
  if (!from) return 0
  const to = range.value.to && range.value.to < today() ? range.value.to : today()
  return Math.max(1, Math.round((parseISO(to) - parseISO(from)) / 86400000) + 1)
})

/* ---------- nel tempo ---------- */

const trend = computed(() => trendBuckets(span.value, anchor.value, firstDate.value))
function bucketize(filterFn, valueFn) {
  const { gran, keys } = trend.value
  const idx = new Map(keys.map((k, i) => [k, i]))
  const out = new Map()
  for (const m of eur(movimenti.value)) {
    if (!filterFn(m)) continue
    const i = idx.get(bucketKey(m.data, gran))
    if (i == null) continue
    const k = valueFn(m)
    if (!out.has(k)) out.set(k, Array(keys.length).fill(0))
    out.get(k)[i] += Math.abs(Number(m.importo))
  }
  return out
}
const labels = computed(() => trend.value.keys.map((k) => bucketLabel(k, trend.value.gran)))
const round = (arr) => arr.map((v) => Math.round(v * 100) / 100)

const flowData = computed(() => {
  isDark.value // ricalcola i colori al cambio tema
  const s = bucketize(() => true, (m) => (m.importo > 0 ? 'in' : 'out'))
  const n = trend.value.keys.length
  const inc = s.get('in') ?? Array(n).fill(0)
  const out = s.get('out') ?? Array(n).fill(0)
  return {
    labels: labels.value,
    datasets: [
      { type: 'line', label: 'Netto', data: round(inc.map((v, i) => v - out[i])), borderColor: netColor(), backgroundColor: netColor(), order: 0 },
      { label: 'Entrate', data: round(inc), backgroundColor: posColor(), maxBarThickness: 22, order: 1 },
      { label: 'Uscite', data: round(out), backgroundColor: negColor(), maxBarThickness: 22, order: 1 },
    ],
  }
})

const MAX_SERIES = 7
const catData = computed(() => {
  isDark.value
  const s = bucketize(isTipo, (m) => m[col.value] ?? 'none')
  const name = (k) => (k === 'none' ? 'Senza categoria' : catById.value.get(k)?.nome ?? '?')
  const color = (k) => (k === 'none' ? NONE_COLOR[isDark.value ? 1 : 0] : catColor(catById.value.get(k)))
  const ranked = [...s.entries()].map(([k, arr]) => ({ k, arr, tot: arr.reduce((a, v) => a + v, 0) })).sort((a, b) => b.tot - a.tot)
  let series
  if (focus.value) {
    series = ranked.filter((r) => r.k === focus.value)
  } else {
    series = ranked.slice(0, MAX_SERIES)
    const rest = ranked.slice(MAX_SERIES)
    if (rest.length) series.push({ k: 'rest', arr: rest[0].arr.map((_, i) => rest.reduce((a, r) => a + r.arr[i], 0)), label: `Altre (${rest.length})` })
  }
  return {
    labels: labels.value,
    datasets: series.map((r) => ({
      label: r.label ?? name(r.k),
      data: round(r.arr),
      backgroundColor: r.k === 'rest' ? (isDark.value ? '#4b505a' : '#c4c8cf') : color(r.k),
      stack: 'c',
      maxBarThickness: 36,
    })),
  }
})

const moneyOptions = (stacked = false) => ({
  scales: {
    x: { stacked },
    y: { stacked, ticks: { callback: (v) => `${fmtCompact(v)} €` } },
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${fmtMoney(ctx.raw)}`,
        footer: stacked ? (items) => (items.length > 1 ? `Totale: ${fmtMoney(items.reduce((a, i) => a + i.raw, 0))}` : '') : undefined,
      },
    },
  },
})
const flowOptions = moneyOptions(false)
const catOptions = moneyOptions(true)
const trendTitle = computed(() => ({
  day: 'Ultimi 14 giorni', week: 'Ultime 12 settimane', month: 'Ultimi 12 mesi', year: `Mesi del ${anchor.value.slice(0, 4)}`,
  all: trend.value.gran === 'year' ? 'Per anno' : 'Per mese',
})[span.value])

/* ---------- per persona (spazi condivisi) ---------- */

const people = computed(() => {
  const map = new Map()
  for (const m of eur(inPeriod.value)) {
    const x = map.get(m.owner_id) ?? { id: m.owner_id, out: 0, in: 0, n: 0 }
    m.importo < 0 ? (x.out += -Number(m.importo)) : (x.in += Number(m.importo))
    x.n++
    map.set(m.owner_id, x)
  }
  const list = [...map.values()].sort((a, b) => b.out - a.out)
  const totOut = list.reduce((a, x) => a + x.out, 0)
  const fair = list.length ? totOut / list.length : 0
  return list.map((x) => ({ ...x, a: autoriById.value.get(x.id), share: totOut ? x.out / totOut : 0, diff: x.out - fair }))
})

const toggleFocus = (k) => { focus.value = focus.value === k ? null : k }
function setLevel(l) { livello.value = l; focus.value = null }
function setTipo(v) { tipo.value = v; focus.value = null }
const focusName = computed(() => rows.value.find((r) => r.key === focus.value)?.nome ?? (focus.value === 'none' ? 'Senza categoria' : catById.value.get(focus.value)?.nome))
</script>

<template>
  <div class="stack" style="gap: 14px">
    <PeriodBar />
    <Totals :t="t" />

    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!state.movimenti.length" class="card empty">Ancora nessun movimento: le statistiche compariranno qui.</div>

    <template v-else>
      <div class="row-between">
        <div class="seg" role="radiogroup" aria-label="Tipo">
          <button role="radio" :aria-checked="tipo === 'out'" :class="{ on: tipo === 'out' }" @click="setTipo('out')">Uscite</button>
          <button role="radio" :aria-checked="tipo === 'in'" :class="{ on: tipo === 'in' }" @click="setTipo('in')">Entrate</button>
        </div>
        <div class="seg" role="radiogroup" aria-label="Livello categoria">
          <button role="radio" :aria-checked="livello === 'principale'" :class="{ on: livello === 'principale' }" @click="setLevel('principale')">Principali</button>
          <button role="radio" :aria-checked="livello === 'secondaria'" :class="{ on: livello === 'secondaria' }" @click="setLevel('secondaria')">Secondarie</button>
        </div>
      </div>

      <section class="card stack">
        <div class="row-between">
          <h3 style="margin: 0">{{ tipo === 'out' ? 'Uscite' : 'Entrate' }} per categoria</h3>
          <span class="muted small">{{ fmtMoney(totTipo) }}<template v-if="days > 1"> · {{ fmtMoney(totTipo / days) }}/giorno</template></span>
        </div>
        <p v-if="!rows.length" class="muted" style="margin: 0">Nessuna {{ tipo === 'out' ? 'uscita' : 'entrata' }} nel periodo.</p>
        <ul v-else class="cats">
          <li v-for="r in rows" :key="r.key">
            <button class="cat" :class="{ on: focus === r.key, dim: focus && focus !== r.key }" :aria-pressed="focus === r.key" @click="toggleFocus(r.key)">
              <span class="cat-top">
                <span class="dot" :style="{ background: catColor(r.cat) }" />
                <span class="cat-name">{{ r.nome }}</span>
                <span class="muted small">{{ r.n }}×</span>
                <span class="spacer" />
                <span v-if="r.delta != null" class="delta small" :class="(tipo === 'out' ? r.delta > 0 : r.delta < 0) ? 'bad' : 'good'" :title="'Rispetto al periodo precedente'">
                  {{ r.delta > 0 ? '▲' : '▼' }} {{ fmtPct(Math.abs(r.delta)) }}
                </span>
                <strong class="cat-amt">{{ fmtMoney(r.tot) }}</strong>
              </span>
              <span class="track"><span class="fill" :style="{ width: `${maxTot ? (r.tot / maxTot) * 100 : 0}%`, background: catColor(r.cat) }" /></span>
              <span class="muted small share">{{ fmtPct(r.share) }}</span>
            </button>
          </li>
        </ul>
        <p v-if="rows.length" class="muted small" style="margin: 0">Tocca una categoria per vederne l'andamento.</p>
      </section>

      <section class="card stack">
        <div class="row-between">
          <h3 style="margin: 0">{{ focus ? focusName : (tipo === 'out' ? 'Uscite' : 'Entrate') + ' per categoria' }} nel tempo</h3>
          <span class="muted small">{{ trendTitle }}</span>
        </div>
        <button v-if="focus" class="btn btn-sm" style="align-self: flex-start" @click="focus = null">✕ Tutte le categorie</button>
        <ChartBox type="bar" :data="catData" :options="catOptions" :height="260" :label="`${tipo === 'out' ? 'Uscite' : 'Entrate'} per categoria nel tempo`" />
      </section>

      <section class="card stack">
        <div class="row-between">
          <h3 style="margin: 0">Entrate, uscite e netto</h3>
          <span class="muted small">{{ trendTitle }}</span>
        </div>
        <ChartBox type="bar" :data="flowData" :options="flowOptions" :height="240" label="Entrate, uscite e netto nel tempo" />
      </section>

      <section v-if="showAutori && people.length > 1" class="card stack">
        <h3 style="margin: 0">Chi ha speso cosa</h3>
        <p class="muted small" style="margin: 0">Uscite inserite da ciascuno nel periodo, rispetto a una divisione in parti uguali.</p>
        <ul class="people">
          <li v-for="p in people" :key="p.id">
            <Avatar :name="p.a?.name ?? '?'" :src="p.a?.avatar" :size="26" />
            <span class="grow">{{ p.a?.name ?? 'Utente' }}<span class="muted small"> · {{ fmtPct(p.share) }}</span></span>
            <span class="num">
              <strong>{{ fmtMoney(p.out) }}</strong>
              <span class="small" :class="p.diff > 0 ? 'good' : p.diff < 0 ? 'bad' : 'muted'">
                {{ Math.abs(p.diff) < 0.01 ? 'in pari' : p.diff > 0 ? `+${fmtMoney(p.diff)} rispetto alla quota` : `${fmtMoney(p.diff)} rispetto alla quota` }}
              </span>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--surface-2); border-radius: var(--radius); }
.seg button { border: 0; background: none; padding: 5px 12px; border-radius: 8px; color: var(--muted); font: inherit; font-size: .88rem; font-weight: 500; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.cats { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.cat { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 6px 8px; margin: 0 -8px; width: calc(100% + 16px); border: 0; background: none; color: inherit; font: inherit; text-align: left; border-radius: 8px; cursor: pointer; }
.cat:hover { background: var(--surface-2); }
.cat.on { background: var(--primary-soft); }
.cat.dim { opacity: .55; }
.cat-top { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.cat-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.cat-amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.track { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; align-self: center; }
.fill { display: block; height: 100%; border-radius: 4px; min-width: 2px; }
.share { min-width: 36px; text-align: right; }
.delta { white-space: nowrap; font-weight: 600; }
.good { color: var(--ok); }
.bad { color: var(--danger); }
.people { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.people li { display: flex; align-items: center; gap: 10px; }
.grow { flex: 1; min-width: 0; }
.num { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
</style>
