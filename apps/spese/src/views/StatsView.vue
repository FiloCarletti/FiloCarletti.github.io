<script setup>
import { computed, onMounted, ref } from 'vue'
import { Avatar } from '@shared'
import { totals, useData } from '../store.js'
import { bucketKey, bucketLabel, inRange, parseISO, rangeOf, shiftAnchor, today, trendBuckets } from '../lib/period.js'
import { fmtCompact, fmtMoney, fmtPct } from '../lib/money.js'
import { NONE_COLOR, PALETTE, catColor, isDark, negColor, netColor, posColor } from '../lib/theme.js'
import PeriodBar from '../components/PeriodBar.vue'
import Totals from '../components/Totals.vue'
import ChartBox from '../components/ChartBox.vue'
import Collapsible from '../components/Collapsible.vue'

const { state, movimenti, inPeriod, catById, autoriById, showAutori, conti, firstDate, span, anchor, range, load } = useData()
onMounted(load)

const tipo = ref('out') // out | in
const livello = ref('principale') // principale | secondaria
const focus = ref(null) // categoria evidenziata nel grafico storico ('none' = senza categoria)
const showAll = ref(false)

const eur = (rows) => rows.filter((m) => m.valuta === 'EUR')
const isTipo = (m) => (tipo.value === 'out' ? m.importo < 0 : m.importo > 0)
const col = computed(() => (livello.value === 'principale' ? 'categoria_id' : 'sottocategoria_id'))
const t = computed(() => totals(inPeriod.value))
const tipoLabel = computed(() => (tipo.value === 'out' ? 'Uscite' : 'Entrate'))
const OTHER_COLOR = () => (isDark.value ? '#4b505a' : '#c4c8cf')
const MAX_SLICES = 7 // più "Altre": al massimo 8 colori in un grafico

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
const shownRows = computed(() => (showAll.value ? rows.value : rows.value.slice(0, 10)))

/** Spicchi: le prime 7 voci, il resto in "Altre". */
function slices(list, color) {
  const top = list.slice(0, MAX_SLICES)
  const rest = list.slice(MAX_SLICES)
  const out = top.map((x) => ({ label: x.nome, value: x.tot, color: color(x) }))
  if (rest.length) out.push({ label: `Altre (${rest.length})`, value: rest.reduce((a, x) => a + x.tot, 0), color: OTHER_COLOR() })
  return out
}
const pieData = (list) => ({
  labels: list.map((s) => s.label),
  datasets: [{ data: list.map((s) => Math.round(s.value * 100) / 100), backgroundColor: list.map((s) => s.color) }],
})
const catPie = computed(() => {
  isDark.value
  return pieData(slices(rows.value, (x) => catColor(x.cat)))
})
const pieOptions = {
  cutout: '62%',
  plugins: {
    legend: { display: false }, // la legenda è l'elenco accanto, con nomi e importi
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const tot = ctx.dataset.data.reduce((a, v) => a + v, 0)
          return ` ${fmtMoney(ctx.raw)} · ${fmtPct(tot ? ctx.raw / tot : 0)}`
        },
      },
    },
  },
}

/** Giorni del periodo già trascorsi, per la media giornaliera. */
const days = computed(() => {
  const from = range.value.from ?? firstDate.value
  if (!from) return 0
  const to = range.value.to && range.value.to < today() ? range.value.to : today()
  return Math.max(1, Math.round((parseISO(to) - parseISO(from)) / 86400000) + 1)
})

/* ---------- per conto ---------- */

// Colore stabile per conto (dal più usato in assoluto), così non cambia tra un periodo e l'altro.
const contoColor = (nome) => {
  if (!nome) return NONE_COLOR[isDark.value ? 1 : 0]
  const i = conti.value.indexOf(nome)
  return i > -1 && i < PALETTE.length ? PALETTE[i][isDark.value ? 1 : 0] : OTHER_COLOR()
}
const perConto = computed(() => {
  const map = new Map()
  for (const m of eur(inPeriod.value)) {
    if (!isTipo(m)) continue
    const x = map.get(m.conto) ?? { nome: m.conto, tot: 0, n: 0 }
    x.tot += Math.abs(Number(m.importo))
    x.n++
    map.set(m.conto, x)
  }
  const list = [...map.values()].sort((a, b) => b.tot - a.tot)
  const sum = list.reduce((a, x) => a + x.tot, 0)
  return list.map((x) => ({ ...x, label: x.nome || 'Senza conto', share: sum ? x.tot / sum : 0 }))
})
const contoPie = computed(() => {
  isDark.value
  return pieData(slices(perConto.value.map((x) => ({ ...x, nome: x.label })), (x) => contoColor(x.nome === 'Senza conto' ? '' : x.nome)))
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
    series = ranked.slice(0, MAX_SLICES)
    const rest = ranked.slice(MAX_SLICES)
    if (rest.length) series.push({ k: 'rest', arr: rest[0].arr.map((_, i) => rest.reduce((a, r) => a + r.arr[i], 0)), label: `Altre (${rest.length})` })
  }
  return {
    labels: labels.value,
    datasets: series.map((r) => ({
      label: r.label ?? name(r.k),
      data: round(r.arr),
      backgroundColor: r.k === 'rest' ? OTHER_COLOR() : color(r.k),
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
  return list.map((x, i) => ({
    ...x, a: autoriById.value.get(x.id), share: totOut ? x.out / totOut : 0, diff: x.out - fair,
    color: i < PALETTE.length ? PALETTE[i][isDark.value ? 1 : 0] : OTHER_COLOR(),
  }))
})
const peoplePie = computed(() => pieData(people.value.filter((p) => p.out > 0).map((p) => ({ label: p.a?.name ?? 'Utente', value: p.out, color: p.color }))))

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

      <Collapsible
        :title="`${tipoLabel} per categoria`" storage-key="stats-categorie"
        :subtitle="`${fmtMoney(totTipo)}${days > 1 ? ` · ${fmtMoney(totTipo / days)}/giorno` : ''}`"
      >
        <p v-if="!rows.length" class="muted" style="margin: 0">Nessuna {{ tipo === 'out' ? 'uscita' : 'entrata' }} nel periodo.</p>
        <div v-else class="split">
          <div class="pie">
            <ChartBox type="doughnut" :data="catPie" :options="pieOptions" :height="210" :label="`${tipoLabel} per categoria, grafico a torta`" />
            <div class="pie-center" aria-hidden="true">
              <span class="muted small">{{ tipoLabel }}</span>
              <strong>{{ fmtMoney(totTipo) }}</strong>
            </div>
          </div>
          <div class="stack" style="gap: 6px; min-width: 0">
            <ul class="cats">
              <li v-for="r in shownRows" :key="r.key">
                <button class="cat" :class="{ on: focus === r.key, dim: focus && focus !== r.key }" :aria-pressed="focus === r.key" @click="toggleFocus(r.key)">
                  <span class="cat-top">
                    <span class="dot" :style="{ background: catColor(r.cat) }" />
                    <span class="cat-name">{{ r.nome }}</span>
                    <span class="muted small">{{ r.n }}×</span>
                    <span class="spacer" />
                    <span v-if="r.delta != null" class="delta small" :class="(tipo === 'out' ? r.delta > 0 : r.delta < 0) ? 'bad' : 'good'" title="Rispetto al periodo precedente">
                      {{ r.delta > 0 ? '▲' : '▼' }} {{ fmtPct(Math.abs(r.delta)) }}
                    </span>
                    <strong class="cat-amt">{{ fmtMoney(r.tot) }}</strong>
                  </span>
                  <span class="track"><span class="fill" :style="{ width: `${maxTot ? (r.tot / maxTot) * 100 : 0}%`, background: catColor(r.cat) }" /></span>
                  <span class="muted small share">{{ fmtPct(r.share) }}</span>
                </button>
              </li>
            </ul>
            <button v-if="rows.length > 10" class="btn btn-sm" style="align-self: flex-start" @click="showAll = !showAll">
              {{ showAll ? 'Mostra meno' : `Mostra tutte (${rows.length})` }}
            </button>
            <p class="muted small" style="margin: 0">Tocca una categoria per vederne l'andamento.</p>
          </div>
        </div>
      </Collapsible>

      <Collapsible :title="`${focus ? focusName : tipoLabel + ' per categoria'} nel tempo`" :subtitle="trendTitle" storage-key="stats-trend-categorie">
        <template #aside>
          <button v-if="focus" class="btn btn-sm" @click="focus = null">✕ Tutte</button>
        </template>
        <ChartBox type="bar" :data="catData" :options="catOptions" :height="260" :label="`${tipoLabel} per categoria nel tempo`" />
      </Collapsible>

      <Collapsible title="Entrate, uscite e netto" :subtitle="trendTitle" storage-key="stats-flusso">
        <ChartBox type="bar" :data="flowData" :options="flowOptions" :height="240" label="Entrate, uscite e netto nel tempo" />
      </Collapsible>

      <Collapsible v-if="perConto.length" :title="`${tipoLabel} per conto`" storage-key="stats-conti" :default-open="false">
        <div class="split">
          <div class="pie">
            <ChartBox type="doughnut" :data="contoPie" :options="pieOptions" :height="190" :label="`${tipoLabel} per conto, grafico a torta`" />
          </div>
          <ul class="legend">
            <li v-for="c in perConto" :key="c.nome">
              <span class="dot" :style="{ background: contoColor(c.nome) }" />
              <span class="grow">{{ c.label }} <span class="muted small">{{ c.n }}×</span></span>
              <span class="muted small">{{ fmtPct(c.share) }}</span>
              <strong class="num">{{ fmtMoney(c.tot) }}</strong>
            </li>
          </ul>
        </div>
      </Collapsible>

      <Collapsible v-if="showAutori && people.length > 1" title="Chi ha speso cosa" subtitle="Uscite inserite da ciascuno, rispetto a parti uguali" storage-key="stats-persone">
        <div class="split">
          <div class="pie">
            <ChartBox type="doughnut" :data="peoplePie" :options="pieOptions" :height="170" label="Uscite per persona, grafico a torta" />
          </div>
          <ul class="people">
            <li v-for="p in people" :key="p.id">
              <span class="dot" :style="{ background: p.color }" />
              <Avatar :name="p.a?.name ?? '?'" :src="p.a?.avatar" :size="26" />
              <span class="grow">{{ p.a?.name ?? 'Utente' }}<span class="muted small"> · {{ fmtPct(p.share) }}</span></span>
              <span class="num col">
                <strong>{{ fmtMoney(p.out) }}</strong>
                <span class="small" :class="p.diff > 0 ? 'good' : p.diff < 0 ? 'bad' : 'muted'">
                  {{ Math.abs(p.diff) < 0.01 ? 'in pari' : p.diff > 0 ? `+${fmtMoney(p.diff)} sulla quota` : `${fmtMoney(p.diff)} sulla quota` }}
                </span>
              </span>
            </li>
          </ul>
        </div>
      </Collapsible>
    </template>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--surface-2); border-radius: var(--radius); }
.seg button { border: 0; background: none; padding: 5px 12px; border-radius: 8px; color: var(--muted); font: inherit; font-size: .88rem; font-weight: 500; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.split { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: center; }
@media (min-width: 680px) { .split { grid-template-columns: 240px minmax(0, 1fr); align-items: start; } }
.pie { position: relative; max-width: 260px; width: 100%; margin: 0 auto; }
.pie-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; text-align: center; }
.pie-center strong { font-size: 1.05rem; font-variant-numeric: tabular-nums; }
.cats { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.cat { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 6px 8px; margin: 0 -8px; width: calc(100% + 16px); border: 0; background: none; color: inherit; font: inherit; text-align: left; border-radius: 8px; cursor: pointer; }
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
.legend, .people { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.legend li, .people li { display: flex; align-items: center; gap: 10px; min-width: 0; }
.grow { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.col { display: flex; flex-direction: column; align-items: flex-end; }
</style>
